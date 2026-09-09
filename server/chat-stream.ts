import * as grpc from '@grpc/grpc-js';
import {loadSync} from '@grpc/proto-loader';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {acceptVote,type ArenaState} from '../lib/arena.ts';
export const definition=loadSync(fileURLToPath(new URL('./stream-list.proto',import.meta.url)),{defaults:false});
export type ChatBatch={nextPageToken?:string;offlineAt?:string;items?:{id?:string;snippet?:{type?:number;publishedAt?:string;textMessageDetails?:{messageText?:string}};authorDetails?:{channelId?:string;displayName?:string}}[]};
type StreamClient=grpc.Client & {streamList:(request:object,metadata:grpc.Metadata)=>grpc.ClientReadableStream<ChatBatch>};
const service=grpc.loadPackageDefinition(definition) as unknown as {youtube:{api:{v3:{V3DataLiveChatMessageService:new(target:string,credentials:grpc.ChannelCredentials)=>StreamClient}}}};
export function createChatSource(key:string,chat:string){
 const client=new service.youtube.api.v3.V3DataLiveChatMessageService('youtube.googleapis.com:443',grpc.credentials.createSsl());
 return {close:()=>client.close(),async *read(page:string|undefined,signal:AbortSignal):AsyncGenerator<ChatBatch>{
  if(signal.aborted)return;
  const metadata=new grpc.Metadata();metadata.set('x-goog-api-key',key);
  const call=client.streamList({liveChatId:chat,part:['id','snippet','authorDetails'],maxResults:2000,...(page?{pageToken:page}:{})},metadata);
  const cancel=()=>call.cancel();signal.addEventListener('abort',cancel,{once:true});
  try{for await(const batch of call)yield batch;}finally{signal.removeEventListener('abort',cancel);call.cancel();}
 }};
}
export function applyChatBatch(state:ArenaState,batch:ChatBatch,since:number,onAccepted?:(count:number)=>void){
 const seen=new Set(state.seen);let accepted=0;
 for(const item of batch.items||[]){const snippet=item.snippet,time=Date.parse(snippet?.publishedAt||'');if(snippet?.type!==1||!item.id||!item.authorDetails?.channelId||!Number.isFinite(time)||time<since)continue;
  const result=acceptVote(state,{id:item.id,viewerId:item.authorDetails.channelId,viewer:item.authorDetails.displayName||'Viewer',text:snippet.textMessageDetails?.messageText||'',time},Date.now(),seen);if(result.accepted){if(state.seen.length>=10000)seen.delete(state.seen[0]);seen.add(item.id);accepted++;state=result.state;}
 }onAccepted?.(accepted);return state;
}
export function streamError(code:number){
 const messages:Record<number,string>={3:'YouTube rejected the chat request or resume token. Disconnect and reconnect.',5:'YouTube live chat was not found.',7:'YouTube denied access. Check the API key restrictions and stream visibility.',8:'YouTube quota or rate limit reached. Wait before reconnecting.',9:'YouTube chat has ended or is disabled.',16:'YouTube authentication failed. Check your API key.'};
 return messages[code]||'YouTube chat connection failed. Reconnect to try again.';
}
export type ChatDiagnostic={event:'stream_attempt'|'stream_batch'|'stream_end'|'stream_error'|'retry_limit';code?:number;messages?:number;resuming?:boolean;durationMs?:number};
export async function consumeChat(options:{read:(page:string|undefined,signal:AbortSignal)=>AsyncIterable<ChatBatch>;signal:AbortSignal;onBatch:(batch:ChatBatch)=>void;onStatus:(text:string,connected:boolean)=>void;wait?:(ms:number)=>Promise<void>;now?:()=>number;diagnostic?:(event:ChatDiagnostic)=>void;initialPage?:string;beforeAttempt?:()=>void;onInvalidPage?:()=>void}){
 let page=options.initialPage,failures=0;
 const now=options.now||Date.now;
 const wait=options.wait||((ms:number)=>delay(ms,undefined,{signal:options.signal}));
 while(!options.signal.aborted){
  const started=now();
  if(failures>=8){options.diagnostic?.({event:'retry_limit'});options.onStatus('Chat stopped after 8 consecutive connection failures. Check your network before reconnecting.',false);return;}
  try{options.beforeAttempt?.();}catch{options.onStatus('Chat paused by the saved request budget. Check diagnostics before reconnecting.',false);return;}
  options.diagnostic?.({event:'stream_attempt',resuming:!!page});
  try{
   for await(const batch of options.read(page,options.signal)){
    if(options.signal.aborted)return;
    options.onBatch(batch); // Commit votes before advancing the resume token.
    options.diagnostic?.({event:'stream_batch',messages:batch.items?.length||0});
    if(batch.nextPageToken)page=batch.nextPageToken;
    // A short-lived connection is not recovery, even if it delivers history.
    if(now()-started>=30000)failures=0;
    if(batch.offlineAt||batch.items?.some(item=>item.snippet?.type===4)){options.onStatus('Stream ended. Scores saved.',false);return;}
    options.onStatus('Connected — streaming YouTube country votes.',true);
   }
   options.diagnostic?.({event:'stream_end',durationMs:now()-started});
   failures=0;
   options.onStatus('Resuming YouTube chat…',false);
   try{await wait(2000);}catch{if(options.signal.aborted)return;throw new Error('Reconnect wait failed.');}
   continue;
  }catch(error){
   if(options.signal.aborted)return;
   const code=(error as {code?:number}).code;
   options.diagnostic?.({event:'stream_error',durationMs:now()-started,...(typeof code==='number'?{code}:{})});
   if(code===3&&page){options.onInvalidPage?.();options.onStatus('Saved chat position was rejected. Reconnect to receive new messages; older votes may be unavailable.',false);return;}
   if(code!==undefined&&![grpc.status.UNAVAILABLE,grpc.status.DEADLINE_EXCEEDED,grpc.status.INTERNAL,grpc.status.CANCELLED,grpc.status.UNKNOWN].includes(code)){options.onStatus(streamError(code),false);return;}
   if(code===undefined){options.onStatus('Chat processing failed. Scores retained; reconnect to try again.',false);return;}
  }
  if(options.signal.aborted)return;
  const pause=Math.min(60000,2000*2**Math.min(failures++,5));
  options.onStatus(`Chat interrupted — reconnecting in ${pause/1000}s.`,false);
  try{await wait(pause);}catch{if(options.signal.aborted)return;throw new Error('Reconnect wait failed.');}
 }
}
