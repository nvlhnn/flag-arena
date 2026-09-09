import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../server/database.ts';
import { createAnalytics } from '../server/analytics.ts';
import { processEvents } from '../server/process-events.ts';
import {
  createExchangeRates,
  convertMicros,
} from '../server/exchange-rates.ts';
import { initialState, type ArenaState } from '../lib/arena.ts';
import { nextMatch } from '../lib/match.ts';
import { definition, type ChatBatch } from '../server/chat-stream.ts';

const vote = (
  id: string,
  viewer = 'alice',
  country = 'Indonesia',
  time = 1000,
) => ({
  id,
  authorDetails: { channelId: viewer, displayName: viewer },
  snippet: {
    type: 1,
    publishedAt: new Date(time).toISOString(),
    textMessageDetails: { messageText: country },
  },
});
const paid = (
  id: string,
  viewer = 'alice',
  time = 1500,
  currency = 'USD',
  amountMicros = '1000000',
) => ({
  id,
  authorDetails: { channelId: viewer, displayName: viewer },
  snippet: {
    type: 15,
    publishedAt: new Date(time).toISOString(),
    superChatDetails: { currency, amountMicros, userComment: 'Hello!' },
  },
});
function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'arena-analytics-'));
  const db = openDatabase(directory),
    analytics = createAnalytics(db);
  analytics.stream('one', 'First', 0);
  analytics.stream('two', 'Second', 0);
  return { db, analytics, directory };
}

void test('whole-stream chat rankings use points, vote-count countries and shared ranks across resets', () => {
  const { db, analytics } = setup();
  try {
    let state: ArenaState = {
      ...initialState(),
      viewers: { alice: { xp: 360, lastXpAt: 0 } },
    };
    state = processEvents(
      analytics,
      'one',
      state,
      {
        items: [
          vote('a'),
          vote('b', 'bob', 'Brazil'),
          vote('c', 'alice', 'USA', 2000),
        ],
      },
      0,
      0,
    ).state;
    let summary = analytics.summary('one');
    assert.equal(summary.voters[0].points, 10);
    assert.equal(summary.voters[0].country, 'US');
    state = nextMatch({ ...state, match: { phase: 'results' } }, true, 2500);
    state = processEvents(
      analytics,
      'one',
      state,
      { items: [vote('d', 'alice', 'Indonesia', 3000)] },
      2500,
      0,
    ).state;
    summary = analytics.summary('one');
    assert.equal(summary.voters[0].points, 11);
    assert.equal(summary.voters[0].country, 'ID');
    assert.equal(state.scores.ID, 1);
    analytics.vote('one', {
      id: 'tie',
      viewerId: 'tied',
      viewer: 'tied',
      code: 'BR',
      text: 'Brazil',
      time: 4000,
      points: 11,
    });
    assert.deepEqual(
      analytics.summary('one').voters.map((v) => v.rank),
      [1, 1, 3],
    );
    assert.deepEqual(analytics.summary('two').voters, []);
  } finally {
    db.close();
  }
});

void test('donations lock historical country, pending waits for valid vote, never add chat points', () => {
  const { db, analytics } = setup();
  try {
    let state = initialState();
    state = processEvents(
      analytics,
      'one',
      state,
      { items: [paid('pending'), vote('ordinary', 'alice', 'hello', 2000)] },
      0,
      0,
    ).state;
    assert.equal(analytics.summary('one').donations[0].country, null);
    processEvents(
      analytics,
      'two',
      initialState(),
      { items: [vote('other', 'alice', 'Brazil', 2200)] },
      0,
      0,
    );
    assert.equal(analytics.summary('one').donations[0].country, null);
    state = processEvents(
      analytics,
      'one',
      state,
      {
        items: [
          vote('first', 'alice', 'Indonesia', 2500),
          vote('second', 'alice', 'Brazil', 3000),
          vote('third', 'alice', 'Brazil', 3500),
          paid('after', 'alice', 4000),
        ],
      },
      0,
      0,
    ).state;
    // Delayed delivery uses votes at event time; earlier donations remain locked.
    state = processEvents(
      analytics,
      'one',
      state,
      { items: [paid('delayed', 'alice', 2700), paid('after', 'alice', 4000)] },
      0,
      0,
    ).state;
    const summary = analytics.summary('one');
    assert.equal(summary.totals.donations, 3);
    assert.equal(summary.voters[0].points, 3);
    assert.deepEqual(
      Object.fromEntries(summary.donations.map((d) => [d.id, d.country])),
      { after: 'BR', delayed: 'ID', pending: 'ID' },
    );
    // Closed matches still record money; chat votes cannot affect finalized scores.
    const result = processEvents(
      analytics,
      'one',
      { ...state, match: { phase: 'results' } },
      {
        items: [
          paid('closed', 'alice', 5000),
          vote('late', 'alice', 'USA', 5001),
        ],
      },
      0,
      0,
    );
    assert.equal(result.accepted, 0);
    assert.equal(analytics.summary('one').totals.donations, 4);
  } finally {
    db.close();
  }
});

void test('database transaction rolls events and checkpoint back together and restores stream states', () => {
  const { db, analytics, directory } = setup();
  const original = initialState();
  db.save({
    demo: original,
    live: original,
    video: 'one',
    resume: { chat: 'chat', since: 0, page: 'before' },
  });
  assert.throws(() =>
    db.transaction(() => {
      const state = processEvents(
        analytics,
        'one',
        original,
        { items: [vote('a')] },
        0,
        0,
      ).state;
      db.save({
        demo: original,
        live: state,
        video: 'one',
        resume: { chat: 'chat', since: 0, page: 'after' },
      });
      throw new Error('disk simulation');
    }),
  );
  assert.equal(db.load()!.resume!.page, 'before');
  assert.equal(analytics.summary('one').voters.length, 0);
  const state = db.transaction(() => {
    const result = processEvents(
      analytics,
      'one',
      original,
      { items: [vote('a')] },
      0,
      0,
    ).state;
    db.save({
      demo: original,
      live: result,
      video: 'one',
      resume: { chat: 'chat', since: 0, page: 'after' },
    });
    return result;
  });
  db.save({ demo: original, live: original, video: 'two' });
  assert.equal(db.loadLive('one')!.scores.ID, 1);
  db.close();
  const reopened = openDatabase(directory);
  try {
    const a = createAnalytics(reopened);
    assert.equal(a.summary('one').voters[0].points, 1);
    assert.equal(
      processEvents(
        a,
        'one',
        { ...state, seen: [] },
        { items: [vote('a')] },
        0,
        0,
      ).accepted,
      0,
    );
  } finally {
    reopened.close();
  }
});

void test('legacy JSON imports once without overwriting its backup or existing database', () => {
  const { db, directory } = setup();
  try {
    const path = join(directory, 'state.json'),
      original = JSON.stringify({
        demo: initialState(),
        live: { ...initialState(), scores: { ID: 77 }, seen: ['legacy-vote'] },
        video: 'old',
      });
    writeFileSync(path, original);
    db.importLegacy(path);
    assert.equal(db.load()!.live.scores.ID, 77);
    assert.equal(createAnalytics(db).hasVote('old', 'legacy-vote'), true);
    writeFileSync(path, 'broken');
    db.importLegacy(path);
    assert.equal(db.load()!.live.scores.ID, 77);
    assert.equal(readFileSync(path, 'utf8'), 'broken');
  } finally {
    db.close();
  }
});

void test('USD conversion preserves original micros, retries failures and freezes historical rates', async () => {
  const { db, analytics } = setup();
  try {
    processEvents(
      analytics,
      'one',
      initialState(),
      {
        items: [
          paid('usd'),
          paid('eur', 'bob', 2000, 'EUR', '1750000'),
          paid('unsupported', 'c', 3000, 'XYZ'),
        ],
      },
      0,
      0,
    );
    let calls = 0,
      fail = true;
    const fx = createExchangeRates(db, async (input) => {
      calls++;
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      assert.doesNotMatch(url, /alice|bob|1750000/);
      return url.includes('/XYZ/') || fail
        ? new Response('{}', { status: 503 })
        : new Response(
            JSON.stringify({
              base: 'EUR',
              quote: 'USD',
              rate: 1.25,
              date: '1970-01-01',
            }),
          );
    });
    await fx.refresh(10000);
    assert.equal(analytics.summary('one').totals.pending, 2);
    fail = false;
    await fx.refresh(400000);
    const summary = analytics.summary('one');
    assert.equal(summary.totals.pending, 1);
    assert.equal(summary.totals.usd_micros, 3187500);
    const eur = summary.donations.find((d) => d.id === 'eur')!;
    assert.equal(eur.amount_micros, '1750000');
    assert.equal(eur.rate, '1.25');
    assert.equal(eur.usd_micros, 2187500);
    const previous = calls;
    await fx.refresh(400001);
    assert.equal(calls, previous);
    assert.equal(convertMicros('1750000', '1.25'), 2187500);
  } finally {
    db.close();
  }
});

void test('all donors and donations are reachable through pagination', () => {
  const { db, analytics } = setup();
  try {
    db.transaction(() => {
      for (let i = 0; i < 105; i++)
        analytics.donation('one', {
          id: String(i),
          viewerId: String(i),
          name: String(i),
          time: i,
          amountMicros: '1000000',
          currency: 'USD',
          comment: '',
        });
    });
    const pages = [0, 1, 2].map((page) => analytics.summary('one', page, page));
    assert.deepEqual(
      pages.map((p) => p.donations.length),
      [50, 50, 5],
    );
    assert.deepEqual(
      pages.map((p) => p.donors.length),
      [50, 50, 5],
    );
    assert.equal(
      new Set(pages.flatMap((p) => p.donations.map((d) => d.id))).size,
      105,
    );
  } finally {
    db.close();
  }
});

void test('official protobuf fields preserve Super Chat uint64 amounts exactly', () => {
  const service = definition[
    'youtube.api.v3.V3DataLiveChatMessageService'
  ] as unknown as {
    StreamList: {
      responseSerialize: (v: ChatBatch) => Buffer;
      responseDeserialize: (v: Buffer) => ChatBatch;
    };
  };
  const batch = {
    items: [paid('wire', 'viewer', 1000, 'IDR', '9007199254740993')],
  };
  assert.deepEqual(
    service.StreamList.responseDeserialize(
      service.StreamList.responseSerialize(batch),
    ),
    batch,
  );
});
