import {liveUpdate} from '../lib/live-updates.ts';
import {configuredKeys} from './env.ts';
import {openDatabase} from './database.ts';
import {createAnalytics} from './analytics.ts';
import {createExchangeRates} from './exchange-rates.ts';
import {processEvents} from './process-events.ts';
import {homedir} from 'node:os';
import {KeyPool} from './key-pool.ts';
import {createSubscriberOAuth} from './subscriber-oauth.ts';
import {scanSubscribers,subscriberRequest} from './subscriber-reader.ts';
import {ingestSubscribers,applyPendingSubscribers,subscriberLedgerForStream,type SubscriberLedger} from '../lib/subscribers.ts';
import {defaultAudio,type AudioSettings} from '../lib/audio-events.ts';
import {createServer,type ServerResponse} from 'node:http';
import {mkdirSync,existsSync,statSync,createReadStream} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {initialState,acceptVote,migrateScores,type ArenaState} from '../lib/arena.ts';
import {videoId,youtube} from './youtube.ts';
import {createChatSource,consumeChat} from './chat-stream.ts';
import {createDiagnostics} from './diagnostics.ts';
import {finishMatch,settleMatch,nextMatch} from '../lib/match.ts';
import {createRequestBudget} from './request-budget.ts';
const port=Number(process.env.ARENA_PORT||4318),root=resolve('dist'),dataDir=resolve(process.env.ARENA_DATA_DIR||'.arena');
mkdirSync(dataDir,{recursive:true});const file=resolve(dataDir,'state.json');
const databaseDir=resolve(process.env.ARENA_DATA_DIR||resolve(process.env.LOCALAPPDATA||homedir(),'FlagArena'));
const database=openDatabase(databaseDir);database.importLegacy(file);
const analytics=createAnalytics(database),exchangeRates=createExchangeRates(database);
setInterval(()=>void exchangeRates.refresh(),60000).unref();
const envKeys=configuredKeys();
const oauth=createSubscriberOAuth(dataDir,port);
let ledger:SubscriberLedger|undefined,savedVideoOwner='',subscriberEnabled=oauth.status().connected,subscriberBusy=false,subscriberStatus='Connect your channel to detect public subscribers.',subscriberLastCheck:string|undefined,subscriberNextRetry=0,subscriberFailures=0,subscriberRecords=0;
const diagnostics=createDiagnostics(dataDir);
// This estimate combines credentials and uses a different window from Google.
// Track it for visibility; only Google's actual quota responses stop API use.
const budget=createRequestBudget(dataDir,Date.now,9000,false);
let audio:AudioSettings={...defaultAudio},audioTest:{id:string;at:number}|undefined;
let savedMode:'demo'|'live'='demo';
let resume:{chat:string;page?:string;since:number}|undefined;
let demo=initialState(),live: ArenaState={...initialState(),mode:'live',status:'Disconnected — scores saved.'},savedVideo='';
const saved=database.load();
if(saved){
 const savedAudio=saved.audio as AudioSettings|undefined;
 if(savedAudio&&typeof savedAudio.muted==='boolean'&&typeof savedAudio.voice==='boolean'&&typeof savedAudio.volume==='number'&&savedAudio.volume>=0&&savedAudio.volume<=1)audio=savedAudio;
 const savedLedger=saved.subscriberLedger as SubscriberLedger|undefined;
 if(savedLedger?.ownerId&&Number.isFinite(savedLedger.baselineAt)&&savedLedger.known&&savedLedger.pending)ledger=savedLedger;
 savedVideoOwner=saved.videoOwner||'';demo=migrateScores(saved.demo);live=migrateScores(saved.live);savedVideo=saved.video||'';savedMode=saved.activeMode==='live'?'live':'demo';resume=saved.resume;
}
ledger=subscriberLedgerForStream(ledger,savedVideo);
// Only retained legacy votes can be imported; earlier history is not invented.
if(savedVideo&&!database.sql('SELECT 1 FROM streams WHERE id=?').get(savedVideo))database.transaction(()=>{
 analytics.stream(savedVideo,savedVideo,resume?.since??Date.now(),true);
 for(const vote of [...live.recent].reverse())analytics.vote(savedVideo,vote);
});
let state=savedMode==='live'?{...live,connected:false,status:'Disconnected — scores saved.'}:demo,session:{since:number;controller:AbortController;close:()=>void}|undefined,generation=0,connecting=false;
const clients=new Set<ServerResponse>();
function persist(){database.save({demo,live,video:savedVideo,resume,activeMode:state.mode,audio,subscriberLedger:ledger,videoOwner:savedVideoOwner});}
persist();
function displayState(){return {...state,audio,audioTest,seen:[],cooldowns:{},viewers:undefined};}
let broadcastTimer:ReturnType<typeof setTimeout>|undefined;
let lastBroadcastState:ArenaState|undefined,lastBroadcastVideo='';
function broadcast(){broadcastTimer=undefined;if(!clients.size)return;const current=displayState();const payload=JSON.stringify(liveUpdate(current,lastBroadcastState,lastBroadcastVideo!==savedVideo));lastBroadcastState=current;lastBroadcastVideo=savedVideo;for(const client of clients){if(client.writableLength>1024*1024){client.destroy();clients.delete(client);}else client.write(`data: ${payload}\n\n`);}}
function publish(){if(state.mode==='demo')demo=state;else live=state;persist();if(!broadcastTimer)broadcastTimer=setTimeout(broadcast,100);}
function finalizeMatch(){const next=settleMatch(state);if(next!==state){state=next;publish();}}
setInterval(()=>{try{finalizeMatch();}catch{console.error('Unable to save match results.');}},100).unref();
function stop(){generation++;const current=session;session=undefined;current?.controller.abort();current?.close();}
function beginStreaming(pool:KeyPool,chat:string){
 let source=createChatSource(pool.current(),chat);
 const resilientSource={close:()=>source.close(),async *read(page:string|undefined,signal:AbortSignal):AsyncGenerator<import('./chat-stream.ts').ChatBatch>{
  for(;;){try{for await(const batch of source.read(page,signal)){if(batch.nextPageToken)page=batch.nextPageToken;yield batch;}return;}catch(error){
   // Try each configured key once on authentication or resource exhaustion.
   // Permission and transient network errors retain their existing handling.
   if(![8,16].includes((error as {code?:number}).code??-1)||signal.aborted||!pool.advance())throw error;
   source.close();budget.reserve('stream');diagnostics.record({event:'stream_attempt',resuming:!!page});source=createChatSource(pool.current(),chat);
  }}
 }};
 if(!resume||resume.chat!==chat)resume={chat,since:Date.now()};
 const current={since:resume.since,controller:new AbortController(),close:resilientSource.close};session=current;
 state={...state,connected:false,status:'Connecting to YouTube streaming chat…'};publish();
 void consumeChat({read:resilientSource.read,signal:current.controller.signal,diagnostic:diagnostics.record,initialPage:resume.page,beforeAttempt:()=>budget.reserve('stream'),onInvalidPage:()=>{resume={chat,since:Date.now()};persist();},
  onBatch:batch=>{
   if(session!==current)return;finalizeMatch();
   const previous={state,live,demo,ledger,resume};let accepted=0;
   try{database.transaction(()=>{
    const tracked=database.sql('SELECT tracked_from FROM streams WHERE id=?').get(savedVideo);
    const processed=processEvents(analytics,savedVideo,state,batch,current.since,Number(tracked?.tracked_from??current.since));
    state=processed.state;accepted=processed.accepted;
    if(ledger&&ledger.ownerId===savedVideoOwner){const applied=applyPendingSubscribers(state,ledger);state=applied.state;ledger=applied.ledger;}
    if(batch.nextPageToken)resume={chat,since:current.since,page:batch.nextPageToken};
    live=state;persist();
   });}catch(error){({state,live,demo,ledger,resume}=previous);database.invalidate();throw error;}
   if(state!==previous.state&&!broadcastTimer)broadcastTimer=setTimeout(broadcast,100);
   diagnostics.record({event:'votes',accepted,ignored:(batch.items?.length||0)-accepted});
   void exchangeRates.refresh();
  },
  onStatus:(status,connected)=>{if(session!==current)return;if(state.status!==status||state.connected!==connected){state={...state,status,connected};publish();}}
 }).catch(()=>{if(session===current){state={...state,connected:false,status:'Chat processing failed. Reconnect to resume.'};publish();}}).finally(()=>{resilientSource.close();if(session===current)session=undefined;});
}
async function pollSubscribers(){
 if(Date.now()<subscriberNextRetry||subscriberBusy||!subscriberEnabled||!oauth.status().connected||!ledger)return;
 if(state.mode!=='live'||!state.connected){subscriberStatus='Waiting for live chat to connect.';return;}
 if(savedVideoOwner!==ledger.ownerId){subscriberStatus='Sign in to the channel that owns this livestream, then reconnect live chat.';return;}
 subscriberBusy=true;const expectedOwner=ledger.ownerId,expectedVideo=savedVideo,expectedGeneration=generation;
 try{
  const token=await oauth.access();subscriberRecords=0;
  await scanSubscribers(token,()=>budget.reserve('lookup'),()=>ledger!, (page,jobs,baseline)=>{
   if(generation!==expectedGeneration||!subscriberEnabled||ledger?.ownerId!==expectedOwner||savedVideo!==expectedVideo||state.mode!=='live'||!state.connected)return false;
   finalizeMatch();const previous={state,ledger,live,demo};
   try{database.transaction(()=>{
    if(baseline)ledger={...ledger!,initialized:true,baselineAt:Date.now(),scanJobs:jobs,known:{...ledger!.known,...Object.fromEntries(page.records.map(record=>[record.id,Date.now()]))}};
    else{const update=ingestSubscribers(state,ledger!,page.records);state=update.state;ledger={...update.ledger,scanJobs:jobs};}
    live=state;persist();
   });}catch(error){({state,ledger,live,demo}=previous);database.invalidate();throw error;}
   if(state!==previous.state&&!broadcastTimer)broadcastTimer=setTimeout(broadcast,100);
   subscriberRecords+=page.records.length;subscriberLastCheck=new Date().toISOString();return true;
  });
  if(generation!==expectedGeneration||!subscriberEnabled||ledger?.ownerId!==expectedOwner||savedVideo!==expectedVideo||state.mode!=='live')return;
  subscriberFailures=0;subscriberNextRetry=0;
  subscriberStatus=ledger?.scanJobs?.length?'Tracking active · catching up on older entries.':'Tracking active · checking new public subscribers every 15 seconds.';
 }catch(error){
  if(generation!==expectedGeneration||!subscriberEnabled||ledger?.ownerId!==expectedOwner||savedVideo!==expectedVideo||state.mode!=='live')return;
  if((error as {retryable?:boolean}).retryable){
   subscriberFailures++;const delay=Math.min(120000,15000*2**Math.min(subscriberFailures-1,3));
   subscriberNextRetry=Date.now()+delay;subscriberStatus=`Temporary subscriber connection problem. Retrying in ${delay/1000} seconds.`;
  }else{subscriberEnabled=false;subscriberStatus=(error as Error).message.startsWith('Local request budget')?'Local request accounting unavailable. Check diagnostics.':(error as Error).message.startsWith('Subscriber')||(error as Error).message.startsWith('Google')?(error as Error).message:'Subscriber tracking paused. Check authorization and network, then resume.';}
 }
 finally{subscriberBusy=false;}
}
setInterval(()=>void pollSubscribers(),15000).unref();
function json(res:ServerResponse,code:number,data:unknown){res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
createServer(async(req,res)=>{
 try{
  const host=req.headers.host||'';if(!/^(127\.0\.0\.1|localhost):\d+$/.test(host)){json(res,403,{error:'Local access only.'});return;}
  const url=new URL(req.url||'/',`http://${host}`);finalizeMatch();
  if(req.method==='GET'&&url.pathname==='/api/analytics/streams'){json(res,200,analytics.streams());return;}
  if(req.method==='GET'&&url.pathname==='/api/analytics'){
   const page=(name:string)=>{const value=Number(url.searchParams.get(name)||0);if(!Number.isSafeInteger(value)||value<0||value>100000)throw new Error('Invalid page');return value;};
   json(res,200,analytics.summary(url.searchParams.get('stream')||savedVideo,page('donorPage'),page('donationPage')));return;
  }
  if(req.method==='GET'&&url.pathname==='/api/events'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write(`data: ${JSON.stringify(displayState())}\n\n`);clients.add(res);const heartbeat=setInterval(()=>res.write(': keepalive\n\n'),15000);req.on('close',()=>{clearInterval(heartbeat);clients.delete(res);});return;}
  if(req.method==='GET'&&url.pathname==='/api/state'){json(res,200,{...state,audio,audioTest});return;}
  if(req.method==='GET'&&url.pathname==='/api/config'){json(res,200,{keyCount:envKeys.length,subscribers:{...oauth.status(),enabled:subscriberEnabled,status:subscriberStatus,lastCheck:subscriberLastCheck,ownerId:ledger?.ownerId,recordsLastCheck:subscriberRecords,pendingBonuses:Object.keys(ledger?.pending||{}).length,nextRetryAt:subscriberNextRetry?new Date(subscriberNextRetry).toISOString():null}});return;}
  if(req.method==='GET'&&url.pathname==='/api/subscribers/callback'){await oauth.callback(url.searchParams.get('code')||'',url.searchParams.get('state')||'');const token=await oauth.access();const owner=await subscriberRequest('channels',{part:'id',mine:'true'},token,()=>budget.reserve('lookup'));const ownerId=owner.items?.[0]?.id;if(!ownerId)throw new Error('No YouTube channel found for this sign-in.');if(ledger?.ownerId!==ownerId)ledger={ownerId,streamId:savedVideo,baselineAt:Date.now(),known:{},pending:{}};subscriberEnabled=true;subscriberStatus='Signed in. Waiting for the matching live channel.';persist();res.writeHead(303,{Location:'/','Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end();void pollSubscribers();return;}
  if(req.method==='GET'&&url.pathname==='/api/diagnostics'){json(res,200,{...diagnostics.read(),budget:budget.read(),resumeAvailable:!!resume?.page});return;}
  if(req.method==='POST'&&url.pathname.startsWith('/api/')){
   const origin=req.headers.origin;if(origin&&!['http://127.0.0.1:3000','http://localhost:3000',`http://127.0.0.1:${port}`,`http://localhost:${port}`].includes(origin)){json(res,403,{error:'This origin cannot control the arena.'});return;}
   if(!req.headers['content-type']?.startsWith('application/json')){json(res,415,{error:'JSON required.'});return;}
   let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>8192){json(res,413,{error:'Request too large.'});return;}}const body=JSON.parse(raw||'{}');
   if(url.pathname==='/api/subscribers/connect'){json(res,200,{url:oauth.start()});return;}
   if(url.pathname==='/api/subscribers/resume'){subscriberEnabled=true;subscriberNextRetry=0;void pollSubscribers();json(res,200,{ok:true});return;}
   if(url.pathname==='/api/subscribers/disconnect'){subscriberEnabled=false;await oauth.disconnect();ledger=undefined;state={...state,subscriberAlerts:[]};subscriberStatus='Subscriber tracking disconnected.';publish();json(res,200,{ok:true});return;}
   if(url.pathname==='/api/subscribers/test'){if(state.mode!=='demo')throw new Error('Subscriber test is available in demo mode only.');const demoLedger:SubscriberLedger={ownerId:'demo',baselineAt:0,known:{},pending:{}};const viewer='Demo subscriber',now=Date.now();const testState:ArenaState={...state,recent:[{id:crypto.randomUUID(),viewerId:viewer,viewer,text:'Indonesia',code:'ID',time:now},...state.recent].slice(0,500)};const simulated=ingestSubscribers(testState,demoLedger,[{id:viewer,name:viewer,publishedAt:now}],now).state;state={...simulated,recent:state.recent};publish();json(res,200,{ok:true});return;}
   if(url.pathname==='/api/audio'){if(typeof body.muted!=='boolean'||typeof body.voice!=='boolean'||typeof body.volume!=='number'||!Number.isFinite(body.volume)||body.volume<0||body.volume>1)throw new Error('Invalid audio settings.');if(body.overtakeStyle!==undefined&&!['grouped','all'].includes(String(body.overtakeStyle)))throw new Error('Invalid announcement style.');audio={overtakeStyle:body.overtakeStyle as 'grouped'|'all'|undefined,muted:body.muted,voice:body.voice,volume:body.volume};publish();json(res,200,{ok:true});return;}
   if(url.pathname==='/api/audio/test'){audioTest={id:crypto.randomUUID(),at:Date.now()};publish();json(res,200,{ok:true});return;}
   if(url.pathname==='/api/match/finish'){state=finishMatch(state);publish();json(res,200,{ok:true});return;}
   if(url.pathname==='/api/match/next'){if(typeof body.reset!=='boolean')throw new Error('Choose reset or keep scores.');state=nextMatch(state,body.reset);if(ledger)ledger={...ledger,pending:{}};if(state.mode==='live'&&resume){resume={...resume,since:state.match!.openedAt!};if(session)session.since=resume.since;}publish();json(res,200,{ok:true});return;}
   if(url.pathname==='/api/vote'){if(state.mode==='live')throw new Error('Test votes are disabled while live scores are displayed. Disconnect first.');if(typeof body.viewer!=='string'||!body.viewer.trim()||body.viewer.length>60||typeof body.text!=='string'||body.text.length>200)throw new Error('Enter a viewer name and a country vote.');const result=acceptVote(state,{id:crypto.randomUUID(),viewerId:body.viewer.trim(),viewer:body.viewer.trim(),text:body.text,time:Date.now()});if(result.accepted){state=result.state;publish();}json(res,200,{accepted:result.accepted,reason:result.reason});return;}
   if(url.pathname==='/api/reset'){if(state.match&&state.match.phase!=='open')throw new Error('Use the next-match buttons after results.');if(ledger)ledger={...ledger,pending:{}};state={...initialState(),mode:state.mode,connected:state.connected,status:state.status,seen:state.seen,cooldowns:state.cooldowns};if(state.mode==='live'&&resume){resume={...resume,since:Date.now()};if(session)session.since=resume.since;}publish();json(res,200,{ok:true});return;}
   if(url.pathname==='/api/disconnect'){stop();state=demo;publish();json(res,200,{ok:true});return;}
   if(url.pathname==='/api/connect'){
    if(connecting||session)throw new Error('A connection is already active or in progress.');
    if(typeof body.video!=='string'||(!envKeys.length&&(typeof body.credential!=='string'||!body.credential.trim())))throw new Error('Enter the stream URL and configure YOUTUBE_API_KEYS in .env.');
    const id=videoId(body.video.trim());connecting=true;const operation=++generation;
    try{const pool=new KeyPool(envKeys.length?envKeys:[body.credential.trim()]);const info=await pool.lookup(async key=>{budget.reserve('lookup');diagnostics.record({event:'video_lookup'});return youtube('videos',{id,part:'liveStreamingDetails,snippet'},key).catch(error=>{diagnostics.record({event:'video_lookup_error'});throw error;});});const chat=info.items?.[0]?.liveStreamingDetails?.activeLiveChatId;if(!chat)throw new Error('No active live chat found. Start the livestream with live chat enabled, then reconnect.');if(generation!==operation)throw new Error('Connection cancelled.');const restored=database.loadLive(id);state={...(restored??initialState()),mode:'live'};resume=database.get<{resume?:typeof resume}>('checkpoint:'+id)?.resume;const nextLedger=subscriberLedgerForStream(ledger,id);if(nextLedger!==ledger){ledger=nextLedger;subscriberRecords=0;subscriberLastCheck=undefined;subscriberNextRetry=0;subscriberFailures=0;subscriberEnabled=oauth.status().connected;subscriberStatus='New livestream · preparing subscriber tracking.';state={...state,subscriberAlerts:[]};}savedVideo=id;savedVideoOwner=info.items?.[0]?.snippet?.channelId||'';analytics.stream(id,info.items?.[0]?.snippet?.title||id);beginStreaming(pool,chat);json(res,200,{ok:true});}finally{connecting=false;}return;
   }
   json(res,404,{error:'Unknown action.'});return;
  }
  if(req.method==='GET'&&!url.pathname.startsWith('/api/')){const target=resolve(root,'.'+decodeURIComponent(url.pathname));if(target!==root&&!target.startsWith(root+sep)){json(res,403,{error:'Invalid path.'});return;}const path=existsSync(target)&&statSync(target).isFile()?target:resolve(root,'index.html');if(!existsSync(path)){json(res,503,{error:'Run npm run build first, or open the development preview on port 3000.'});return;}const types:Record<string,string>={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.wav':'audio/wav'};res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream'});createReadStream(path).pipe(res);return;}
  json(res,404,{error:'Not found.'});
 }catch(e){if(!res.headersSent)json(res,400,{error:(e as Error).message});else res.end();}
}).listen(port,'127.0.0.1',()=>console.log(`Flag Arena: http://127.0.0.1:${port}/`));
