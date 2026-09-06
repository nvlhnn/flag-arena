import {existsSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import type {ChatDiagnostic} from './chat-stream.ts';
type Event=ChatDiagnostic|{event:'video_lookup'|'video_lookup_error'};
export function createDiagnostics(directory:string){
 const path=join(directory,'youtube-diagnostics.json');
 let data:{since:string;counts:Record<string,number>;receivedMessages:number;recent:object[]}={since:new Date().toISOString(),counts:{},receivedMessages:0,recent:[]};
 try{if(existsSync(path)){const saved=JSON.parse(readFileSync(path,'utf8'));if(saved.counts&&Array.isArray(saved.recent))data=saved;}}catch{/* Diagnostics must never prevent streaming. */}
 return {read:()=>data,record:(event:Event)=>{
  data.counts[event.event]=(data.counts[event.event]||0)+1;
  if(event.event==='stream_batch')data.receivedMessages+=event.messages||0;
  // Only structured counts and codes: no keys, tokens, URLs, or chat text.
  const safe={time:new Date().toISOString(),event:event.event,...('code'in event?{code:event.code}:{}),...('resuming'in event?{resuming:event.resuming}:{})};
  if(event.event!=='stream_batch')data.recent=[...data.recent,safe].slice(-100);
  try{writeFileSync(path+'.tmp',JSON.stringify(data));renameSync(path+'.tmp',path);}catch{/* Keep counters in memory if disk is temporarily unavailable. */}
 }};
}
