'use client';
import {VoteEvent} from '../components/vote-event';
import {SubscriberControls} from '../components/subscriber-controls';
import {SubscriberAlert} from '../components/subscriber-alert';
import {AudioControls} from '../components/audio-controls';
import {StreamAudio} from '../components/stream-audio';
import {defaultAudio} from '../lib/audio-events';
import { useEffect, useState, useRef } from 'react';
import { Flag, Radio, Play, Pause, ExternalLink, Copy, RotateCcw, ChevronRight, Check, Trophy, ThumbsUp, Bell, MessageCircle } from 'lucide-react';
import { countries, initialState, acceptVote, migrateScores, type ArenaState } from '../lib/arena';
import {registerArenaTools} from '../lib/webmcp';
import {AnimatedFlag} from '../components/animated-flag';
import {MatchOverlay} from '../components/match-overlay';
import {finishMatch,settleMatch,nextMatch} from '../lib/match';
import {queueVoters,type VoterEffect} from '../lib/voter-effects';
const KEY='flag-arena-demo-v1';
const flag=(code:string)=><span role="img" aria-label={countries.find(c=>c.code===code)?.name||code} className={`fi fi-${code.toLowerCase()}`}/>;
export default function Home(){
 const [studioTab,setStudioTab]=useState('live');
 const [keyCount,setKeyCount]=useState(0);
 const [state,setState]=useState<ArenaState>(initialState());
 const [overlay,setOverlay]=useState(false),[local,setLocal]=useState(false),[ready,setReady]=useState(false),[running,setRunning]=useState(false);
 const [message,setMessage]=useState('Indonesia'),[viewer,setViewer]=useState('Test viewer'),[notice,setNotice]=useState(''),[video,setVideo]=useState(''),[credential,setCredential]=useState('');
 const [effects,setEffects]=useState<VoterEffect[]>([]);
 const seenEffects=useRef(new Set<string>());
 const receivedInitialState=useRef(false);
 const receivedMode=useRef<string|undefined>(undefined);
 useEffect(()=>{const now=Date.now();const fresh=state.recent.filter(v=>!seenEffects.current.has(v.id));for(const v of state.recent)seenEffects.current.add(v.id);if(seenEffects.current.size>2000)seenEffects.current=new Set(state.recent.map(v=>v.id));if(fresh.length)setEffects(old=>queueVoters(old,fresh,now));},[state.recent]);
 useEffect(()=>{const timer=setInterval(()=>setEffects(old=>old.some(v=>v.expires<=Date.now())?old.filter(v=>v.expires>Date.now()):old),250);return()=>clearInterval(timer);},[]);
 const [busy,setBusy]=useState(false),[confirmReset,setConfirmReset]=useState(false);
 const [diagnostics,setDiagnostics]=useState<{budget?:{estimatedUnits:number;limit:number;requestsLastHour:number;blocked:boolean};lastConnectionDurationMs?:number;acceptedVotes?:number;ignoredMessages?:number;lastMessageAt?:string;resumeAvailable?:boolean}|null>(null);
 useEffect(()=>{if(!local||overlay)return;const controller=new AbortController();const update=async()=>{try{const response=await fetch('/api/diagnostics',{signal:controller.signal});if(response.ok)setDiagnostics(await response.json());}catch{/* Retry on the next interval. */}};void update();const timer=setInterval(()=>void update(),10000);return()=>{controller.abort();clearInterval(timer);};},[local,overlay]);
 useEffect(()=>{
  setOverlay(new URLSearchParams(location.search).get('overlay')==='1');
  const isLocal=['localhost','127.0.0.1'].includes(location.hostname);setLocal(isLocal);
  if(!isLocal){try{const saved=localStorage.getItem(KEY);if(saved)setState(migrateScores(JSON.parse(saved)));}catch{}setReady(true);
   const sync=(e:StorageEvent)=>{if(e.key===KEY&&e.newValue){try{setState(migrateScores(JSON.parse(e.newValue)));}catch{}}};window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);
  }
  const source=new EventSource('/api/events');source.onmessage=e=>{const incoming=JSON.parse(e.data);if(!receivedInitialState.current||receivedMode.current!==incoming.mode){seenEffects.current.clear();setEffects([]);receivedMode.current=incoming.mode;for(const vote of incoming.recent)seenEffects.current.add(vote.id);receivedInitialState.current=true;}setState(incoming);setReady(true);setNotice(previous=>previous.startsWith('Local connection interrupted.')?'':previous);};source.onerror=()=>setNotice('Local connection interrupted. Keep Flag Arena running; reconnecting…');return()=>source.close();
 },[]);
 useEffect(()=>{if(ready&&!local){try{localStorage.setItem(KEY,JSON.stringify(state));}catch{}}},[state,local,ready]);
 async function action(name:string,body:Record<string,unknown>={}){
  if(local){const r=await fetch(`/api/${name}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw new Error(data.error||'Action could not be completed.');return data;}
  if(name==='audio'){setState({...state,audio:{overtakeStyle:body.overtakeStyle as 'grouped'|'all'|undefined,muted:body.muted===true,voice:body.voice===true,volume:Number(body.volume)}});return {};}
  if(name==='audio/test'){setState({...state,audioTest:{id:crypto.randomUUID(),at:Date.now()}});return {};}
  if(name==='vote'){const result=acceptVote(state,{id:crypto.randomUUID(),viewerId:String(body.viewer),viewer:String(body.viewer),text:String(body.text),time:Date.now()});if(result.accepted)setState(result.state);return result;}
  if(name==='match/finish'){setState(finishMatch(state));return {};}
  if(name==='match/next'){setState(nextMatch(settleMatch(state),body.reset===true));return {};}
  if(name==='reset'){setState(initialState());return {};}
  throw new Error('Use the local Flag Arena control panel to connect YouTube.');
 }
 useEffect(()=>{if(!running||state.mode==='live'||state.match?.phase==='results')return;const timer=setInterval(()=>{const c=countries[Math.floor(Math.random()*30)];void action('vote',{viewer:`Demo fan ${Math.floor(Math.random()*80)}`,text:c.name}).catch(e=>{setNotice(e.message);setRunning(false);});},950);return()=>clearInterval(timer);},[running,state,local]);
 useEffect(()=>{if(local||!ready||state.match?.phase!=='countdown')return;const timer=setTimeout(()=>setState(current=>settleMatch(current)),Math.max(0,(state.match.endsAt??Date.now())-Date.now()));return()=>clearTimeout(timer);},[local,ready,state.match]);
 const apiRef=useRef({state,action});apiRef.current={state,action};
 useEffect(()=>registerArenaTools(()=>({mode:apiRef.current.state.mode,scores:apiRef.current.state.scores}),async(viewer,text)=>{if(apiRef.current.state.mode==='live')throw new Error('Demo votes are disabled in live mode.');return apiRef.current.action('vote',{viewer,text});}),[]);
 const ranked=[...countries].sort((a,b)=>(state.scores[b.code]||0)-(state.scores[a.code]||0)||a.name.localeCompare(b.name));
 const total=Object.values(state.scores).reduce((a,b)=>a+b,0),leader=total?ranked[0]:undefined,latest=state.recent[0],active=ranked.filter(c=>state.scores[c.code]);
 const grid=(total?ranked:countries).slice(0,120);
 async function vote(e:React.FormEvent){e.preventDefault();try{const r=await action('vote',{viewer,text:message});setNotice(r.accepted?'Vote counted!':r.reason);}catch(e){setNotice((e as Error).message);}}
 async function connect(e:React.FormEvent){e.preventDefault();setBusy(true);setRunning(false);try{await action('connect',{video,credential});setCredential('');setNotice('Stream found. Opening the YouTube chat connection…');}catch(e){setNotice((e as Error).message);}finally{setBusy(false);}}
 async function matchAction(name:string,reset?:boolean){setBusy(true);try{await action(name,reset===undefined?{}:{reset});setEffects([]);if(reset!==undefined)setRunning(false);setNotice('');}catch(error){setNotice((error as Error).message);}finally{setBusy(false);}}
 const board=<section className="arena" aria-label="Vertical stream scoreboard">
  <MatchOverlay match={state.match}/><SubscriberAlert alerts={state.subscriberAlerts}/>
  <div className="reward-strip"><div><MessageCircle/><span>Chat vote<b>+1–5 points</b></span></div><div><Bell/><span>Subscribe<b>+50 points</b></span></div></div>
  <div className="leader-card"><div className="leader-label"><Trophy/>{leader?'CURRENT LEADER':'THE TOP SPOT IS OPEN'}</div><div className="leader-main">{leader?flag(leader.code):<Flag/>}<div><h3>{leader?.name||'Who goes first?'}</h3><span>{leader?'Your country could take the lead':'Every country starts at zero'}</span></div><strong>{leader?state.scores[leader.code].toLocaleString():'—'}<small>POINTS</small></strong></div></div>
  <div className="flag-grid">{grid.map((c,i)=>{const effect=effects.find(v=>v.code===c.code&&v.starts<=Date.now()&&v.expires>Date.now());return <div key={c.code} className={`country-tile ${effect?'has-pop':''} ${leader?.code===c.code?'first':''}`} title={`${c.name}: ${state.scores[c.code]||0} points`}><small>{i===0&&total?'#1':String(i+1)}</small><AnimatedFlag voteId={effect?.id}>{flag(c.code)}</AnimatedFlag><strong>{new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(state.scores[c.code]||0)}</strong>{effect&&<div key={effect.id} className={`voter-popup ${i%8<2?'popup-left':i%8>5?'popup-right':''}`}><b>{effect.viewer}</b></div>}</div>;})}</div>
  <VoteEvent votes={state.recent} mode={state.mode}/>

  <div className="arena-footer"><b>TYPE YOUR COUNTRY · LEVEL UP TO +5</b><span>{state.mode==='live'?(state.connected?'LIVE':'CHAT PAUSED'):'DEMO'} - NO VOTE COOLDOWN</span></div>
 </section>;
 if(overlay)return <main className="overlay-only">{ready&&<StreamAudio state={state}/ >}{board}</main>;
 return <main className="studio"><header className="studio-header"><a className="brand" href="/"><span><Flag size={20} fill="currentColor"/></span>Flag Arena <small>STUDIO</small></a><div className="header-right"><span className="status-dot"/>{state.connected?'YouTube connected':'Stream not connected'}</div></header>
 <div className="workspace"><aside className="controls"><div className="studio-intro"><div className="eyebrow">CONTROL ROOM</div><h1>Stream studio</h1><p>Manage your match, subscribers, and sound.</p></div>
 <nav className="studio-tabs" aria-label="Studio controls">{[["live","Live"],["subscribers","Subscribers"],["audio","Audio"],["setup","OBS & health"]].map(([id,label])=><button key={id} aria-pressed={studioTab===id} aria-controls={`studio-${id}`} onClick={()=>setStudioTab(id)}>{label}</button>)}</nav>
 <div className="studio-panels">
<section id="studio-live" hidden={studioTab!=="live"} aria-label="Live controls"> <div className="control-card match-controls"><div className="card-title"><Trophy size={19}/><h2>Match controls</h2></div>{state.match?.phase==='results'?<><p>Results are on screen. Choose how the next match starts.</p><button className="primary" disabled={busy} onClick={()=>void matchAction('match/next',true)}>New match — reset scores</button><button className="secondary" disabled={busy} onClick={()=>void matchAction('match/next',false)}>Continue — keep scores</button></>:state.match?.phase==='countdown'?<p role="status">Final 10 seconds! Voting stays open until zero.</p>:<><p>Give viewers 10 final seconds, then reveal the top five countries.</p><button className="primary" disabled={!ready||busy} onClick={()=>void matchAction('match/finish')}>Finish match · 10s countdown</button></>}</div>
 <div className="control-card"><div className="card-title"><h2>Connect YouTube</h2></div>{local?<form onSubmit={connect}><p>When your stream is live, paste its link. Configured API keys are read from the local .env file and are never sent to the overlay.</p><label htmlFor="video">Livestream URL</label><input id="video" placeholder="https://youtube.com/watch?v=…" value={video} onChange={e=>setVideo(e.target.value)} required/>{keyCount?<small>{keyCount} API keys configured locally. Keys are tried in order on credential or quota errors; chat pauses when all keys fail.</small>:<><label htmlFor="credential">YouTube Data API key</label><input id="credential" type="password" autoComplete="off" value={credential} onChange={e=>setCredential(e.target.value)} required/></>}<button className="secondary" disabled={busy||state.connected}>{busy?'Connecting…':'Connect live chat'}</button>{state.mode==='live'&&<button type="button" className="text-button" onClick={()=>void action('disconnect').catch(e=>setNotice(e.message))}>Disconnect chat</button>}</form>:<p>This preview uses demo votes. Connect real YouTube chat from the local Flag Arena app on your streaming PC.</p>}<div className="connection-info"><span className="status-dot"/>{state.status}</div></div>
<details className="demo-tools"><summary>Test with demo votes</summary> <div className="control-card"><div className="card-title"><h2>Try the arena</h2><span className="tag">DEMO</span></div><p>See the scoreboard react before going live. Demo votes stay separate from your stream.</p><button className="primary" disabled={!ready||state.mode==='live'} onClick={()=>setRunning(!running)}>{running?<Pause size={16}/>:<Play size={16} fill="currentColor"/>}{running?'Pause demo':'Start demo'}<ChevronRight size={16}/></button><form onSubmit={vote}><label htmlFor="viewer">Test viewer</label><input id="viewer" maxLength={60} value={viewer} onChange={e=>setViewer(e.target.value)} required/><label htmlFor="message">Try a chat vote</label><div className="input-row"><input id="message" maxLength={200} value={message} onChange={e=>setMessage(e.target.value)} required/><button disabled={!ready||state.mode==='live'} type="submit" aria-label="Send test vote"><ChevronRight size={19}/></button></div><small>Country name, flag emoji, or !vote ID</small></form></div>
</details></section>
<section id="studio-subscribers" hidden={studioTab!=="subscribers"} aria-label="Subscriber controls"> <SubscriberControls local={local} demo={state.mode==='demo'} action={action} onKeys={setKeyCount}/>
{!local&&<p>Open the local app to configure subscriber tracking.</p>}</section>
<section id="studio-audio" hidden={studioTab!=="audio"} aria-label="Audio controls"> <AudioControls settings={state.audio??defaultAudio} save={async settings=>{await action('audio',settings);}} test={async()=>{await action('audio/test');}}/>
</section>
<section id="studio-setup" hidden={studioTab!=="setup"} aria-label="OBS and diagnostics"> <div className="control-card"><div className="card-title"><h2>Add to OBS</h2></div><p>Add a Browser Source. Set its width to <b>1080</b> and height to <b>1920</b>.</p><button className="secondary" onClick={async()=>{try{await navigator.clipboard.writeText(`${location.origin}/?overlay=1`);setNotice('Overlay URL copied.');}catch{setNotice(`Overlay URL: ${location.origin}/?overlay=1`);}}}><Copy size={15}/>Copy overlay URL</button><a className="text-button" href="/?overlay=1" target="_blank" rel="noreferrer">Open clean overlay <ExternalLink size={13}/></a>{!local&&<small>Use the local app’s overlay URL in OBS to share live scores.</small>}</div>
 {local&&diagnostics&&<div className="control-card"><h2>Chat health</h2><p>Requests in the last hour: <b>{diagnostics.budget?.requestsLastHour??0}</b><br/>Last connection: <b>{diagnostics.lastConnectionDurationMs===undefined?'Not measured':`${(diagnostics.lastConnectionDurationMs/1000).toFixed(1)} seconds`}</b><br/>Accepted votes: <b>{diagnostics.acceptedVotes??0}</b> · Ignored messages: <b>{diagnostics.ignoredMessages??0}</b><br/>Last message: <b>{diagnostics.lastMessageAt?new Date(diagnostics.lastMessageAt).toLocaleTimeString():'None recorded'}</b><br/>Resume position: <b>{diagnostics.resumeAvailable?'Saved':'Not yet available'}</b></p><small>Estimated local usage: {diagnostics.budget?.estimatedUnits??0} / {diagnostics.budget?.limit??9000} units in 24 hours. Tracks requests since this update, not Google’s actual project quota.{diagnostics.budget?.blocked?' Request budget needs recovery.':''}</small><a className="text-button" href="/api/diagnostics" target="_blank" rel="noreferrer">View diagnostics <ExternalLink size={13}/></a></div>}
</section></div></aside>
 <section className="preview-section"><div className="preview-heading"><span><i/> STREAM PREVIEW</span><small>9:16 · 1080 × 1920</small></div><div className="preview-shell">{board}</div><div className="preview-caption"><Check size={14}/>Only the scoreboard appears in your OBS overlay</div></section>
 <aside className="activity"><div className="activity-title"><Radio size={18}/><h2>Arena activity</h2></div><div className="stats"><div><span>Total points</span><strong>{total.toLocaleString()}</strong></div><div><span>Countries</span><strong>{active.length}</strong></div></div><div className="activity-label">RECENT VOTES <span>{state.mode==='live'?'LIVE':'DEMO'}</span></div><div className="feed">{state.recent.length?state.recent.slice(0,8).map(v=><div className="feed-item" key={v.id}>{flag(v.code)}<div><b>{v.viewer}</b><span>{countries.find(c=>c.code===v.code)?.name}</span></div><strong>+{v.points??1}</strong></div>):<div className="empty-feed"><Flag size={28}/><b>A world of possibilities.</b><p>Start the demo or send a test vote.<br/>Your supporters will appear here.</p></div>}</div><div className="reset-area">{confirmReset?<><p>Clear all scores?</p><button className="secondary" onClick={async()=>{try{setRunning(false);await action('reset');setConfirmReset(false);setNotice('Scores reset.');}catch(e){setNotice((e as Error).message);}}}>Yes, reset scores</button><button className="text-button" onClick={()=>setConfirmReset(false)}>Cancel</button></>:<button className="text-button" onClick={()=>setConfirmReset(true)}><RotateCcw size={13}/>Reset scores</button>}</div></aside></div>
 {notice&&<div className="notice" role="status">{notice}<button aria-label="Dismiss notification" onClick={()=>setNotice('')}>×</button></div>}</main>;
}
