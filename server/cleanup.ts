import { createHash } from 'node:crypto';
import type { ArenaDatabase } from './database.ts';
import type { ArenaState } from '../lib/arena.ts';

export function createCleanup(database: ArenaDatabase, currentVideo: () => string) {
  function list() {
    const current = currentVideo() ? database.sessionFor(currentVideo()) : '';
    const groups = new Map<string, { id: string; title: string; protected: boolean;
      broadcasts: { id: string; title: string; startedAt: number }[];
      votes: number; donations: number; viewers: number; points: number }>();
    const counts = (table: string) => new Map(database.sql(`SELECT stream,COUNT(*) count FROM ${table} GROUP BY stream`).all().map(row => [String(row.stream), Number(row.count)]));
    const votes = counts('votes'), donations = counts('donations');
    for (const row of database.sql('SELECT * FROM streams ORDER BY tracked_from DESC,id').all()) {
      const video = String(row.id), id = database.sessionFor(video);
      let group = groups.get(id);
      if (!group) {
        const state = database.get<ArenaState>('live:' + id);
        group = { id, title: String(row.title), protected: id === current, broadcasts: [],
          votes: 0, donations: 0, points: Object.values(state?.scores ?? {}).reduce((a, b) => a + b, 0),
          viewers: Number(database.sql('SELECT COUNT(*) count FROM runtime_viewers WHERE mode=?').get('live:' + id)!.count) };
        groups.set(id, group);
      }
      group.broadcasts.push({ id: video, title: String(row.title), startedAt: Number(row.tracked_from) });
      group.votes += votes.get(video) ?? 0;
      group.donations += donations.get(video) ?? 0;
    }
    const pageSize = Number(database.sql('PRAGMA page_size').get()!.page_size);
    return { sessions: [...groups.values()], databaseBytes: Number(database.sql('PRAGMA page_count').get()!.page_count) * pageSize,
      reusableBytes: Number(database.sql('PRAGMA freelist_count').get()!.freelist_count) * pageSize };
  }
  function preview(ids: unknown) {
    if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some(id => typeof id !== 'string') || new Set(ids).size !== ids.length)
      throw new Error('Select between 1 and 100 different sessions.');
    const available = new Map(list().sessions.map(session => [session.id, session]));
    const sessions = (ids as string[]).slice().sort().map(id => {
      const session = available.get(id);
      if (!session) throw new Error('A selected session no longer exists. Refresh the list.');
      if (session.protected) throw new Error('The current or last connected session cannot be deleted.');
      return session;
    });
    const token = createHash('sha256').update(JSON.stringify(sessions)).digest('hex');
    return { sessions, token };
  }
  function remove(ids: unknown, token: unknown, confirmed: unknown) {
    if (confirmed !== true || typeof token !== 'string') throw new Error('Review and confirm the selected sessions first.');
    const result = database.transaction(() => {
      const plan = preview(ids);
      if (plan.token !== token) throw new Error('Selected session data changed. Review cleanup again.');
      for (const session of plan.sessions) {
        for (const broadcast of session.broadcasts) {
          for (const table of ['votes', 'voter_totals', 'viewer_countries', 'donations', 'legacy_seen'])
            database.sql(`DELETE FROM ${table} WHERE stream=?`).run(broadcast.id);
          database.sql('DELETE FROM streams WHERE id=?').run(broadcast.id);
          for (const prefix of ['checkpoint:', 'session:'])
            database.sql('DELETE FROM settings WHERE key=?').run(prefix + broadcast.id);
        }
        database.sql('DELETE FROM runtime_viewers WHERE mode=?').run('live:' + session.id);
        for (const prefix of ['live:', 'ledger:'])
          database.sql('DELETE FROM settings WHERE key=?').run(prefix + session.id);
      }
      return { deleted: plan.sessions.length };
    });
    database.invalidate();
    return result;
  }
  return { list, preview, remove };
}
