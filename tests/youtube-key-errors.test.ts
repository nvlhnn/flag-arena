import test from 'node:test';
import assert from 'node:assert/strict';
import {youtube} from '../server/youtube.ts';
test('Google structured invalid-key errors allow fallback but quota does not',async()=>{
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async()=>new Response(JSON.stringify({error:{details:[{reason:'API_KEY_INVALID'}]}}),{status:400});
  await assert.rejects(()=>youtube('videos',{id:'demo'},'test-key'),(error:any)=>error.reason==='keyInvalid'&&!error.message.includes('test-key'));
  globalThis.fetch=async()=>new Response(JSON.stringify({error:{errors:[{reason:'quotaExceeded'}]}}),{status:403});
  await assert.rejects(()=>youtube('videos',{id:'demo'},'test-key'),(error:any)=>error.reason==='quotaExceeded');
 }finally{globalThis.fetch=original;}
});
