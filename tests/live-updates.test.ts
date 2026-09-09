import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, acceptVote } from '../lib/arena.ts';
import { liveUpdate, mergeLiveUpdate } from '../lib/live-updates.ts';
import { ingestSubscribers } from '../lib/subscribers.ts';

void test('compact updates merge without duplicates and reset with the server', () => {
  const original = initialState();
  const first = acceptVote(original, {
    id: 'first',
    viewerId: 'v',
    viewer: 'v',
    time: 1000,
    text: 'Indonesia',
  }).state;
  const second = acceptVote(first, {
    id: 'second',
    viewerId: 'v',
    viewer: 'v',
    time: 2000,
    text: 'Brazil',
  }).state;
  const delta = liveUpdate(second, first);
  assert.equal(delta.recent.length, 1);
  assert.deepEqual(mergeLiveUpdate(first, delta), second);
  // A newly connected client may already have this update in its initial snapshot.
  assert.deepEqual(mergeLiveUpdate(second, delta), second);
  assert.deepEqual(
    mergeLiveUpdate(second, liveUpdate(original, second)),
    original,
  );
  assert.equal(
    mergeLiveUpdate(second, liveUpdate(second, second)).recent,
    second.recent,
  );
  assert.deepEqual(
    mergeLiveUpdate(second, liveUpdate(first, second, true)),
    first,
  );
});
void test('subscriber country remains available after its vote leaves the visual buffer', () => {
  let state = acceptVote(initialState(), {
    id: 'first',
    viewerId: 'early',
    viewer: 'early',
    time: 1000,
    text: 'Indonesia',
  }).state;
  state = { ...state, recent: [] };
  const result = ingestSubscribers(
    state,
    { ownerId: 'owner', baselineAt: 0, known: {}, pending: {} },
    [{ id: 'early', name: 'early', publishedAt: 2000 }],
    2000,
  );
  assert.equal(result.state.scores.ID, 51);
  assert.deepEqual(result.ledger.pending, {});
});
