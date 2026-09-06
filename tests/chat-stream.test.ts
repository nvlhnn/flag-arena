import test from 'node:test';
import assert from 'node:assert/strict';
import {applyChatBatch,consumeChat,definition,type ChatBatch} from '../server/chat-stream.ts';
import {initialState} from '../lib/arena.ts';
const message=(id:string,time:number,type=1)=>({id,snippet:{type,publishedAt:new Date(time).toISOString(),textMessageDetails:{messageText:'Indonesia'}},authorDetails:{channelId:'channel',displayName:'Viewer Name'}});
test('stream batches ignore history and paid messages, preserve names, reject replay',()=>{
 const first=applyChatBatch(initialState(),{items:[message('old',999),message('new',1000),message('paid',20000,15)]},1000);
 assert.equal(first.scores.ID,100);assert.equal(first.recent[0].viewer,'Viewer Name');
 const replay=applyChatBatch(first,{items:[message('new',1000),message('next',11000)]},1000);assert.equal(replay.scores.ID,200);
 const reset=applyChatBatch(initialState(),{items:[message('old',11000)]},12000);assert.deepEqual(reset.scores,{});
});
test('reconnection sends last token, does not skip recovered votes, closes on ended chat',async()=>{
 const controller=new AbortController(),pages:(string|undefined)[]=[],waits:number[]=[];let state=initialState();
 await consumeChat({signal:controller.signal,async *read(page){pages.push(page);if(pages.length===1){yield {nextPageToken:'resume-1',items:[message('a',1000)]};throw Object.assign(new Error('network'),{code:14});}yield {nextPageToken:'resume-2',items:[message('a',1000),message('b',11000)]};yield {offlineAt:new Date().toISOString()};},onBatch:b=>{state=applyChatBatch(state,b,1000);},onStatus:()=>{},wait:async ms=>{waits.push(ms);}});
 assert.deepEqual(pages,[undefined,'resume-1']);assert.deepEqual(waits,[2000]);assert.equal(state.scores.ID,200);
});
test('quota and authentication failures do not loop or expose raw errors',async()=>{
 for(const code of [3,7,8,9,16]){let calls=0;const statuses:string[]=[];await consumeChat({signal:new AbortController().signal,async *read(){calls++;throw Object.assign(new Error('SECRET'),{code});},onBatch:()=>{},onStatus:s=>statuses.push(s),wait:async()=>assert.fail('Should not retry')});assert.equal(calls,1);assert.ok(!statuses.join('').includes('SECRET'));}
});
test('backoff grows and manual disconnect stops reconnection',async()=>{
 const controller=new AbortController(),waits:number[]=[];await consumeChat({signal:controller.signal,async *read(){throw Object.assign(new Error('offline'),{code:14});},onBatch:()=>{},onStatus:()=>{},wait:async ms=>{waits.push(ms);if(waits.length===7)controller.abort();}});assert.deepEqual(waits,[2000,4000,8000,16000,32000,60000,60000]);
});
test('protobuf contract uses official service path and round-trips message fields',()=>{
 const service=definition['youtube.api.v3.V3DataLiveChatMessageService'] as any;
 const rpc=service.StreamList;assert.equal(rpc.path,'/youtube.api.v3.V3DataLiveChatMessageService/StreamList');assert.equal(rpc.responseStream,true);
 const request={liveChatId:'chat-id',pageToken:'cursor',part:['id','snippet','authorDetails'],maxResults:2000};assert.deepEqual(rpc.requestDeserialize(rpc.requestSerialize(request)),request);
 const batch:ChatBatch={nextPageToken:'next',items:[message('id',1000)]};assert.deepEqual(rpc.responseDeserialize(rpc.responseSerialize(batch)),batch);
});
test('normal endings resume beyond eight attempts without failure backoff',async()=>{
 let attempts=0;const waits:number[]=[];const controller=new AbortController();
 await consumeChat({signal:controller.signal,now:()=>1000,async *read(){attempts++;yield {nextPageToken:'cursor',items:[]};if(attempts===10)controller.abort();},onBatch:()=>{},onStatus:()=>{},wait:async ms=>{waits.push(ms);}});
 assert.equal(attempts,10);assert.ok(waits.every(ms=>ms===2000));
});
test('persisted budget refusal stops before a request is made',async()=>{
 let calls=0;const statuses:string[]=[];
 await consumeChat({signal:new AbortController().signal,beforeAttempt:()=>{throw new Error('Budget exhausted');},async *read(){calls++;},onBatch:()=>{},onStatus:s=>statuses.push(s)});
 assert.equal(calls,0);assert.match(statuses.at(-1)!,/saved request budget/);
});
test('restart uses saved cursor and can accept votes from the disconnected interval',async()=>{
 let state=initialState();const controller=new AbortController();
 await consumeChat({initialPage:'saved-cursor',signal:controller.signal,async *read(page){assert.equal(page,'saved-cursor');yield {items:[message('during-downtime',11000)],offlineAt:'ended'};},onBatch:b=>{state=applyChatBatch(state,b,1000);},onStatus:()=>{}});
 assert.equal(state.scores.ID,100);
});
test('an invalid saved cursor is cleared instead of trapping every reconnect',async()=>{
 let cleared=false;const statuses:string[]=[];
 await consumeChat({initialPage:'expired',signal:new AbortController().signal,async *read(){throw Object.assign(new Error('invalid token'),{code:3});},onBatch:()=>{},onInvalidPage:()=>{cleared=true;},onStatus:s=>statuses.push(s)});
 assert.equal(cleared,true);assert.match(statuses.at(-1)!,/older votes may be unavailable/);
});
test('only a stable stream resets retry delay; diagnostics exclude raw error text',async()=>{
 let time=0,calls=0;const waits:number[]=[],events:unknown[]=[];const controller=new AbortController();
 await consumeChat({signal:controller.signal,now:()=>time,diagnostic:e=>events.push(e),async *read(){calls++;if(calls===3)time+=31000;yield {nextPageToken:'secret-cursor'};throw Object.assign(new Error('secret-key'),{code:14});},onBatch:()=>{},onStatus:()=>{},wait:async ms=>{waits.push(ms);time+=ms;if(calls===3)controller.abort();}});
 assert.deepEqual(waits,[2000,4000,2000]);assert.doesNotMatch(JSON.stringify(events),/secret/);
});
