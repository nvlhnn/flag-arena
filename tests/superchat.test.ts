import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../server/database.ts';
import { createAnalytics } from '../server/analytics.ts';
import { createSuperChats } from '../server/superchat.ts';
import { createExchangeRates } from '../server/exchange-rates.ts';
import { processEvents } from '../server/process-events.ts';
import { definition, type ChatBatch } from '../server/chat-stream.ts';
import { initialState, type ArenaState } from '../lib/arena.ts';
import { nextMatch } from '../lib/match.ts';
import { superChatPoints, safeAvatar, donationAmount } from '../lib/superchat.ts';
import { createCleanup } from '../server/cleanup.ts';

const chat = (id: string, text: string, time: number, viewer = 'donor') => ({ id, authorDetails: { channelId: viewer, displayName: viewer }, snippet: { type: 1, publishedAt: new Date(time).toISOString(), textMessageDetails: { messageText: text } } });
const donation = (id: string, amount = '5400000', currency = 'USD', time = 2000, viewer = 'donor') => ({ id, authorDetails: { channelId: viewer, displayName: viewer, profileImageUrl: 'https://yt3.ggpht.com/avatar' }, snippet: { type: 15, publishedAt: new Date(time).toISOString(), superChatDetails: { amountMicros: amount, currency, userComment: 'Hello' } } });
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'arena-superchat-')), db = openDatabase(dir);
  const analytics = createAnalytics(db), superChats = createSuperChats(db);
  analytics.stream('one', 'One', 0);
  let state: ArenaState = { ...initialState(), mode: 'live' };
  function batch(items: ChatBatch['items'], now = 3000, video = 'one', since = 0) {
    const before = state;
    try { db.transaction(() => {
      state = processEvents(analytics, video, state, { items }, since, 0, now,
        (id, next, avatar) => { superChats.capture(video, id, next, avatar, since, now); return superChats.apply(next, video, now); }).state;
      state = superChats.apply(state, video, now);
      db.save({ demo: initialState(), live: state, video });
    }); } catch (error) { state = before; throw error; }
    return state;
  }
  return { db, dir, analytics, superChats, batch, get: () => state, set: (next: ArenaState) => { state = next; } };
}

void test('USD purchases award 1,000 points per dollar once, without XP or catch-up multipliers', () => {
  const f = setup();
  try {
    f.set({ ...f.get(), scores: { BR: 10000 }, viewers: { donor: { xp: 120, lastXpAt: 0 } } });
    const state = f.batch([chat('vote', 'Indonesia', 1000), donation('paid')]);
    assert.equal(state.scores.ID, 5415); // level 3 x catch-up 5, plus exactly 5400.
    assert.equal(state.viewers!.donor.xp, 120);
    assert.equal(f.analytics.summary('one').voters[0].points, 15);
    assert.equal(f.batch([donation('paid')]).scores.ID, 5415);
    assert.equal(f.get().donationEvents?.length,1);
    assert.equal(f.get().donationEvents?.[0].points,5400);
    assert.deepEqual(f.db.load()!.live.donationEvents,f.get().donationEvents);
    const card = f.superChats.page('one').cards[0];
    assert.equal(card.points, 5400); assert.equal(card.country, 'ID'); assert.equal(card.status, 'awarded');
    assert.equal(card.avatar, 'https://yt3.ggpht.com/avatar');
    assert.equal(superChatPoints(3190000), 3190); assert.equal(superChatPoints(1234567), 1234);
    assert.equal(donationAmount('5400000', 'USD'), '$5.4');
    assert.equal(donationAmount('150000000000', 'IDR'), 'IDR 150,000');
    assert.equal(safeAvatar('javascript:alert(1)'), ''); assert.equal(safeAvatar('https://evil.example/avatar'), '');
  } finally { f.db.close(); }
});

void test('supporter ranking sums each donor across restreams, excludes other sessions and keeps pending FX explicit',()=>{
 const f=setup();
 try{
  f.batch([donation('a1','6000000','USD',2000,'a'),donation('b1','10000000','USD',2100,'b'),donation('fx','30000000','EUR',2200,'c')]);
  assert.deepEqual(f.superChats.supporters('one').cards.map(c=>[c.id,c.rank,c.usdMicros]),[['b',1,'10000000'],['a',2,'6000000'],['c',null,null]]);
  f.db.linkSession('two','one');f.analytics.stream('two','Replacement',3000);
  const renamed=donation('a2','7000000','USD',4000,'a');renamed.authorDetails.displayName='Renamed donor';
  f.batch([renamed],4500,'two',3000);
  const page=f.superChats.supporters('two');
  assert.equal(page.total,3);assert.equal(page.cards[0].id,'a');assert.equal(page.cards[0].name,'Renamed donor');
  assert.equal(page.cards[0].usdMicros,'13000000');assert.equal(page.cards[0].donationCount,2);
  assert.equal(page.cards[2].pendingCount,1);
  f.analytics.stream('unrelated','Another session',5000);
  f.batch([donation('huge','99000000','USD',6000,'a')],6500,'unrelated',5000);
  assert.equal(f.superChats.supporters('two').cards[0].usdMicros,'13000000');
  f.db.sql("UPDATE donations SET usd_micros=33000000 WHERE stream='one' AND id='fx'").run();
  assert.deepEqual(f.superChats.supporters('two').cards.map(c=>c.id),['c','a','b']);
  assert.equal(f.superChats.supporters('two',2,3).cards[1].rank,1);
  assert.equal(f.superChats.supporters('').total,0);
  assert.throws(()=>f.superChats.supporters('one',-1),/position/);
  assert.throws(()=>f.superChats.supporters('one',0,61),/page size/);
 }finally{f.db.close();}
});

void test('supporter ties are stable; names do not merge identities and country points sum across rounds',()=>{
 const f=setup();
 try{
  const first=donation('first','5000000','USD',2000,'one'),second=donation('second','5000000','USD',2001,'two');
  first.authorDetails.displayName=second.authorDetails.displayName='Same name';
  f.batch([chat('pick','Indonesia',1000,'one'),first,second]);
  const before=f.superChats.supporters('one');assert.equal(before.total,2);assert.equal(before.cards[0].id,'one');assert.equal(before.cards[0].points,5000);
  f.set(nextMatch({...f.get(),match:{phase:'results'}},true,4000));
  f.batch([chat('new-pick','Brazil',4500,'one'),donation('third','1000000','USD',5000,'one')],5500);
  const donor=f.superChats.supporters('one').cards[0];assert.equal(donor.usdMicros,'6000000');assert.equal(donor.points,6000);assert.equal(donor.country,null,'Do not attribute a multi-country session total to one flag');
 }finally{f.db.close();}
});

void test('pending donations await a country; later votes and repeated requests cannot double award', () => {
  const f = setup();
  try {
    assert.deepEqual(f.batch([donation('waiting')]).scores, {});
    assert.equal(f.superChats.page('one').cards[0].status, 'pending');
    assert.equal(f.batch([chat('next', 'Brazil', 4000)], 5000).scores.BR, 5401);
    assert.equal(f.batch([], 6000).scores.BR, 5401);
  } finally { f.db.close(); }
});

void test('a paid event changes the catch-up multiplier for later votes in the same batch', () => {
  const f = setup();
  try {
    f.set({ ...f.get(), scores: { ID: 999 }, viewers: { donor: { xp: 0, lastXpAt: 0, lastCountry: 'ID', lastVoteAt: 1000 } } });
    const state = f.batch([donation('paid', '1000000'), chat('later', 'Brazil', 2500, 'other')]);
    assert.equal(state.scores.ID, 1999);
    assert.equal(state.scores.BR, 5);
  } finally { f.db.close(); }
});

void test('foreign currencies wait for conversion and use the locked USD rate', async () => {
  const f = setup();
  try {
    const state = f.batch([chat('vote', 'Indonesia', 1000), donation('euro', '2500000', 'EUR')]);
    assert.equal(state.scores.ID, 1);
    const rates = createExchangeRates(f.db, (async () => new Response(JSON.stringify({ base: 'EUR', quote: 'USD', rate: 1.2, date: '1970-01-01' }))) as typeof fetch);
    await rates.refresh(4000);
    assert.equal(f.batch([], 5000).scores.ID, 3001);
    assert.equal(f.superChats.page('one').cards[0].points, 3000);
    assert.equal(f.batch([], 6000).scores.ID, 3001);
  } finally { f.db.close(); }
});

void test('closed rounds and delayed old messages never alter results or the next round', () => {
  const f = setup();
  try {
    f.batch([donation('unassigned')]);
    f.set({ ...f.get(), match: { phase: 'countdown', openedAt: 0, endsAt: 4000 } });
    assert.deepEqual(f.batch([chat('late', 'Indonesia', 3500), donation('late-paid', '1000000', 'USD', 3500)], 4000).scores, {});
    assert.ok(f.superChats.page('one').cards.every(card => card.status === 'closed'));
    f.set(nextMatch({ ...f.get(), match: { phase: 'results' } }, true, 5000));
    assert.equal(f.batch([chat('new', 'Indonesia', 6000), donation('old-delivery', '1000000', 'USD', 3000)], 7000, 'one', 5000).scores.ID, 1);
    assert.ok(f.superChats.page('one').cards.every(card => card.points === 0));
  } finally { f.db.close(); }
});

void test('award and checkpoint rollback together, then survive restarts and replacement broadcasts', () => {
  const f = setup();
  f.batch([chat('vote', 'Indonesia', 1000)]);
  f.db.db.exec("CREATE TRIGGER reject_award BEFORE UPDATE ON superchat_awards BEGIN SELECT RAISE(ABORT,'test failure'); END");
  assert.throws(() => f.batch([donation('paid')]), /test failure/);
  assert.equal(f.superChats.page('one').total, 0);
  assert.equal(f.db.load()!.live.scores.ID, 1);
  f.db.db.exec('DROP TRIGGER reject_award');
  f.batch([donation('paid')]);
  f.db.linkSession('two', 'one'); f.analytics.stream('two', 'Replacement', 4000);
  assert.equal(f.batch([donation('second', '1000000', 'USD', 5000)], 6000, 'two', 4000).scores.ID, 6401);
  assert.equal(f.superChats.page('two').total, 2);
  f.db.close();
  const db = openDatabase(f.dir);
  try {
    const chats = createSuperChats(db), saved = db.load()!;
    assert.equal(chats.apply(saved.live, saved.video).scores.ID, 6401);
    assert.equal(chats.page('two').cards[0].points, 5400);
  } finally { db.close(); }
});

void test('carousel reaches all donations, wraps, and cleanup removes the corresponding award history', () => {
  const f = setup();
  try {
    f.batch([chat('vote', 'Indonesia', 1000)]);
    for (let i = 0; i < 12; i++) f.batch([donation('paid' + i, '1000000', 'USD', 2000 + i)]);
    assert.equal(f.superChats.page('one').total, 12);
    assert.equal(f.superChats.page('one', 0, 12).cards.length, 12);
    assert.equal(f.superChats.page('one', 11, 12).cards.length, 12);
    assert.throws(() => f.superChats.page('one', 0, 61), /page size/);
    assert.throws(() => f.superChats.page('one', 0, 0), /page size/);
    assert.equal(f.superChats.page('one', 11).cards[1].id, 'one:paid0');
    const reached = new Set(Array.from({ length: 12 }, (_, i) => f.superChats.page('one', i).cards[0].id));
    assert.equal(reached.size, 12);
    const cleanup = createCleanup(f.db, () => 'different');
    const plan = cleanup.preview(['one']); cleanup.remove(['one'], plan.token, true);
    assert.equal(f.superChats.page('one').total, 0);
  } finally { f.db.close(); }
});

void test('migration shows old purchases without retroactively awarding points', () => {
  const db = openDatabase(mkdtempSync(join(tmpdir(), 'arena-sc-legacy-')));
  try {
    const analytics = createAnalytics(db); analytics.stream('old', 'Old', 0);
    analytics.donation('old', { id: 'old', viewerId: 'donor', name: 'Donor', amountMicros: '5400000', currency: 'USD', time: 0, comment: '' });
    const chats = createSuperChats(db);
    assert.equal(chats.page('old').cards[0].status, 'historical');
    assert.deepEqual(chats.apply({ ...initialState(), mode: 'live' }, 'old').scores, {});
  } finally { db.close(); }
});

void test('official avatar protobuf field survives wire decoding', () => {
  const method = (definition['youtube.api.v3.V3DataLiveChatMessageService'] as unknown as { StreamList: { responseSerialize: (value: unknown) => Buffer; responseDeserialize: (value: Buffer) => ChatBatch } }).StreamList;
  const restored = method.responseDeserialize(method.responseSerialize({ items: [donation('wire')] }));
  assert.equal(restored.items![0].authorDetails!.profileImageUrl, 'https://yt3.ggpht.com/avatar');
});
