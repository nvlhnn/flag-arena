import { mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { openDatabase } from '../server/database.ts';
import { createAnalytics } from '../server/analytics.ts';
import { processEvents } from '../server/process-events.ts';
import { initialState, type ArenaState } from '../lib/arena.ts';

const directory = mkdtempSync(join(tmpdir(), 'arena-benchmark-')),
  db = openDatabase(directory),
  analytics = createAnalytics(db);
analytics.stream('benchmark', 'Synthetic performance test', 0);
const demo = initialState();
let state: ArenaState = initialState(),
  sequence = 0;
const histogram = monitorEventLoopDelay({ resolution: 10 });
histogram.enable();
function batch(size: number) {
  const started = performance.now();
  const items = Array.from({ length: size }, () => {
    const id = sequence++;
    return {
      id: String(id),
      authorDetails: {
        channelId: 'viewer-' + (id % 5000),
        displayName: 'Viewer ' + (id % 5000),
      },
      snippet: {
        type: 1,
        publishedAt: new Date(id * 200).toISOString(),
        textMessageDetails: { messageText: id % 2 ? 'Indonesia' : 'Brazil' },
      },
    };
  });
  db.transaction(() => {
    state = processEvents(
      analytics,
      'benchmark',
      state,
      { items },
      0,
      0,
      Date.now(),
    ).state;
    db.save({
      demo,
      live: state,
      video: 'benchmark',
      resume: { chat: 'benchmark', since: 0, page: String(sequence) },
    });
  });
  return performance.now() - started;
}
const report = (label: string, times: number[]) => {
  const sorted = [...times].sort((a, b) => a - b);
  return {
    label,
    batches: times.length,
    p50Ms: +sorted[Math.floor(times.length * 0.5)].toFixed(2),
    p95Ms: +sorted[Math.floor(times.length * 0.95)].toFixed(2),
    maxMs: +Math.max(...times).toFixed(2),
  };
};
try {
  const accelerated: number[] = [];
  const start = performance.now();
  for (let i = 0; i < 2880; i++) {
    accelerated.push(batch(50));
    if (i % 20 === 0) await delay(0);
  }
  console.log(
    JSON.stringify({
      ...report(
        '8 hours of history: 144,000 votes / 5,000 viewers, accelerated',
        accelerated,
      ),
      elapsedSeconds: +((performance.now() - start) / 1000).toFixed(2),
    }),
  );
  const paced: number[] = [];
  let next = performance.now();
  for (let i = 0; i < 300; i++) {
    paced.push(batch(1));
    next += 200;
    await delay(Math.max(0, next - performance.now()));
  }
  console.log(
    JSON.stringify(
      report('5 messages/sec for 60 seconds with history loaded', paced),
    ),
  );
  const burst: number[] = [];
  next = performance.now();
  for (let i = 0; i < 500; i++) {
    burst.push(batch(1));
    next += 20;
    await delay(Math.max(0, next - performance.now()));
  }
  console.log(JSON.stringify(report('50 messages/sec for 10 seconds', burst)));
  const queryStart = performance.now();
  analytics.summary('benchmark');
  const queryMs = performance.now() - queryStart;
  const replay = processEvents(
    analytics,
    'benchmark',
    { ...state, seen: [] },
    {
      items: [
        {
          id: '0',
          authorDetails: { channelId: 'viewer-0', displayName: 'Viewer 0' },
          snippet: {
            type: 1,
            publishedAt: new Date(0).toISOString(),
            textMessageDetails: { messageText: 'Brazil' },
          },
        },
      ],
    },
    0,
    0,
  );
  if (replay.accepted !== 0) throw new Error('Durable duplicate check failed');
  const count = db.sql('SELECT COUNT(*) count FROM votes').get()!.count;
  if (count !== sequence) throw new Error('Lost votes');
  db.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  console.log(
    JSON.stringify({
      recordedVotes: count,
      analyticsQueryMs: +queryMs.toFixed(2),
      eventLoopP95Ms: +(histogram.percentile(95) / 1e6).toFixed(2),
      heapMB: +(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1),
      databaseMB: +(
        statSync(join(directory, 'arena.sqlite')).size /
        1024 /
        1024
      ).toFixed(1),
    }),
  );
} finally {
  histogram.disable();
  db.close();
}
