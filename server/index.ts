import {createServer,type ServerResponse} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,renameSync,existsSync,statSync,createReadStream,copyFileSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {initialState,acceptVote,migrateScores,type ArenaState} from '../lib/arena.ts';
import {videoId,youtube} from './youtube.ts';
import {createChatSource,consumeChat,applyChatBatch} from './chat-stream.ts';
import {createDiagnostics} from './diagnostics.ts';
import {createRequestBudget} from './request-budget.ts';
const port=Number(process.env.ARENA_PORT||4318),root=resolve('dist'),dataDir=resolve(process.env.ARENA_DATA_DIR||'.arena');
mkdirSync(dataDir,{recursive:true});const file=resolve(dataDir,'state.json');
const diagnostics=createDiagnostics(dataDir);
const budget=createRequestBudget(dataDir);
let resume:{chat:string;page?:string;since:number}|undefined;
let demo=initialState(),live: ArenaState={...initialState(),mode:'live',status:'Disconnected — scores saved.'},savedVideo='';
function readSaved(path:string){const saved=JSON.parse(readFileSync(path,'utf8'));for(const value of [saved.demo,saved.live]){if(!value?.scores||!Array.isArray(value.recent)||!Array.isArray(value.seen)||!value.cooldowns||Object.values(value.scores).some(n=>typeof n!=='number'||!Number.isFinite(n)||n<0))throw new Error('Invalid saved scores');}return saved;}
if(existsSync(file)){try{let saved;try{saved=readSaved(file);}catch{saved=readSaved(file+'.backup');copyFileSync(file,file+'.unreadable-'+Date.now());copyFileSync(file+'.backup',file);console.error('Recovered saved scores from backup.');}demo=migrateScores(saved.demo);live=migrateScores(saved.live);savedVideo=saved.video||'';if(typeof saved.resume?.chat==='string'&&Number.isFinite(saved.resume.since)&&(saved.resume.page===undefined||typeof saved.resume.page==='string'))resume=saved.resume;}catch{console.error('Saved scores and backup could not be read. Files preserved.');process.exit(1);}}
let state=demo,session:{since:number;controller:AbortController;close:()=>void}|undefined,generation=0,connecting=false;
const clients=new Set<ServerResponse>();
function persist(){const temporary=file+'.tmp';writeFileSync(temporary,JSON.stringify({demo,live,video:savedVideo,resume}),{flush:true});if(existsSync(file)){copyFileSync(file,file+'.backup.tmp');renameSync(file+'.backup.tmp',file+'.backup');}renameSync(temporary,file);}
function displayState(){return {...state,seen:[],cooldowns:{}};}
function publish(){if(state.mode==='demo')demo=state;else live=state;persist();const payload=JSON.stringify(displayState());for(const client of clients){if(client.writableLength>1024*1024){client.destroy();clients.delete(client);}else client.write(`data: ${payload}\n\n`);}}
function stop(){generation++;const current=session;session=undefined;current?.controller.abort();current?.close();}
function beginStreaming(key:string,chat:string){
 const source=createChatSource(key,chat);
 if(!resume||resume.chat!==chat)resume={chat,since:Date.now()};
 const current={since:resume.since,controller:new AbortController(),close:source.close};session=current;
 state={...state,connected:false,status:'Connecting to YouTube streaming chat…'};publish();
 void consumeChat({read:source.read,signal:current.controller.signal,diagnostic:diagnostics.record,initialPage:resume.page,beforeAttempt:()=>budget.reserve('stream'),onInvalidPage:()=>{resume={chat,since:Date.now()};persist();},
  onBatch:batch=>{if(session!==current)return;const previous=state;state=applyChatBatch(state,batch,current.since);const accepted=(Object.values(state.scores).reduce((a,b)=>a+b,0)-Object.values(previous.scores).reduce((a,b)=>a+b,0))/100;diagnostics.record({event:'votes',accepted,ignored:(batch.items?.length||0)-accepted});const changed=!!batch.nextPageToken&&batch.nextPageToken!==resume?.page;if(batch.nextPageToken)resume={chat,since:current.since,page:batch.nextPageToken};if(state!==previous)publish();else if(changed)persist();},
  onStatus:(status,connected)=>{if(session!==current)return;if(state.status!==status||state.connected!==connected){state={...state,status,connected};publish();}}
 }).catch(()=>{if(session===current){state={...state,connected:false,status:'Chat processing failed. Reconnect to resume.'};publish();}}).finally(()=>{source.close();if(session===current)session=undefined;});
}
function json(res:ServerResponse,code:number,data:unknown){res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
createServer(async(req,res)=>{
 try{
  const host=req.headers.host||'';if(!/^(127\.0\.0\.1|localhost):\d+$/.test(host)){json(res,403,{error:'Local access only.'});return;}
  const url=new URL(req.url||'/',`http://${host}`);
  if(req.method==='GET'&&url.pathname==='/api/events'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write(`data: ${JSON.stringify(displayState())}\n\n`);clients.add(res);const heartbeat=setInterval(()=>res.write(': keepalive\n\n'),15000);req.on('close',()=>{clearInterval(heartbeat);clients.delete(res);});return;}
  if(req.method==='GET'&&url.pathname==='/api/state'){json(res,200,state);return;}
  if(req.method==='GET'&&url.pathname==='/api/diagnostics'){json(res,200,{...diagnostics.read(),budget:budget.read(),resumeAvailable:!!resume?.page});return;}
  if(req.method==='POST'&&url.pathname.startsWith('/api/')){
   const origin=req.headers.origin;if(origin&&!['http://127.0.0.1:3000','http://localhost:3000',`http://127.0.0.1:${port}`,`http://localhost:${port}`].includes(origin)){json(res,403,{error:'This origin cannot control the arena.'});return;}
   if(!req.headers['content-type']?.startsWith('application/json')){json(res,415,{error:'JSON required.'});return;}
   let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>8192){json(res,413,{error:'Request too large.'});return;}}const body=JSON.parse(raw||'{}');
   if(url.pathname==='/api/vote'){if(state.mode==='live')throw new Error('Test votes are disabled while live scores are displayed. Disconnect first.');if(typeof body.viewer!=='string'||!body.viewer.trim()||body.viewer.length>60||typeof body.text!=='string'||body.text.length>200)throw new Error('Enter a viewer name and a country vote.');const result=acceptVote(state,{id:crypto.randomUUID(),viewerId:body.viewer.trim(),viewer:body.viewer.trim(),text:body.text,time:Date.now()});if(result.accepted){state=result.state;publish();}json(res,200,{accepted:result.accepted,reason:result.reason});return;}
   if(url.pathname==='/api/reset'){state={...initialState(),mode:state.mode,connected:state.connected,status:state.status,seen:state.seen,cooldowns:state.cooldowns};if(state.mode==='live'&&resume){resume={...resume,since:Date.now()};if(session)session.since=resume.since;}publish();json(res,200,{ok:true});return;}
   if(url.pathname==='/api/disconnect'){stop();state=demo;publish();json(res,200,{ok:true});return;}
   if(url.pathname==='/api/connect'){
    if(connecting||session)throw new Error('A connection is already active or in progress.');
    if(typeof body.video!=='string'||typeof body.credential!=='string'||!body.credential.trim())throw new Error('Enter the stream URL and API key.');
    const id=videoId(body.video.trim());connecting=true;const operation=++generation;
    try{const key=body.credential.trim();budget.reserve('lookup');diagnostics.record({event:'video_lookup'});const info=await youtube('videos',{id,part:'liveStreamingDetails'},key).catch(error=>{diagnostics.record({event:'video_lookup_error'});throw error;});const chat=info.items?.[0]?.liveStreamingDetails?.activeLiveChatId;if(!chat)throw new Error('No active live chat found. Start the livestream with live chat enabled, then reconnect.');if(generation!==operation)throw new Error('Connection cancelled.');state=savedVideo===id?{...live,mode:'live'}:{...initialState(),mode:'live'};if(savedVideo!==id)resume=undefined;savedVideo=id;beginStreaming(key,chat);json(res,200,{ok:true});}finally{connecting=false;}return;
   }
   json(res,404,{error:'Unknown action.'});return;
  }
  if(req.method==='GET'&&!url.pathname.startsWith('/api/')){const target=resolve(root,'.'+decodeURIComponent(url.pathname));if(target!==root&&!target.startsWith(root+sep)){json(res,403,{error:'Invalid path.'});return;}const path=existsSync(target)&&statSync(target).isFile()?target:resolve(root,'index.html');if(!existsSync(path)){json(res,503,{error:'Run npm run build first, or open the development preview on port 3000.'});return;}const types:Record<string,string>={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream'});createReadStream(path).pipe(res);return;}
  json(res,404,{error:'Not found.'});
 }catch(e){if(!res.headersSent)json(res,400,{error:(e as Error).message});else res.end();}
}).listen(port,'127.0.0.1',()=>console.log(`Flag Arena: http://127.0.0.1:${port}/`));
