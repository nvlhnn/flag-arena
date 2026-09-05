import {createServer,type ServerResponse} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,renameSync,existsSync,statSync,createReadStream} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {initialState,acceptVote,type ArenaState} from '../lib/arena.ts';
import {videoId,youtube} from './youtube.ts';
const port=Number(process.env.ARENA_PORT||4318),root=resolve('dist'),dataDir=resolve(process.env.ARENA_DATA_DIR||'.arena');
mkdirSync(dataDir,{recursive:true});const file=resolve(dataDir,'state.json');
let demo=initialState(),live: ArenaState={...initialState(),mode:'live',status:'Disconnected — scores saved.'},savedVideo='';
if(existsSync(file)){try{const saved=JSON.parse(readFileSync(file,'utf8'));if(saved.demo?.scores&&saved.live?.scores){demo=saved.demo;live=saved.live;savedVideo=saved.video||'';}}catch{console.error('Saved scores could not be read. The original file is preserved.');process.exit(1);}}
let state=demo,session:{key:string;chat:string;page?:string;since:number;generation:number}|undefined,timer:NodeJS.Timeout|undefined,generation=0,connecting=false;
const clients=new Set<ServerResponse>();
function persist(){const temporary=file+'.tmp';writeFileSync(temporary,JSON.stringify({demo,live,video:savedVideo}));renameSync(temporary,file);}
function publish(){if(state.mode==='demo')demo=state;else live=state;persist();const payload=JSON.stringify(state);for(const client of clients)client.write(`data: ${payload}\n\n`);}
function stop(){generation++;session=undefined;if(timer)clearTimeout(timer);timer=undefined;}
async function poll(first=false){
 const current=session;if(!current)return;
 try{
  const params:Record<string,string>={liveChatId:current.chat,part:'id,snippet,authorDetails',maxResults:'2000'};if(current.page)params.pageToken=current.page;
  const data=await youtube('liveChat/messages',params,current.key);if(session!==current)return;
  current.page=data.nextPageToken;
  for(const item of data.items||[]){const time=Date.parse(item.snippet?.publishedAt);if(first||!Number.isFinite(time)||time<current.since||item.snippet?.type!=='textMessageEvent'||!item.authorDetails?.channelId)continue;const result=acceptVote(state,{id:item.id,viewerId:item.authorDetails.channelId,viewer:item.authorDetails.displayName||'Viewer',text:item.snippet.textMessageDetails?.messageText||'',time});if(result.accepted)state=result.state;}
  state={...state,connected:!data.offlineAt,status:data.offlineAt?'Stream ended. Scores saved.':'Connected — listening for country votes.'};publish();
  if(data.offlineAt){stop();return;}
  timer=setTimeout(()=>void poll(),Math.max(1000,data.pollingIntervalMillis||5000));
 }catch(e){if(session!==current)return;stop();state={...state,connected:false,status:(e as Error).message};publish();if(first)throw e;}
}
function json(res:ServerResponse,code:number,data:unknown){res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
createServer(async(req,res)=>{
 try{
  const host=req.headers.host||'';if(!/^(127\.0\.0\.1|localhost):\d+$/.test(host)){json(res,403,{error:'Local access only.'});return;}
  const url=new URL(req.url||'/',`http://${host}`);
  if(req.method==='GET'&&url.pathname==='/api/events'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write(`data: ${JSON.stringify(state)}\n\n`);clients.add(res);const heartbeat=setInterval(()=>res.write(': keepalive\n\n'),15000);req.on('close',()=>{clearInterval(heartbeat);clients.delete(res);});return;}
  if(req.method==='GET'&&url.pathname==='/api/state'){json(res,200,state);return;}
  if(req.method==='POST'&&url.pathname.startsWith('/api/')){
   const origin=req.headers.origin;if(origin&&!['http://127.0.0.1:3000','http://localhost:3000',`http://127.0.0.1:${port}`,`http://localhost:${port}`].includes(origin)){json(res,403,{error:'This origin cannot control the arena.'});return;}
   if(!req.headers['content-type']?.startsWith('application/json')){json(res,415,{error:'JSON required.'});return;}
   let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>8192){json(res,413,{error:'Request too large.'});return;}}const body=JSON.parse(raw||'{}');
   if(url.pathname==='/api/vote'){if(state.mode==='live')throw new Error('Test votes are disabled while live scores are displayed. Disconnect first.');if(typeof body.viewer!=='string'||!body.viewer.trim()||body.viewer.length>60||typeof body.text!=='string'||body.text.length>200)throw new Error('Enter a viewer name and a country vote.');const result=acceptVote(state,{id:crypto.randomUUID(),viewerId:body.viewer.trim(),viewer:body.viewer.trim(),text:body.text,time:Date.now()});if(result.accepted){state=result.state;publish();}json(res,200,{accepted:result.accepted,reason:result.reason});return;}
   if(url.pathname==='/api/reset'){state={...initialState(),mode:state.mode,connected:state.connected,status:state.status,seen:state.seen,cooldowns:state.cooldowns};if(session)session.since=Date.now();publish();json(res,200,{ok:true});return;}
   if(url.pathname==='/api/disconnect'){stop();state=demo;publish();json(res,200,{ok:true});return;}
   if(url.pathname==='/api/connect'){
    if(connecting||session)throw new Error('A connection is already active or in progress.');
    if(typeof body.video!=='string'||typeof body.credential!=='string'||!body.credential.trim())throw new Error('Enter the stream URL and API key.');
    const id=videoId(body.video.trim());connecting=true;const operation=++generation;
    try{const key=body.credential.trim();const info=await youtube('videos',{id,part:'liveStreamingDetails'},key);const chat=info.items?.[0]?.liveStreamingDetails?.activeLiveChatId;if(!chat)throw new Error('No active live chat found. Start the livestream with live chat enabled, then reconnect.');if(generation!==operation)throw new Error('Connection cancelled.');const previous=state;const previousLive=live;const previousVideo=savedVideo;state=savedVideo===id?{...live,mode:'live'}:{...initialState(),mode:'live'};session={key,chat,since:Date.now(),generation:operation};try{await poll(true);savedVideo=id;publish();}catch(e){state=previous;live=previousLive;savedVideo=previousVideo;publish();throw e;}json(res,200,{ok:true});}finally{connecting=false;}return;
   }
   json(res,404,{error:'Unknown action.'});return;
  }
  if(req.method==='GET'&&!url.pathname.startsWith('/api/')){const target=resolve(root,'.'+decodeURIComponent(url.pathname));if(target!==root&&!target.startsWith(root+sep)){json(res,403,{error:'Invalid path.'});return;}const path=existsSync(target)&&statSync(target).isFile()?target:resolve(root,'index.html');if(!existsSync(path)){json(res,503,{error:'Run npm run build first, or open the development preview on port 3000.'});return;}const types:Record<string,string>={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream'});createReadStream(path).pipe(res);return;}
  json(res,404,{error:'Not found.'});
 }catch(e){if(!res.headersSent)json(res,400,{error:(e as Error).message});else res.end();}
}).listen(port,'127.0.0.1',()=>console.log(`Flag Arena: http://127.0.0.1:${port}/`));
