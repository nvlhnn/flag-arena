import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {subscriberLedgerForStream,type SubscriberLedger} from '../lib/subscribers.ts';
import {initialState} from '../lib/arena.ts';
import {openDatabase} from '../server/database.ts';
import {createAnalytics} from '../server/analytics.ts';

const ledger=():SubscriberLedger=>({ownerId:'owner',streamId:'first',baselineAt:1000,initialized:true,known:{subscriber:2000},pending:{subscriber:{name:'Viewer',round:1000}},scanJobs:[{page:'cursor'}]});

void test('same-stream subscriber progress survives reconnect and SQLite restart',()=>{
 const original=ledger();assert.equal(subscriberLedgerForStream(original,'first',5000),original);
 const directory=mkdtempSync(join(tmpdir(),'subscriber-scope-'));let db=openDatabase(directory);
 try{
  db.save({demo:initialState(),live:initialState(),video:'first',subscriberLedger:original});db.close();db=openDatabase(directory);
  const restored=db.load()!.subscriberLedger as SubscriberLedger;
  assert.deepEqual(subscriberLedgerForStream(restored,'first',6000),original);
 }finally{db.close();}
});

void test('different livestream replaces subscriber data without deleting vote or donation history',()=>{
 const original=ledger(),fresh=subscriberLedgerForStream(original,'second',5000)!;
 assert.deepEqual(fresh,{ownerId:'owner',streamId:'second',baselineAt:5000,known:{},pending:{},scanJobs:[]});
 assert.deepEqual(original,ledger());assert.equal(subscriberLedgerForStream(undefined,'second'),undefined);
 const directory=mkdtempSync(join(tmpdir(),'subscriber-history-')),db=openDatabase(directory);
 try{
  const analytics=createAnalytics(db);analytics.stream('first');
  analytics.vote('first',{id:'vote',viewerId:'subscriber',viewer:'Viewer',code:'ID',points:5,text:'Indonesia',time:2000});
  analytics.donation('first',{id:'donation',viewerId:'subscriber',name:'Viewer',time:3000,amountMicros:'1000000',currency:'USD',comment:''});
  db.save({demo:initialState(),live:initialState(),video:'first',subscriberLedger:original});
  db.save({demo:initialState(),live:initialState(),video:'second',subscriberLedger:fresh});
  assert.deepEqual(db.load()!.subscriberLedger,fresh);
  assert.equal(analytics.summary('first').voters[0].points,5);assert.equal(analytics.summary('first').totals.donations,1);
  const returning=subscriberLedgerForStream(fresh,'first',7000)!;assert.deepEqual(returning.known,{});assert.equal(returning.initialized,undefined);
 }finally{db.close();}
});

void test('legacy channel-wide subscriber ledgers start a fresh stream baseline',()=>{
 const {streamId:_streamId,...legacy}=ledger();
 const next=subscriberLedgerForStream(legacy,'first',5000)!;
 assert.equal(next.streamId,'first');assert.deepEqual(next.known,{});assert.deepEqual(next.pending,{});assert.deepEqual(next.scanJobs,[]);assert.equal(next.initialized,undefined);
});
