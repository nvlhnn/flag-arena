import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,acceptVote} from '../lib/arena.ts';
import {ingestSubscribers,applyPendingSubscribers,type SubscriberLedger} from '../lib/subscribers.ts';
import {KeyPool} from '../server/key-pool.ts';
const ledger=():SubscriberLedger=>({ownerId:'owner',baselineAt:1000,known:{},pending:{}});
const sub={id:'viewer',name:'New Viewer',publishedAt:2000};
const voted=()=>acceptVote(initialState(),{id:'vote',viewerId:'viewer',viewer:'Viewer',text:'Indonesia',time:1500}).state;
test('subscriber gets exactly 50 points on their country, including after reload',()=>{
 const first=ingestSubscribers(voted(),ledger(),[sub],3000);assert.equal(first.state.scores.ID,51);assert.equal(first.state.subscriberAlerts?.[0].points,50);
 const restored=JSON.parse(JSON.stringify(first));const replay=ingestSubscribers(restored.state,restored.ledger,[sub],4000);assert.equal(replay.state.scores.ID,51);
});
test('existing or undated subscriptions are baselined without rewards',()=>{
 const result=ingestSubscribers(voted(),ledger(),[{...sub,publishedAt:999},{...sub,id:'undated',publishedAt:NaN}],3000);assert.equal(result.state.scores.ID,1);assert.equal(result.state.subscriberAlerts,undefined);
});
test('pending subscriber gets bonus on next vote only in the same open round',()=>{
 const pending=ingestSubscribers(initialState(),ledger(),[sub],3000);assert.equal(pending.state.subscriberAlerts?.[0].points,0);
 const state=acceptVote(pending.state,{id:'vote',viewerId:sub.id,viewer:sub.name,text:'Brazil',time:3500}).state;
 const granted=applyPendingSubscribers(state,pending.ledger,4000);assert.equal(granted.state.scores.BR,51);assert.deepEqual(granted.ledger.pending,{});
 const expired=applyPendingSubscribers({...state,match:{phase:'open',openedAt:3600}},pending.ledger,4000);assert.equal(expired.state.scores.BR,1);assert.deepEqual(expired.ledger.pending,{});
});
test('closed matches and expired countdowns cannot receive subscriber points',()=>{
 for(const match of [{phase:'results' as const},{phase:'countdown' as const,endsAt:2500}]){
  const result=ingestSubscribers({...voted(),match},ledger(),[sub],3000);assert.equal(result.state.scores.ID,1);assert.deepEqual(result.ledger.pending,{});
 }
});
test('credential and quota fallback is bounded; permissions do not rotate',async()=>{
 const pool=new KeyPool(['first','second']);const calls:string[]=[];
 assert.equal(await pool.lookup(async key=>{calls.push(key);if(key==='first')throw Object.assign(new Error('invalid'),{reason:'keyInvalid'});return 'ok';}),'ok');assert.deepEqual(calls,['first','second']);
 for(const reason of ['forbidden']){
  let count=0;const blocked=new KeyPool(['first','second']);await assert.rejects(()=>blocked.lookup(async()=>{count++;throw Object.assign(new Error('blocked'),{reason});}));assert.equal(count,1);assert.equal(blocked.current(),'first');
 }
});

test('quota fallback advances once and stops when every key is exhausted',async()=>{
 for(const reason of ['quotaExceeded','dailyLimitExceeded','rateLimitExceeded','userRateLimitExceeded','429']){
  const pool=new KeyPool(['first','second']);const calls:string[]=[];
  assert.equal(await pool.lookup(async key=>{calls.push(key);if(key==='first')throw Object.assign(new Error('quota'),{reason});return 'ok';}),'ok');
  assert.deepEqual(calls,['first','second']);
  const exhausted=new KeyPool(['first','second']);let attempts=0;
  await assert.rejects(()=>exhausted.lookup(async()=>{attempts++;throw Object.assign(new Error('quota'),{reason});}));assert.equal(attempts,2);assert.equal(exhausted.advance(),false);
 }
});
