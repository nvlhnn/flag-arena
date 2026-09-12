import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../server/database.ts';
import { createAnalytics } from '../server/analytics.ts';
import { createCleanup } from '../server/cleanup.ts';
import { initialState } from '../lib/arena.ts';

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'arena-cleanup-'));
  const db = openDatabase(dir), analytics = createAnalytics(db);
  for (const video of ['old', 'replacement', 'current']) {
    if (video === 'replacement') db.linkSession(video, 'old');
    analytics.stream(video, video, 100);
    analytics.vote(video, { id: 'vote', viewerId: 'viewer', viewer: 'Viewer', code: 'ID', text: 'Indonesia', time: 200, points: 3 });
    analytics.donation(video, { id: 'donation', viewerId: 'viewer', name: 'Viewer', time: 250, amountMicros: '1000000', currency: 'USD', comment: 'Hello' });
    db.sql('INSERT INTO legacy_seen VALUES(?,?)').run(video, 'legacy');
    db.save({ demo: initialState(), video,
      live: { ...initialState(), mode: 'live', scores: { ID: 3 }, viewers: { viewer: { xp: 120, lastXpAt: 200 } } },
      subscriberLedger: { streamId: video, known: { viewer: 250 }, pending: {} },
      resume: { chat: video, page: 'token', since: 100 } });
  }
  let current = 'current';
  const cleanup = createCleanup(db, () => current);
  return { db, dir, analytics, cleanup, switchCurrent: (video: string) => { current = video; } };
}

void test('cleanup groups broadcasts and deletes only reviewed sessions, including persisted history', () => {
  const { db, dir, cleanup } = fixture();
  const old = cleanup.list().sessions.find(session => session.id === 'old')!;
  assert.equal(old.broadcasts.length, 2);
  assert.equal(old.votes, 2); assert.equal(old.donations, 2);
  assert.equal(old.viewers, 1);
  assert.ok(cleanup.list().sessions.find(session => session.id === 'current')!.protected);
  const plan = cleanup.preview(['old']);
  assert.deepEqual(cleanup.remove(['old'], plan.token, true), { deleted: 1 });
  for (const table of ['votes', 'donations', 'voter_totals', 'viewer_countries', 'legacy_seen']) {
    assert.equal(db.sql(`SELECT COUNT(*) count FROM ${table} WHERE stream IN ('old','replacement')`).get()!.count, 0);
    assert.equal(db.sql(`SELECT COUNT(*) count FROM ${table} WHERE stream='current'`).get()!.count, 1);
  }
  assert.equal(db.loadLive('old'), undefined);
  assert.equal(db.get('ledger:old'), undefined);
  assert.equal(db.get('checkpoint:replacement'), undefined);
  assert.equal(db.get('session:replacement'), undefined);
  assert.equal(db.load()!.live.scores.ID, 3);
  db.close();
  const reopened = openDatabase(dir);
  try {
    assert.equal(reopened.load()!.video, 'current');
    assert.equal(reopened.loadLive('replacement'), undefined);
    assert.equal(reopened.sql('SELECT COUNT(*) count FROM streams').get()!.count, 1);
  } finally { reopened.close(); }
});

void test('cleanup rejects protected aliases, changed selections, missing confirmation and stale previews', () => {
  const { db, cleanup, analytics, switchCurrent } = fixture();
  try {
    for (const ids of [[], ['missing'], ['old', 'old'], ['current'], 'old']) assert.throws(() => cleanup.preview(ids));
    const plan = cleanup.preview(['old']);
    assert.throws(() => cleanup.remove(['old'], plan.token, false), /confirm/);
    assert.throws(() => cleanup.remove(['old'], 'wrong', true), /changed/);
    analytics.vote('old', { id: 'later', viewerId: 'viewer', viewer: 'Viewer', code: 'ID', text: 'Indonesia', time: 300 });
    assert.throws(() => cleanup.remove(['old'], plan.token, true), /changed/);
    const fresh = cleanup.preview(['old']);
    switchCurrent('replacement');
    assert.throws(() => cleanup.remove(['old'], fresh.token, true), /cannot be deleted/);
    assert.ok(db.loadLive('old'));
    assert.equal(db.sql('SELECT COUNT(*) count FROM streams').get()!.count, 3);
  } finally { db.close(); }
});

void test('a failed cleanup rolls back every table and leaves the session restorable', () => {
  const { db, cleanup } = fixture();
  try {
    db.db.exec("CREATE TRIGGER block_delete BEFORE DELETE ON donations BEGIN SELECT RAISE(ABORT, 'test failure'); END");
    const plan = cleanup.preview(['old']);
    assert.throws(() => cleanup.remove(['old'], plan.token, true), /test failure/);
    assert.equal(cleanup.list().sessions.find(session => session.id === 'old')!.votes, 2);
    assert.ok(db.loadLive('old'));
    assert.ok(db.get('checkpoint:replacement'));
  } finally { db.close(); }
});
