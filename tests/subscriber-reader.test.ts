import test from 'node:test';
import assert from 'node:assert/strict';
import {subscriberRequest,readSubscribers} from '../server/subscriber-reader.ts';
void test('new subscribers do not prevent stopping on a later known or older page',async()=>{
 const original=globalThis.fetch;
 try{
  for(const older of [false,true]){
   let calls=0,reservations=0;
   globalThis.fetch=async()=>{
    calls++;
    const id=calls===1?'new':'known';
    const publishedAt=new Date(calls>1&&older?500:2000).toISOString();
    return new Response(JSON.stringify({items:[{subscriberSnippet:{channelId:id,title:id},snippet:{publishedAt}}],nextPageToken:'more'}));
   };
   const records=await readSubscribers('test',()=>{reservations++;},{ownerId:'owner',baselineAt:1000,known:older?{}:{known:1000},pending:{}});
   assert.equal(calls,2);assert.equal(reservations,2);
   assert.deepEqual(records.map(record=>record.id),['new','known']);
  }
 }finally{globalThis.fetch=original;}
});
void test('subscriber scans still stop at the request cap when every page is new',async()=>{
 const original=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async()=>new Response(JSON.stringify({items:[{subscriberSnippet:{channelId:String(++calls),title:'new'},snippet:{publishedAt:new Date(2000).toISOString()}}],nextPageToken:'more'}));
  await assert.rejects(()=>readSubscribers('test',()=>{},{ownerId:'owner',baselineAt:1000,known:{},pending:{}}),/Tracking paused/);
  assert.equal(calls,10);
 }finally{globalThis.fetch=original;}
});
test('subscriber temporary failures retry but quota and permission errors do not',async()=>{
 const original=globalThis.fetch;
 try{
  for(const status of [500,503,403,429,401]){
   globalThis.fetch=async()=>new Response(JSON.stringify({error:{errors:[{reason:status===403?'quotaExceeded':'unknown'}]}}),{status});
   await assert.rejects(()=>subscriberRequest('subscriptions',{},'test',()=>{}),(error:any)=>error.retryable===(status>=500));
  }
  globalThis.fetch=async()=>{throw new Error('network');};
  await assert.rejects(()=>subscriberRequest('subscriptions',{},'test',()=>{}),(error:any)=>error.retryable===true);
 }finally{globalThis.fetch=original;}
});
test('mixed known/new subscriber page continues to following page',async()=>{
 const original=globalThis.fetch;let calls=0;
 const item=(id:string)=>({subscriberSnippet:{channelId:id,title:id},snippet:{publishedAt:new Date(2000).toISOString()}});
 try{
  globalThis.fetch=async()=>new Response(JSON.stringify(++calls===1?{items:[item('known'),item('new')],nextPageToken:'next'}:{items:[item('delayed')]}));
  const records=await readSubscribers('test',()=>{},{ownerId:'owner',baselineAt:1000,known:{known:1000},pending:{}});
  assert.equal(calls,2);assert.deepEqual(records.map(r=>r.id),['known','new','delayed']);
 }finally{globalThis.fetch=original;}
});
