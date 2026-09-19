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
import { initialState, countries, parseDonationCountry, type ArenaState } from '../lib/arena.ts';
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
        (id, next, avatar) => { superChats.capture(video, id, next, avatar, since, now); return superChats.apply(next, video, now); },next=>superChats.apply(next,video,now)).state;
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
    assert.equal(state.scores.ID, 5425); // level 3 x catch-up 5, plus a 10-point gap bonus and 5400.
    assert.equal(state.viewers!.donor.xp, 120);
    assert.equal(f.analytics.summary('one').voters[0].points, 25);
    assert.equal(f.batch([donation('paid')]).scores.ID, 5425);
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
    assert.equal(state.scores.BR, 6);
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

void test('paid messages select their country without adding chat XP or a second vote', () => {
  for (const [comment, code] of [['Indonesia','ID'], ['Go Indonesia!','ID'], ['For 🇮🇩!','ID'], ['!vote ID','ID'], ['Brazil 🇧🇷','BR'], ['Go North Korea!','KP'], ['USA USA','US']]) {
    const f=setup();
    try {
      f.batch([chat('old','Brazil',1000)]);
      const paid=donation('paid');paid.snippet.superChatDetails.userComment=comment;
      const state=f.batch([paid]);
      assert.equal(f.superChats.page('one').cards[0].country,code,comment);
      assert.equal(state.scores[code],5400+(code==='BR'?1:0),comment);
      assert.equal(state.viewers!.donor.xp,1);
      assert.equal(state.recent.length,1);
      assert.equal(state.donationEvents![0].country,code);
      assert.equal(f.batch([paid]).donationEvents!.length,1);
    } finally { f.db.close(); }
  }
});

void test('empty, unrelated, invalid and ambiguous paid messages wait for the donor’s own viewer chat', () => {
  for (const comment of ['', 'Hello!', '!vote ZZ', 'Indonesia Brazil', '🇮🇩🇧🇷', 'Brazil 🇮🇩']) {
    const f=setup();
    try {
      const paid=donation('paid');paid.snippet.superChatDetails.userComment=comment;
      f.batch([paid,chat('other','Indonesia',2500,'other')]);
      assert.equal(f.superChats.page('one').cards[0].status,'pending',comment);
      f.batch([chat('unrelated','hello',3100),chat('ambiguous','Indonesia Brazil',3200)],3500);
      assert.equal(f.superChats.page('one').cards[0].status,'pending');
      f.batch([chat('own','!vote BR',4000),chat('switch','Indonesia',4100)],4500);
      assert.equal(f.superChats.page('one').cards[0].country,'BR');
      assert.equal(f.superChats.page('one').cards[0].points,5400);
      assert.equal(f.get().recent.length,3);
    } finally { f.db.close(); }
  }
});

void test('current viewer selection overrides old majority and never leaks from a previous round',()=>{
  const f=setup();
  try {
    f.batch([chat('a','Indonesia',1000),chat('b','Indonesia',1100),chat('c','Brazil',1200),donation('first')]);
    assert.equal(f.superChats.page('one').cards[0].country,'BR');
    f.set(nextMatch({...f.get(),match:{phase:'results'}},true,4000));
    f.batch([donation('next','1000000','USD',4500)],5000);
    assert.equal(f.superChats.page('one').cards[1].status,'pending');
    assert.deepEqual(f.get().scores,{});
    f.batch([chat('new','Japan',5100)],5500);
    assert.equal(f.superChats.page('one').cards[1].country,'JP');
    assert.equal(f.get().scores.JP,1001);
  } finally { f.db.close(); }
});

void test('original currencies remain exact before and after conversion, including mixed-currency donors', async()=>{
  const f=setup();
  try {
    f.batch([donation('idr','150000000000','IDR'),donation('idr2','50000000000','IDR',2100),donation('usd','1234567','USD',2200),donation('jpy','1000000000','JPY',2300)]);
    const amounts=[{currency:'IDR',amountMicros:'200000000000'},{currency:'JPY',amountMicros:'1000000000'},{currency:'USD',amountMicros:'1234567'}];
    assert.deepEqual(f.superChats.supporters('one').cards[0].amounts,amounts);
    f.db.sql('UPDATE donations SET usd_micros=1000000 WHERE usd_micros IS NULL').run();
    assert.deepEqual(f.superChats.supporters('one').cards[0].amounts,amounts);
    assert.equal(f.superChats.page('one').cards[0].currency,'IDR');
    for(const [currency,micros,display] of [['IDR','150000000000','IDR 150,000'],['JPY','1000000000','JPY 1,000'],['EUR','2500000','EUR 2.5'],['USD','1234567','$1.234567'],['KWD','1234000','KWD 1.234']])assert.equal(donationAmount(micros,currency),display);
  } finally { f.db.close(); }
});

void test('foreign paid country stays locked while FX is pending and later viewer chats change country',()=>{
  const f=setup();
  try {
    const paid=donation('fx','150000000000','IDR');paid.snippet.superChatDetails.userComment='Go Indonesia!';
    f.batch([paid,chat('switch','Brazil',2500)]);
    assert.equal(f.superChats.page('one').cards[0].country,'ID');
    f.db.sql("UPDATE donations SET usd_micros=10000000 WHERE id='fx'").run();
    f.batch([],4000);
    assert.equal(f.get().scores.ID,10000);
    assert.equal(f.get().scores.BR,1);
    assert.equal(f.get().donationEvents![0].currency,'IDR');
    assert.equal(f.get().donationEvents![0].amountMicros,'150000000000');
  }finally{f.db.close();}
});

void test('all supported country names work inside paid messages',()=>{
  for(const country of countries)assert.equal(parseDonationCountry(`Go ${country.name}!`),country.code,country.name);
});

void test('out-of-order wire events process chat and paid country chronologically, ignoring replay and unsupported events',()=>{
  const f=setup();
  try {
    const paid=donation('wire');paid.snippet.superChatDetails.userComment='Go Japan!';
    const method=(definition['youtube.api.v3.V3DataLiveChatMessageService'] as unknown as {StreamList:{responseSerialize:(value:unknown)=>Buffer;responseDeserialize:(value:Buffer)=>ChatBatch}}).StreamList;
    const items=method.responseDeserialize(method.responseSerialize({items:[paid,chat('earlier','Indonesia',1000),{id:'system',snippet:{type:2,publishedAt:new Date(2100).toISOString()},authorDetails:{channelId:'donor'}}]})).items;
    const state=f.batch(items);
    assert.deepEqual(state.scores,{ID:1,JP:5400});
    assert.equal(state.recent[0].text,'Indonesia');
    assert.deepEqual(f.batch(items).scores,state.scores);
  }finally{f.db.close();}
});
