import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  subscriberRequest,
  scanSubscribers,
} from '../server/subscriber-reader.ts';
import { initialState, acceptVote } from '../lib/arena.ts';
import {
  ingestSubscribers,
  type SubscriberLedger,
} from '../lib/subscribers.ts';
import { openDatabase } from '../server/database.ts';

const item = (id: string, time = 2000) => ({
  subscriberSnippet: { channelId: id, title: id },
  snippet: { publishedAt: new Date(time).toISOString() },
});
const response = (ids: string[], next?: string) =>
  new Response(
    JSON.stringify({ items: ids.map((id) => item(id)), nextPageToken: next }),
  );
const ledger = (): SubscriberLedger => ({
  ownerId: 'owner',
  baselineAt: 1000,
  initialized: true,
  known: {},
  pending: {},
});
function harness() {
  let saved = ledger();
  return {
    get: () => saved,
    set: (next: SubscriberLedger) => {
      saved = next;
    },
    commit: (
      page: { records: { id: string }[] },
      jobs: NonNullable<SubscriberLedger['scanJobs']>,
      baseline: boolean,
    ) => {
      saved = {
        ...saved,
        initialized: true,
        scanJobs: jobs,
        known: {
          ...saved.known,
          ...Object.fromEntries(
            page.records.map((record) => [record.id, 3000]),
          ),
        },
      };
      if (baseline) saved.baselineAt = 3000;
      return true;
    },
  };
}

void test('more than 500 subscribers catches up over bounded cycles while checking newest first', async () => {
  const original = globalThis.fetch,
    h = harness();
  let calls = 0;
  try {
    globalThis.fetch = async (input) => {
      calls++;
      const url = new URL(String(input)),
        offset = Number(url.searchParams.get('pageToken') ?? 0);
      return response(
        Array.from({ length: Math.min(50, 650 - offset) }, (_, i) =>
          String(offset + i),
        ),
        offset + 50 < 650 ? String(offset + 50) : undefined,
      );
    };
    for (let cycle = 0; cycle < 12; cycle++) {
      const before = calls;
      await scanSubscribers('test', () => {}, h.get, h.commit);
      assert.equal(calls - before, 2);
    }
    assert.equal(Object.keys(h.get().known).length, 650);
    assert.deepEqual(h.get().scanJobs, []);
    const before = calls;
    await scanSubscribers('test', () => {}, h.get, h.commit);
    assert.equal(calls - before, 1);
  } finally {
    globalThis.fetch = original;
  }
});
void test('newest subscribers stay visible during backlog and mixed pages do not stop catch-up', async () => {
  const original = globalThis.fetch,
    h = harness();
  const pages: string[] = [];
  let cycle = 0;
  try {
    globalThis.fetch = async (input) => {
      const token =
        new URL(String(input)).searchParams.get('pageToken') ?? 'head';
      pages.push(token);
      if (token === 'head')
        return response(cycle ? ['fresh', 'old'] : ['old'], 'p2');
      if (token === 'p2') return response(['older'], 'p3');
      return response(['old', 'delayed']);
    };
    await scanSubscribers('test', () => {}, h.get, h.commit);
    cycle++;
    await scanSubscribers('test', () => {}, h.get, h.commit);
    assert.deepEqual(pages, ['head', 'p2', 'head', 'p3']);
    assert.ok(h.get().known.fresh);
    assert.ok(h.get().known.delayed);
  } finally {
    globalThis.fetch = original;
  }
});
void test('a failed catch-up request preserves the committed page and cursor across SQLite restart', async () => {
  const original = globalThis.fetch,
    dir = mkdtempSync(join(tmpdir(), 'subscriber-scan-'));
  let db = openDatabase(dir),
    saved = ledger(),
    state = acceptVote(initialState(), {
      id: 'v',
      viewerId: 'new',
      viewer: 'New',
      text: 'Indonesia',
      time: 1500,
    }).state;
  const commit = (
    page: Parameters<ReturnType<typeof harness>['commit']>[0] & {
      records: Parameters<typeof ingestSubscribers>[2];
    },
    jobs: NonNullable<SubscriberLedger['scanJobs']>,
  ) => {
    const result = ingestSubscribers(state, saved, page.records, 3000);
    state = result.state;
    saved = { ...result.ledger, scanJobs: jobs };
    db.save({
      demo: initialState(),
      live: state,
      video: 'stream',
      subscriberLedger: saved,
    });
    return true;
  };
  try {
    globalThis.fetch = async (input) =>
      new URL(String(input)).searchParams.has('pageToken')
        ? new Response('{}', { status: 503 })
        : response(['new'], 'next');
    await assert.rejects(() =>
      scanSubscribers(
        'test',
        () => {},
        () => saved,
        commit,
      ),
    );
    assert.equal(state.scores.ID, 51);
    db.close();
    db = openDatabase(dir);
    saved = db.load()!.subscriberLedger as SubscriberLedger;
    state = db.load()!.live;
    assert.deepEqual(saved.scanJobs, [{ page: 'next' }]);
    const pages: string[] = [];
    globalThis.fetch = async (input) => {
      const page =
        new URL(String(input)).searchParams.get('pageToken') ?? 'head';
      pages.push(page);
      return page === 'head'
        ? response(['new'], 'next')
        : response(['caught-up']);
    };
    await scanSubscribers(
      'test',
      () => {},
      () => saved,
      commit,
    );
    assert.deepEqual(pages, ['head', 'next']);
    assert.equal(state.scores.ID, 51);
    assert.deepEqual(saved.scanJobs, []);
  } finally {
    globalThis.fetch = original;
    db.close();
  }
});
void test('first snapshot is a baseline and does not scan or reward existing subscribers', async () => {
  const original = globalThis.fetch,
    h = harness();
  h.set({ ...ledger(), initialized: false });
  let calls = 0;
  try {
    globalThis.fetch = async () => {
      calls++;
      return response(['existing'], 'older');
    };
    await scanSubscribers('test', () => {}, h.get, h.commit);
    assert.equal(calls, 1);
    assert.ok(h.get().initialized);
    assert.deepEqual(h.get().scanJobs, []);
  } finally {
    globalThis.fetch = original;
  }
});
void test('invalid saved cursors restart catch-up without disabling tracking', async () => {
  const original = globalThis.fetch,
    h = harness();
  h.set({
    ...ledger(),
    known: { known: 3000 },
    scanJobs: [{ page: 'expired' }],
  });
  try {
    globalThis.fetch = async (input) =>
      new URL(String(input)).searchParams.get('pageToken') === 'expired'
        ? new Response(
            JSON.stringify({
              error: { errors: [{ reason: 'invalidPageToken' }] },
            }),
            { status: 400 },
          )
        : response(['known'], 'fresh-cursor');
    await scanSubscribers('test', () => {}, h.get, h.commit);
    assert.deepEqual(h.get().scanJobs, [{ page: 'fresh-cursor', full: true }]);
  } finally {
    globalThis.fetch = original;
  }
});
void test('temporary and rate-limit errors retry but quota and permission errors do not', async () => {
  const original = globalThis.fetch;
  try {
    for (const status of [500, 503, 403, 429, 401]) {
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({
            error: {
              errors: [
                { reason: status === 403 ? 'quotaExceeded' : 'unknown' },
              ],
            },
          }),
          { status },
        );
      await assert.rejects(
        () => subscriberRequest('subscriptions', {}, 'test', () => {}),
        (error: unknown) =>
          (error as { retryable: boolean }).retryable ===
          (status >= 500 || status === 429),
      );
    }
  } finally {
    globalThis.fetch = original;
  }
});
void test('catch-up from an older match does not award or queue a new-match bonus', () => {
  const result = ingestSubscribers(
    { ...initialState(), match: { phase: 'open', openedAt: 4000 } },
    ledger(),
    [{ id: 'older', name: 'Older', publishedAt: 2000 }],
    5000,
  );
  assert.deepEqual(result.state.scores, {});
  assert.deepEqual(result.ledger.pending, {});
  assert.equal(result.state.subscriberAlerts?.[0].points, 0);
});
