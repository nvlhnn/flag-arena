import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../server/database.ts';
import { createAnalytics } from '../server/analytics.ts';
import { processEvents } from '../server/process-events.ts';
import { prepareConnection } from '../server/session.ts';
import { initialState, acceptVote } from '../lib/arena.ts';
import { ingestSubscribers, type SubscriberLedger } from '../lib/subscribers.ts';

void test('replacement broadcasts share progress across restarts without replaying subscriber bonuses', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arena-session-'));
  let db = openDatabase(dir);
  const live = { ...initialState(), mode: 'live' as const, scores: { ID: 123 },
    match: { phase: 'open' as const, openedAt: 100 },
    viewers: { viewer: { xp: 120, lastXpAt: 100, lastCountry: 'ID', lastVoteAt: 100 } } };
  const ledger: SubscriberLedger = { ownerId: 'channel', streamId: 'old', baselineAt: 0,
    initialized: true, known: { viewer: 100 }, pending: { waiting: { name: 'Waiting', round: 100 } } };
  db.save({ demo: initialState(), live, video: 'old', subscriberLedger: ledger,
    resume: { chat: 'old-chat', page: 'old-token', since: 100 } });
  const input = { video: 'new', previousVideo: 'old', owner: 'channel', previousOwner: 'channel', live, ledger, choice: 'continue' as const };
  const next = prepareConnection(db, input, 200);
  assert.equal(next.resume, undefined);
  assert.deepEqual(next.state.viewers, live.viewers);
  assert.deepEqual(next.state.match, live.match);
  assert.deepEqual(next.ledger?.pending, ledger.pending);
  assert.deepEqual(ingestSubscribers(next.state, next.ledger!, [{ id: 'viewer', name: 'Viewer', publishedAt: 200 }], 300).state.scores, live.scores);
  const voted = acceptVote(next.state, { id: 'new-vote', viewerId: 'viewer', viewer: 'Viewer', text: 'Indonesia', time: 6000 }, 6000).state;
  assert.equal(voted.scores.ID, 126);
  db.transaction(() => {
    db.linkSession('new', 'old');
    db.save({ demo: initialState(), live: voted, video: 'new', subscriberLedger: next.ledger });
  });
  db.close(); db = openDatabase(dir);
  try {
    assert.equal(db.load()!.live.scores.ID, 126);
    assert.equal(db.loadLive('old')!.scores.ID, 126);
    assert.equal(db.loadLive('new')!.viewers!.viewer.xp, 121);
    const analytics = createAnalytics(db);
    analytics.stream('new', 'Replacement', 7000);
    const batch = { items: [6000, 8000].map(time => ({ id: 'chat-' + time,
      authorDetails: { channelId: 'viewer', displayName: 'Viewer' },
      snippet: { type: 1, publishedAt: new Date(time).toISOString(), textMessageDetails: { messageText: 'Indonesia' } } })) };
    const processed = processEvents(analytics, 'new', voted, batch, 7000, 7000, 9000);
    assert.equal(processed.accepted, 1);
    assert.equal(processEvents(analytics, 'new', processed.state, batch, 7000, 7000, 9000).accepted, 0);
    db.linkSession('third', 'new');
    assert.equal(db.sessionFor('third'), 'old');
    const restored = prepareConnection(db, { ...input, video: 'old', previousVideo: 'new', ledger: next.ledger }, 7000);
    assert.equal(restored.state.scores.ID, 126);
    assert.ok(restored.ledger!.known.viewer);
    assert.equal(restored.resume!.page, 'old-token');
  } finally { db.close(); }
});

void test('fresh streams preserve the old session; unsafe or ambiguous continuation is rejected', () => {
  const db = openDatabase(mkdtempSync(join(tmpdir(), 'arena-fresh-')));
  try {
    const live = { ...initialState(), scores: { ID: 55 } };
    const ledger: SubscriberLedger = { ownerId: 'channel', streamId: 'old', baselineAt: 0, known: { viewer: 1 }, pending: {} };
    db.save({ demo: initialState(), live, video: 'old', subscriberLedger: ledger });
    const input = { video: 'new', previousVideo: 'old', owner: 'channel', previousOwner: 'channel', live, ledger };
    assert.throws(() => prepareConnection(db, input), /Choose/);
    assert.throws(() => prepareConnection(db, { ...input, choice: 'continue', owner: 'different' }), /same YouTube channel/);
    const fresh = prepareConnection(db, { ...input, choice: 'fresh' }, 500);
    assert.deepEqual(fresh.state.scores, {});
    assert.deepEqual(fresh.ledger!.known, {});
    db.save({ demo: initialState(), live: fresh.state, video: 'new', subscriberLedger: fresh.ledger });
    assert.equal(db.loadLive('old')!.scores.ID, 55);
    assert.deepEqual(db.loadLive('new')!.scores, {});
    assert.throws(() => db.transaction(() => { db.linkSession('broken', 'old'); throw new Error('rollback'); }), /rollback/);
    assert.equal(db.sessionFor('broken'), 'broken');
  } finally { db.close(); }
});
