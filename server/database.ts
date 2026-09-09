import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ArenaState } from '../lib/arena.ts';

export type SavedArena = {
  demo: ArenaState;
  live: ArenaState;
  video: string;
  resume?: { chat: string; page?: string; since: number };
  activeMode?: 'demo' | 'live';
  audio?: unknown;
  subscriberLedger?: unknown;
  videoOwner?: string;
};

export function openDatabase(directory: string) {
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(join(directory, 'arena.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;
 CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS runtime_viewers(mode TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(mode,id));
 CREATE TABLE IF NOT EXISTS streams(id TEXT PRIMARY KEY,tracked_from INTEGER NOT NULL,title TEXT NOT NULL,partial INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS legacy_seen(stream TEXT NOT NULL,id TEXT NOT NULL,PRIMARY KEY(stream,id));
 CREATE TABLE IF NOT EXISTS votes(stream TEXT NOT NULL,id TEXT NOT NULL,viewer_id TEXT NOT NULL,name TEXT NOT NULL,country TEXT NOT NULL,points INTEGER NOT NULL,time INTEGER NOT NULL,PRIMARY KEY(stream,id));
 CREATE INDEX IF NOT EXISTS idx_votes_viewer_time ON votes(stream,viewer_id,time,country);
 CREATE TABLE IF NOT EXISTS voter_totals(stream TEXT NOT NULL,viewer_id TEXT NOT NULL,name TEXT NOT NULL,points INTEGER NOT NULL,votes INTEGER NOT NULL,PRIMARY KEY(stream,viewer_id));
 CREATE INDEX IF NOT EXISTS idx_voter_points ON voter_totals(stream,points DESC,viewer_id);
 CREATE TABLE IF NOT EXISTS viewer_countries(stream TEXT NOT NULL,viewer_id TEXT NOT NULL,country TEXT NOT NULL,votes INTEGER NOT NULL,last_vote INTEGER NOT NULL,PRIMARY KEY(stream,viewer_id,country));
 CREATE TABLE IF NOT EXISTS donations(stream TEXT NOT NULL,id TEXT NOT NULL,viewer_id TEXT NOT NULL,name TEXT NOT NULL,time INTEGER NOT NULL,amount_micros TEXT NOT NULL,currency TEXT NOT NULL,comment TEXT NOT NULL,country TEXT,usd_micros INTEGER,rate TEXT,rate_date TEXT,converted_at INTEGER,PRIMARY KEY(stream,id));
 CREATE INDEX IF NOT EXISTS idx_donations_viewer ON donations(stream,viewer_id,time);
 CREATE INDEX IF NOT EXISTS idx_donations_country ON donations(stream,country);
 CREATE INDEX IF NOT EXISTS idx_donations_time ON donations(stream,time DESC,id);
 CREATE INDEX IF NOT EXISTS idx_donations_pending ON donations(currency,time) WHERE usd_micros IS NULL;
 CREATE TABLE IF NOT EXISTS exchange_rates(currency TEXT NOT NULL,requested_date TEXT NOT NULL,rate TEXT NOT NULL,rate_date TEXT NOT NULL,fetched_at INTEGER NOT NULL,PRIMARY KEY(currency,requested_date));
 PRAGMA user_version=1; PRAGMA optimize;`);
  const statements = new Map<string, StatementSync>();
  const sql = (query: string) => {
    let statement = statements.get(query);
    if (!statement) {
      statement = db.prepare(query);
      statements.set(query, statement);
    }
    return statement;
  };
  let depth = 0;
  let previous: SavedArena | undefined;
  function transaction<T>(fn: () => T): T {
    if (depth) return fn();
    const committed = previous;
    db.exec('BEGIN IMMEDIATE');
    depth++;
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      previous = committed;
      throw error;
    } finally {
      depth--;
    }
  }
  function get<T>(key: string): T | undefined {
    const row = sql('SELECT value FROM settings WHERE key=?').get(key);
    return row ? JSON.parse(String(row.value)) : undefined;
  }
  function set(key: string, value: unknown) {
    sql(
      'INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE value<>excluded.value',
    ).run(key, JSON.stringify(value));
  }
  // Viewer progress is normalized: growing viewer maps are not serialized on every save.
  function save(saved: SavedArena) {
    transaction(() => {
      const { demo: _demo, live: _live, ...metadata } = saved;
      for (const mode of ['demo', 'live'] as const) {
        const key = mode === 'live' ? 'live:' + saved.video : 'demo';
        const state = saved[mode],
          old =
            mode === 'live' && previous?.video !== saved.video
              ? undefined
              : previous?.[mode];
        if (state === old) continue;
        const { viewers, ...small } = state;
        set(key, small);
        if (viewers !== old?.viewers) {
          if (!old || !Object.keys(viewers ?? {}).length)
            sql('DELETE FROM runtime_viewers WHERE mode=?').run(key);
          for (const [id, value] of Object.entries(viewers ?? {}))
            if (value !== old?.viewers?.[id])
              sql(
                'INSERT INTO runtime_viewers VALUES(?,?,?) ON CONFLICT(mode,id) DO UPDATE SET value=excluded.value',
              ).run(key, id, JSON.stringify(value));
        }
      }
      // Subscriber history only changes when the ledger changes.
      const { subscriberLedger, ...rest } = metadata;
      set('metadata', rest);
      if (saved.video)
        set('checkpoint:' + saved.video, {
          resume: saved.resume,
          videoOwner: saved.videoOwner,
        });
      if (subscriberLedger !== previous?.subscriberLedger)
        set('subscriberLedger', subscriberLedger ?? null);
    });
    // An enclosing transaction restores this cache on rollback.
    previous = saved;
  }
  function loadState(key: string): ArenaState | undefined {
    const state = get<ArenaState>(key);
    if (!state) return undefined;
    state.viewers = Object.fromEntries(
      sql('SELECT id,value FROM runtime_viewers WHERE mode=?')
        .all(key)
        .map((row) => [String(row.id), JSON.parse(String(row.value))]),
    );
    return state;
  }
  function load(): SavedArena | undefined {
    const metadata = get<Omit<SavedArena, 'demo' | 'live'>>('metadata');
    if (!metadata) return undefined;
    const result = {
      ...metadata,
      subscriberLedger: get('subscriberLedger'),
    } as SavedArena;
    for (const mode of ['demo', 'live'] as const) {
      const state = loadState(
        mode === 'live' ? 'live:' + result.video : 'demo',
      );
      if (!state) throw new Error('Incomplete database state');
      result[mode] = state;
    }
    previous = result;
    return result;
  }
  function importLegacy(path: string) {
    if (get('metadata') || !existsSync(path)) return;
    const read = (file: string) => {
      const saved = JSON.parse(readFileSync(file, 'utf8')) as SavedArena;
      for (const state of [saved.demo, saved.live])
        if (
          !state?.scores ||
          !Array.isArray(state.recent) ||
          !Array.isArray(state.seen) ||
          !state.cooldowns ||
          Object.values(state.scores).some((n) => !Number.isFinite(n) || n < 0)
        )
          throw new Error('Invalid legacy state');
      return saved;
    };
    let saved: SavedArena;
    try {
      saved = read(path);
    } catch {
      saved = read(path + '.backup');
      copyFileSync(path, path + '.unreadable-' + Date.now());
    }
    transaction(() => {
      save(saved);
      if (saved.video)
        for (const id of saved.live.seen)
          sql('INSERT OR IGNORE INTO legacy_seen VALUES(?,?)').run(
            saved.video,
            id,
          );
      set('legacyImportedAt', Date.now());
    });
  }
  return {
    db,
    sql,
    transaction,
    get,
    set,
    save,
    load,
    loadLive: (id: string) => loadState('live:' + id),
    importLegacy,
    invalidate: () => {
      previous = undefined;
    },
    close: () => db.close(),
  };
}
export type ArenaDatabase = ReturnType<typeof openDatabase>;
