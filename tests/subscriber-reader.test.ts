import test from 'node:test';
import assert from 'node:assert/strict';
import {subscriberRequest,readSubscribers} from '../server/subscriber-reader.ts';
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
