import {existsSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import type {ChatDiagnostic} from './chat-stream.ts';
type Event=ChatDiagnostic|{event:'video_lookup'|'video_lookup_error'}|{event:'votes';accepted:number;ignored:number};
export function createDiagnostics(directory:string){
 const path=join(directory,'youtube-diagnostics.json');
 let data:{since:string;counts:Record<string,number>;receivedMessages:number;recent:object[];acceptedVotes?:number;ignoredMessages?:number;lastMessageAt?:string;lastConnectionDurationMs?:number}={since:new Date().toISOString(),counts:{},receivedMessages:0,recent:[]};
 try{if(existsSync(path)){const saved=JSON.parse(readFileSync(path,'utf8'));if(saved.counts&&Array.isArray(saved.recent))data=saved;}}catch{/* Diagnostics must never prevent streaming. */}
 let timer:ReturnType<typeof setTimeout>|undefined;
 function flush(){if(timer){clearTimeout(timer);timer=undefined;}try{writeFileSync(path+'.tmp',JSON.stringify(data));renameSync(path+'.tmp',path);}catch{/* Diagnostics never stop chat. */}}
 return {flush,read:()=>data,record:(event:Event)=>{
  data.counts[event.event]=(data.counts[event.event]||0)+1;
  if(event.event==='stream_batch')data.receivedMessages+=event.messages||0;
  if(event.event==='stream_batch'&&event.messages)data.lastMessageAt=new Date().toISOString();
  if(event.event==='votes'){data.acceptedVotes=(data.acceptedVotes||0)+event.accepted;data.ignoredMessages=(data.ignoredMessages||0)+event.ignored;}
  if('durationMs'in event)data.lastConnectionDurationMs=event.durationMs;
  // Only structured counts and codes: no keys, tokens, URLs, or chat text.
  const safe={time:new Date().toISOString(),event:event.event,...('code'in event?{code:event.code}:{}),...('resuming'in event?{resuming:event.resuming}:{}),...('durationMs'in event?{durationMs:event.durationMs}:{})};
  if(event.event!=='stream_batch'&&event.event!=='votes')data.recent=[...data.recent,safe].slice(-100);
  if(!timer)timer=setTimeout(flush,1000);
 }};
}
