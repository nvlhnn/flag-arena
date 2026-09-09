import type { ArenaDatabase } from './database.ts';
import type { ArenaState } from '../lib/arena.ts';
import type { StreamAnalytics } from '../lib/analytics.ts';

export type Donation = {
  id: string;
  viewerId: string;
  name: string;
  time: number;
  amountMicros: string;
  currency: string;
  comment: string;
};
export function createAnalytics(store: ArenaDatabase) {
  const { sql } = store;
  function stream(id: string, title = id, now = Date.now(), partial = false) {
    sql(
      'INSERT INTO streams VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title',
    ).run(id, now, title, Number(partial));
  }
  function country(id: string, viewer: string, at?: number): string | null {
    // Historical lookups also handle delayed donation delivery without using later votes.
    const row =
      at === undefined
        ? sql(
            'SELECT country FROM viewer_countries WHERE stream=? AND viewer_id=? ORDER BY votes DESC,last_vote DESC,country LIMIT 1',
          ).get(id, viewer)
        : sql(
            'SELECT country,COUNT(*) AS votes,MAX(time) AS latest FROM votes WHERE stream=? AND viewer_id=? AND time<=? GROUP BY country ORDER BY votes DESC,latest DESC,country LIMIT 1',
          ).get(id, viewer, at);
    return row ? String(row.country) : null;
  }
  function vote(id: string, vote: ArenaState['recent'][number]) {
    const inserted = sql(
      'INSERT OR IGNORE INTO votes VALUES(?,?,?,?,?,?,?)',
    ).run(
      id,
      vote.id,
      vote.viewerId,
      vote.viewer,
      vote.code,
      vote.points ?? 1,
      vote.time,
    );
    if (!inserted.changes) return false;
    sql(
      'INSERT INTO voter_totals VALUES(?,?,?,?,1) ON CONFLICT(stream,viewer_id) DO UPDATE SET name=excluded.name,points=points+excluded.points,votes=votes+1',
    ).run(id, vote.viewerId, vote.viewer, vote.points ?? 1);
    sql(
      'INSERT INTO viewer_countries VALUES(?,?,?,1,?) ON CONFLICT(stream,viewer_id,country) DO UPDATE SET votes=votes+1,last_vote=MAX(last_vote,excluded.last_vote)',
    ).run(id, vote.viewerId, vote.code, vote.time);
    // Assignment is locked once set. Only this stream's unassigned donations qualify.
    const pending = sql(
      'SELECT id,time FROM donations WHERE stream=? AND viewer_id=? AND country IS NULL',
    ).all(id, vote.viewerId);
    for (const donation of pending) {
      const before = country(id, vote.viewerId, Number(donation.time));
      const next = sql(
        'SELECT time FROM votes WHERE stream=? AND viewer_id=? AND time>=? ORDER BY time LIMIT 1',
      ).get(id, vote.viewerId, Number(donation.time));
      const chosen =
        before ?? (next ? country(id, vote.viewerId, Number(next.time)) : null);
      if (chosen)
        sql(
          'UPDATE donations SET country=? WHERE stream=? AND id=? AND country IS NULL',
        ).run(chosen, id, String(donation.id));
    }
    return true;
  }
  function donation(id: string, event: Donation) {
    if (
      !/^\d+$/.test(event.amountMicros) ||
      BigInt(event.amountMicros) <= BigInt(0) ||
      !/^([A-Z]{3})$/.test(event.currency)
    )
      throw new Error('Invalid Super Chat amount or currency');
    const before = country(id, event.viewerId, event.time);
    const next = before
      ? undefined
      : sql(
          'SELECT time FROM votes WHERE stream=? AND viewer_id=? AND time>=? ORDER BY time LIMIT 1',
        ).get(id, event.viewerId, event.time);
    const chosen =
      before ?? (next ? country(id, event.viewerId, Number(next.time)) : null);
    // Retain integer micros as text so protobuf uint64 values never lose precision.
    sql(
      'INSERT OR IGNORE INTO donations(stream,id,viewer_id,name,time,amount_micros,currency,comment,country) VALUES(?,?,?,?,?,?,?,?,?)',
    ).run(
      id,
      event.id,
      event.viewerId,
      event.name,
      event.time,
      event.amountMicros,
      event.currency,
      event.comment,
      chosen,
    );
  }
  function summary(
    id: string,
    donorPage = 0,
    donationPage = 0,
  ): StreamAnalytics {
    const donors = sql(
      `SELECT viewer_id,MAX(name) name,COUNT(*) donations,COALESCE(SUM(usd_micros),0) usd_micros,SUM(usd_micros IS NULL) pending FROM donations WHERE stream=? GROUP BY viewer_id ORDER BY usd_micros DESC,viewer_id LIMIT 51 OFFSET ?`,
    ).all(id, donorPage * 50);
    const donations = sql(
      'SELECT * FROM donations WHERE stream=? ORDER BY time DESC,id LIMIT 51 OFFSET ?',
    ).all(id, donationPage * 50);
    const voters = sql(
      `SELECT * FROM (SELECT *,RANK() OVER(ORDER BY points DESC) rank FROM voter_totals WHERE stream=?) WHERE rank<=5 ORDER BY rank,viewer_id LIMIT 5`,
    )
      .all(id)
      .map((row) => ({ ...row, country: country(id, String(row.viewer_id)) }));
    return {
      stream: sql('SELECT * FROM streams WHERE id=?').get(id) ?? null,
      voters,
      donors: donors.slice(0, 50),
      countries: sql(
        'SELECT country,COUNT(*) donations,COALESCE(SUM(usd_micros),0) usd_micros,SUM(usd_micros IS NULL) pending FROM donations WHERE stream=? GROUP BY country ORDER BY usd_micros DESC,country',
      ).all(id),
      donations: donations.slice(0, 50),
      totals: sql(
        'SELECT COUNT(*) donations,COALESCE(SUM(usd_micros),0) usd_micros,COALESCE(SUM(usd_micros IS NULL),0) pending FROM donations WHERE stream=?',
      ).get(id),
      donorPage,
      donationPage,
      hasMoreDonors: donors.length > 50,
      hasMoreDonations: donations.length > 50,
    } as unknown as StreamAnalytics;
  }
  return {
    stream,
    vote,
    donation,
    country,
    summary,
    hasVote: (stream: string, id: string) =>
      !!sql(
        'SELECT 1 FROM votes WHERE stream=? AND id=? UNION ALL SELECT 1 FROM legacy_seen WHERE stream=? AND id=? LIMIT 1',
      ).get(stream, id, stream, id),
    streams: () =>
      sql('SELECT * FROM streams ORDER BY tracked_from DESC').all(),
  };
}
export type Analytics = ReturnType<typeof createAnalytics>;
