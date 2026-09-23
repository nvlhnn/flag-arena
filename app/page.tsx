'use client';
import {DemoSuperChatControls} from '../components/demo-superchat-controls';
import {addDemoSuperChat,applyDemoSuperChats,demoSupporters} from '../lib/demo-superchat';
import {StudioShell,StudioSubnav} from '../components/studio-shell';
import {DonationCelebrations} from '../components/donation-celebration';
import {DonationEffectsControls} from '../components/donation-effects-controls';
import {defaultDonationEffects,validDonationEffects,queueDonation} from '../lib/donation-effects';
import {topCountryVoters} from '../lib/top-voters';

import {mergeLiveUpdate} from '../lib/live-updates';

import {StreamAnalytics} from '../components/stream-analytics';
import {StorageControls} from '../components/storage-controls';
import {SuperChatRail} from '../components/superchat-rail';
import {HandCoins} from 'lucide-react';

import {VoteEvent} from '../components/vote-event';

import {SubscriberControls} from '../components/subscriber-controls';

import {SubscriberAlert} from '../components/subscriber-alert';

import {AudioControls} from '../components/audio-controls';

import {StreamAudio} from '../components/stream-audio';

import {defaultAudio} from '../lib/audio-events';

import { useEffect, useState, useRef } from 'react';

import { Flag, Radio, Play, Pause, ExternalLink, Copy, RotateCcw, ChevronRight, Check, Trophy, Bell, MessageCircle } from 'lucide-react';

import { countries, initialState, acceptVote, migrateScores, type ArenaState } from '../lib/arena';

import {registerArenaTools} from '../lib/webmcp';

import {RankedGrid} from '../components/ranked-grid';

import {formatPoints} from '../lib/format-points';

import {Crown} from 'lucide-react';

import {AnimatedFlag} from '../components/animated-flag';

import {MatchOverlay} from '../components/match-overlay';

import {finishMatch,settleMatch,nextMatch} from '../lib/match';

import {queueVoters,type VoterEffect} from '../lib/voter-effects';

const KEY='flag-arena-demo-v1';

const flag=(code:string)=><span role="img" aria-label={countries.find(c=>c.code===code)?.name||code} className={`fi fi-${code.toLowerCase()}`}/>;

export default function Home(){

 const [studioTab,setStudioTab]=useState('live');
 const [alertTab,setAlertTab]=useState('donations'),[settingsTab,setSettingsTab]=useState('connection');
 const openConnectionSettings=()=>{setStudioTab('settings');setSettingsTab('connection');};

 const [keyCount,setKeyCount]=useState(0);
 const [previousVideo,setPreviousVideo]=useState('');
 const [sessionChoice,setSessionChoice]=useState<'continue'|'fresh'>('continue');

 const [state,setState]=useState<ArenaState>(initialState());

 const [overlay,setOverlay]=useState(false),[local,setLocal]=useState(false),[ready,setReady]=useState(false),[running,setRunning]=useState(false);

 useEffect(()=>{if(!local)return;let stopped=false;const update=async()=>{try{const response=await fetch('/api/config');if(response.ok){const config=await response.json();if(!stopped){setPreviousVideo(config.previousVideo||'');setKeyCount(config.keyCount||0);}}}catch{}};void update();const timer=setInterval(()=>void update(),5000);return()=>{stopped=true;clearInterval(timer);};},[local]);
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

  const source=new EventSource('/api/events');source.onmessage=e=>{const incoming=JSON.parse(e.data);if(!receivedInitialState.current||receivedMode.current!==incoming.mode){seenEffects.current.clear();setEffects([]);receivedMode.current=incoming.mode;for(const vote of incoming.recent)seenEffects.current.add(vote.id);receivedInitialState.current=true;}setState(previous=>mergeLiveUpdate(previous,incoming));setReady(true);setNotice(previous=>previous.startsWith('Local connection interrupted.')?'':previous);};source.onerror=()=>setNotice('Local connection interrupted. Keep Flag Arena running; reconnecting…');return()=>source.close();

 },[]);

 useEffect(()=>{if(ready&&!local){try{localStorage.setItem(KEY,JSON.stringify(state));}catch{}}},[state,local,ready]);

 async function action(name:string,body:Record<string,unknown>={}){

  if(local){const r=await fetch(`/api/${name}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw new Error(data.error||'Action could not be completed.');return data;}

  if(name==='donation-effects'&&validDonationEffects(body)){setState(current=>({...current,donationEffects:body}));return {};}
  if(name==='donation-effects/test'){setState(current=>({...current,donationEvents:queueDonation(current.donationEvents??[],{id:crypto.randomUUID(),name:'Alex',country:String(body.country),amountMicros:'5000000',currency:'USD',points:5000,preview:true},(current.donationEffects??defaultDonationEffects).duration)}));return {};}
  if(name==='superchats/test'){setState(addDemoSuperChat(state,body));return {};}
  if(name==='layout'){setState(current=>({...current,overlayLayout:body.layout==='tactical'?'tactical':'classic'}));return {};}
  if(name==='supporters/visibility'){setState(current=>({...current,overlaySupporters:body.enabled===true}));return {};}
  if(name==='catch-up'){setState(current=>({...current,catchUpEnabled:body.enabled===true}));return {};}

  if(name==='audio'){setState({...state,audio:{overtakeStyle:body.overtakeStyle as 'grouped'|'all'|undefined,muted:body.muted===true,voice:body.voice===true,volume:Number(body.volume)}});return {};}

  if(name==='audio/test'){setState({...state,audioTest:{id:crypto.randomUUID(),at:Date.now()}});return {};}

  if(name==='vote'){const result=acceptVote(state,{id:crypto.randomUUID(),viewerId:String(body.viewer),viewer:String(body.viewer),text:String(body.text),time:Date.now()});if(result.accepted)setState(applyDemoSuperChats(result.state));return result;}

  if(name==='match/finish'){setState(finishMatch(state));return {};}

  if(name==='match/next'){setState(nextMatch(settleMatch(state),body.reset===true));return {};}

  if(name==='reset'){setState({...initialState(),catchUpEnabled:state.catchUpEnabled});return {};}

  throw new Error('Use the local Flag Arena control panel to connect YouTube.');

 }

 useEffect(()=>{if(!running||state.mode==='live'||state.match?.phase==='results')return;const timer=setInterval(()=>{const c=countries[Math.floor(Math.random()*30)];void action('vote',{viewer:`Demo fan ${Math.floor(Math.random()*80)}`,text:c.name}).catch(e=>{setNotice(e.message);setRunning(false);});},950);return()=>clearInterval(timer);},[running,state,local]);

 useEffect(()=>{if(local||!ready||state.match?.phase!=='countdown')return;const timer=setTimeout(()=>setState(current=>settleMatch(current)),Math.max(0,(state.match.endsAt??Date.now())-Date.now()));return()=>clearTimeout(timer);},[local,ready,state.match]);

 const apiRef=useRef({state,action});apiRef.current={state,action};

 useEffect(()=>registerArenaTools(()=>({mode:apiRef.current.state.mode,scores:apiRef.current.state.scores}),async(viewer,text)=>{if(apiRef.current.state.mode==='live')throw new Error('Demo votes are disabled in live mode.');return apiRef.current.action('vote',{viewer,text});}),[]);

 const ranked=[...countries].sort((a,b)=>(state.scores[b.code]||0)-(state.scores[a.code]||0)||a.name.localeCompare(b.name));

 const total=Object.values(state.scores).reduce((a,b)=>a+b,0),leader=total?ranked[0]:undefined,latest=state.recent[0],active=ranked.filter(c=>state.scores[c.code]);

 const topVoter=leader?(state.topVoters??topCountryVoters(state))[leader.code]:undefined;
 const tacticalLayout=state.overlayLayout==='tactical';
 const supportersEnabled=state.overlaySupporters??(state.overlayLayout==='superchat'||tacticalLayout);
 const superchatLayout=tacticalLayout||supportersEnabled;
 const tickerVoters=Object.entries(state.topVoters??topCountryVoters(state)).sort((a,b)=>b[1].points-a[1].points).slice(0,10);
 const grid=(total?ranked:countries).slice(0,tacticalLayout&&!supportersEnabled?117:superchatLayout?99:117);

 async function vote(e:React.FormEvent){e.preventDefault();try{const r=await action('vote',{viewer,text:message});setNotice(r.accepted?'Vote counted!':r.reason);}catch(e){setNotice((e as Error).message);}}

 async function connect(e:React.FormEvent){e.preventDefault();setBusy(true);setRunning(false);try{await action('connect',{video,credential,sessionChoice,previousVideo});const config=await(await fetch('/api/config')).json();setPreviousVideo(config.previousVideo||'');setCredential('');setNotice('Stream found. Opening the YouTube chat connection…');}catch(e){setNotice((e as Error).message);}finally{setBusy(false);}}

 async function matchAction(name:string,reset?:boolean){setBusy(true);try{await action(name,reset===undefined?{}:{reset});setEffects([]);if(reset!==undefined)setRunning(false);setNotice('');}catch(error){setNotice((error as Error).message);}finally{setBusy(false);}}

 const board=<section className={`arena ${superchatLayout?'arena-superchat':''} ${tacticalLayout?'arena-tactical':''} ${tacticalLayout&&!supportersEnabled?'tactical-no-supporters':''}`} aria-label="Vertical stream scoreboard">

  <DonationCelebrations state={state}/><MatchOverlay match={state.match}/><SubscriberAlert alerts={state.subscriberAlerts}/>

  <div className="reward-strip">{superchatLayout?<div className="superchat-reward"><span className="superchat-reward-icon"><HandCoins/></span><span><small>SUPER CHAT BOOST</small><b>+1,000 <em>pts</em></b><i>for every $1 USD</i></span></div>:<div><MessageCircle/><span>Chat vote<b>+1–5 points</b></span></div>}{superchatLayout?<div className="superchat-subscribe"><span className="superchat-reward-icon"><Bell/></span><span><small>JOIN THE CROWD</small><b>+100 <em>pts</em></b><i>subscribe & pick a flag</i></span></div>:<div><Bell/><span>Subscribe<b>+100 points</b></span></div>}</div>

  {supportersEnabled?<SuperChatRail tactical={tacticalLayout} enabled={local&&state.mode==='live'} session={state.mode==='demo'?'demo':state.superchatSession??''} preview={state.mode==='demo'?demoSupporters(state.demoSuperChats):undefined}/>:tacticalLayout?null:<div className="leader-card leader-showcase"><div className="leader-sparkles" aria-hidden="true"><i/><i/><i/></div><div className="leader-label"><Trophy/>{leader?'CURRENT LEADER':'THE TOP SPOT IS OPEN'}</div><div className="leader-main">{leader?flag(leader.code):<Flag/>}<div><h3>{leader?.name||'Who goes first?'}</h3><span className="leader-top-voter" title={topVoter?.name}><span className="top-voter-label">TOP VOTER</span><b>{topVoter?.name??(leader?'—':'Be the first')}</b></span></div><strong>{leader?formatPoints(state.scores[leader.code]):'—'}<small>POINTS</small></strong></div></div>}

  {tacticalLayout&&<div className="tactical-ticker"><b>TOP VOTERS</b><div className="tactical-ticker-window"><div className="tactical-ticker-track">{tickerVoters.length?[0,1].map(copy=><div className="tactical-ticker-group" key={copy} aria-hidden={copy===1?true:undefined}>{tickerVoters.map(([code,voter],index)=><span key={code}><em>#{index+1}</em>{flag(code)}<strong>{voter.name}</strong><small>({formatPoints(voter.points)} pts)</small></span>)}</div>):<span className="tactical-ticker-empty">TYPE YOUR COUNTRY TO JOIN THE RANKS</span>}</div></div></div>}
  <RankedGrid key={state.overlayLayout??'current'}>{grid.map((c,i)=>{const effect=effects.find(v=>v.code===c.code&&v.starts<=Date.now()&&v.expires>Date.now());return <div key={c.code} data-country={c.code} className={`country-tile ${effect?'has-pop':''} ${leader?.code===c.code?'first':''} ${total>0&&i<3?`podium podium-${i+1}`:''}`} title={`${c.name}: ${state.scores[c.code]||0} points`}><div className="flag-frame"><small className={total>0&&i<3?'rank-medal':undefined}>{tacticalLayout&&total>0&&i<3?<><span aria-hidden="true">{['👑','🥈','🥉'][i]}</span>{i+1}</>:String(i+1)}</small>{total>0&&i===0&&<div className={`leader-crown crown-${i+1}`} aria-label={`Rank ${i+1}: ${['gold','silver','copper'][i]} crown`}><Crown/><i/><i/></div>}<AnimatedFlag voteId={effect?.id}>{flag(c.code)}</AnimatedFlag></div><strong>{formatPoints(state.scores[c.code]||0)}</strong>{effect&&<div key={effect.id} className={`voter-popup ${i%9<2?'popup-left':i%9>6?'popup-right':''}`}><b>{effect.viewer}</b><span>+{formatPoints(effect.points??1)}{(effect.multiplier??1)>1&&<em className="popup-multiplier"> · {effect.multiplier}×</em>}</span></div>}</div>;})}</RankedGrid>

  <VoteEvent votes={state.recent} mode={state.mode}/>



  {!tacticalLayout&&<div className="arena-footer"><b>TYPE YOUR COUNTRY · LEVEL UP TO +5</b><span>{state.mode==='live'?(state.connected?'LIVE':'CHAT PAUSED'):'DEMO'} - NO VOTE COOLDOWN</span></div>}

 </section>;

 if(overlay)return <main className="overlay-only">{ready&&<StreamAudio state={state}/ >}{board}</main>;

 const layoutControls=(<div className="control-card"><h2>Overlay layout</h2><p>Choose the look shown in the preview and OBS.</p><div className="layout-options"><button className="secondary" aria-pressed={!tacticalLayout} disabled={busy} onClick={()=>void action('layout',{layout:'classic'}).catch(e=>setNotice(e.message))}>Classic</button><button className="secondary" aria-pressed={tacticalLayout} disabled={busy} onClick={()=>void action('layout',{layout:'tactical'}).catch(e=>setNotice(e.message))}>Tactical</button></div><button className="secondary supporter-toggle" role="switch" aria-checked={supportersEnabled} disabled={busy} onClick={()=>void action('supporters/visibility',{enabled:!supportersEnabled}).catch(e=>setNotice(e.message))}>Supporter wall: {supportersEnabled?'ON':'OFF'}</button><small>Both layouts use 9:16 (1080 × 1920). Turn on the supporter wall to show live Super Chat donors. When it is off, the Tactical flag board fills the space.</small></div>);
 const scoringControls=(<div className="control-card"><div className="card-title"><h2>Catch-up bonus</h2></div><p>Trailing countries earn up to 5× chat points plus 1 extra point per 1,000 points behind the leader once the leader reaches 1,000. Subscriber points stay the same.</p><button className="secondary" role="switch" aria-checked={state.catchUpEnabled!==false} disabled={!ready||busy} onClick={async()=>{setBusy(true);try{await action('catch-up',{enabled:state.catchUpEnabled===false});}catch(error){setNotice((error as Error).message);}finally{setBusy(false);}}}>Catch-up bonus: {state.catchUpEnabled!==false?'ON':'OFF'}</button><small>Below 25% of leader: 5× · below 50%: 4× · below 75%: 3× · below 90%: 2× · otherwise: 1×, plus the gap bonus. Applies to new votes.</small></div>);
 const roundControls=(<div className="control-card match-controls"><div className="card-title"><Trophy size={19}/><h2>Current round</h2></div>{state.match?.phase==='results'?<><p>Results are on screen. Choose how the next match starts.</p><button className="primary" disabled={busy} onClick={()=>void matchAction('match/next',true)}>Start next round · reset scores</button><button className="secondary" disabled={busy} onClick={()=>void matchAction('match/next',false)}>Start next round · keep scores</button></>:state.match?.phase==='countdown'?<p role="status">Final 10 seconds! Voting stays open until zero.</p>:<><p>Give viewers 10 final seconds, then reveal the top five countries.</p><button className="primary" disabled={!ready||busy} onClick={()=>void matchAction('match/finish')}>Finish current round · 10 seconds</button></>}</div>);
 const connectionControls=(<div className="control-card"><div className="card-title"><h2>Connect YouTube</h2></div>{local?<details className="live-connection-details" open={!state.connected}>{state.connected&&<summary>Change or reconnect this stream</summary>}<form onSubmit={connect}><p>Paste your livestream URL to connect or recover a failed stream.</p><label htmlFor="video">Livestream URL</label><input id="video" placeholder="https://youtube.com/watch?v=…" value={video} onChange={e=>setVideo(e.target.value)} required/>{previousVideo&&<button type="button" className="text-button last-stream-button" onClick={()=>{setVideo(`https://youtube.com/watch?v=${previousVideo}`);setSessionChoice('continue');}}>Use last connected stream</button>}{!keyCount&&!credential&&<p className="studio-helper">YouTube access is not configured. <button type="button" onClick={openConnectionSettings}>Set up YouTube access</button> first.</p>}{previousVideo&&<fieldset className="session-choice"><legend>For a new stream URL</legend><label><input type="radio" name="sessionChoice" checked={sessionChoice==='continue'} onChange={()=>setSessionChoice('continue')}/> Continue previous session</label><label><input type="radio" name="sessionChoice" checked={sessionChoice==='fresh'} onChange={()=>setSessionChoice('fresh')}/> Start fresh</label><small>Continue keeps scores, viewer levels, and subscriber bonus history from <a href={`https://youtube.com/watch?v=${previousVideo}`} target="_blank" rel="noreferrer">the previous stream</a>. Previously connected URLs resume their saved session.</small></fieldset>}<button className="primary" disabled={busy||(!keyCount&&!credential)}>{busy?'Connecting…':'Connect live chat'}</button>{state.mode==='live'&&<button type="button" className="text-button" onClick={()=>void action('disconnect').catch(e=>setNotice(e.message))}>Disconnect chat · return to demo</button>}</form></details>:<p>This preview uses demo votes. Connect real YouTube chat from the local Flag Arena app on your streaming PC.</p>}<div className="connection-info"><span className="status-dot"/>{state.status}</div></div>);
 const demoControls=(<details className="demo-tools"><summary>Demo test area</summary> <div className="control-card"><div className="card-title"><h2>Try the arena</h2><span className="tag">DEMO</span></div><p>See the scoreboard react before going live. Demo votes stay separate from your stream.</p><button className="primary" disabled={!ready||state.mode==='live'} onClick={()=>setRunning(!running)}>{running?<Pause size={16}/>:<Play size={16} fill="currentColor"/>}{running?'Pause demo':'Start demo'}<ChevronRight size={16}/></button><form onSubmit={vote}><label htmlFor="viewer">Test viewer</label><input id="viewer" maxLength={60} value={viewer} onChange={e=>setViewer(e.target.value)} required/><label htmlFor="message">Try a chat vote</label><div className="input-row"><input id="message" maxLength={200} value={message} onChange={e=>setMessage(e.target.value)} required/><button disabled={!ready||state.mode==='live'} type="submit" aria-label="Send test vote"><ChevronRight size={19}/></button></div><small>Country name, flag emoji, or !vote ID</small></form></div>

<DemoSuperChatControls viewer={viewer} enabled={ready&&state.mode==='demo'} cards={state.demoSuperChats??[]} send={body=>action('superchats/test',body)}/></details>);
 const obsControls=(<div className="control-card"><div className="card-title"><h2>Add to OBS</h2></div><p>Add a Browser Source. Set its width to <b>1080</b> and height to <b>1920</b>.</p><button className="secondary" onClick={async()=>{try{await navigator.clipboard.writeText(`${location.origin}/?overlay=1`);setNotice('Overlay URL copied.');}catch{setNotice(`Overlay URL: ${location.origin}/?overlay=1`);}}}><Copy size={15}/>Copy overlay URL</button><a className="text-button" href="/?overlay=1" target="_blank" rel="noreferrer">Open clean overlay <ExternalLink size={13}/></a>{!local&&<small>Use the local app’s overlay URL in OBS to share live scores.</small>}</div>);
 const healthControls=(<>{local&&diagnostics&&<div className="control-card"><h2>Chat health</h2><p>Requests in the last hour: <b>{diagnostics.budget?.requestsLastHour??0}</b><br/>Last connection: <b>{diagnostics.lastConnectionDurationMs===undefined?'Not measured':`${(diagnostics.lastConnectionDurationMs/1000).toFixed(1)} seconds`}</b><br/>Accepted votes: <b>{diagnostics.acceptedVotes??0}</b> · Ignored messages: <b>{diagnostics.ignoredMessages??0}</b><br/>Last message: <b>{diagnostics.lastMessageAt?new Date(diagnostics.lastMessageAt).toLocaleTimeString():'None recorded'}</b><br/>Resume position: <b>{diagnostics.resumeAvailable?'Saved':'Not yet available'}</b></p><small>Estimated local usage: {diagnostics.budget?.estimatedUnits??0} / {diagnostics.budget?.limit??9000} units in 24 hours. Tracks requests since this update, not Google’s actual project quota.{diagnostics.budget?.blocked?' Request budget needs recovery.':''}</small><a className="text-button" href="/api/diagnostics" target="_blank" rel="noreferrer">View diagnostics <ExternalLink size={13}/></a></div>}</>);
 const activityControls=(<aside className="activity"><div className="activity-title"><Radio size={18}/><h2>Arena activity</h2></div><div className="stats"><div><span>Total points</span><strong>{total.toLocaleString()}</strong></div><div><span>Countries</span><strong>{active.length}</strong></div></div><div className="activity-label">RECENT VOTES <span>{state.mode==='live'?'LIVE':'DEMO'}</span></div><div className="feed">{state.recent.length?state.recent.slice(0,8).map(v=><div className="feed-item" key={v.id}>{flag(v.code)}<div><b>{v.viewer}</b><span>{countries.find(c=>c.code===v.code)?.name}</span></div><strong>+{v.points??1}</strong></div>):<div className="empty-feed"><Flag size={28}/><b>A world of possibilities.</b><p>Start the demo or send a test vote.<br/>Your supporters will appear here.</p></div>}</div></aside>);
 const resetControls=(<div className="reset-area">{confirmReset?<><p>Clear all scores?</p><button className="secondary" onClick={async()=>{try{setRunning(false);await action('reset');setConfirmReset(false);setNotice('Scores reset.');}catch(e){setNotice((e as Error).message);}}}>Yes, reset scores</button><button className="text-button" onClick={()=>setConfirmReset(false)}>Cancel</button></>:<button className="text-button" onClick={()=>setConfirmReset(true)}><RotateCcw size={13}/>Reset scores</button>}</div>);
 const previewPanel=(<section className="preview-section"><div className="preview-heading"><span><i/> STREAM PREVIEW</span><small>9:16 · 1080 × 1920</small></div><div className="preview-shell">{board}</div><div className="preview-caption"><Check size={14}/>Only the scoreboard appears in your OBS overlay</div></section>);
 return <StudioShell section={studioTab} navigate={setStudioTab} mode={state.mode} connected={state.connected} session={state.superchatSession||previousVideo} demoRunning={running} preview={['live','overlay','alerts'].includes(studioTab)?previewPanel:undefined} notice={<>{notice&&<div className="notice" role="status">{notice}<button aria-label="Dismiss notification" onClick={()=>setNotice('')}>×</button></div>}</>}>
  {studioTab==='live'&&<>{state.connected?<>{roundControls}{connectionControls}</>:<>{connectionControls}{roundControls}</>}{demoControls}<details className="studio-activity-details"><summary>Recent votes & totals</summary>{activityControls}</details></>}
  {studioTab==='overlay'&&<>{layoutControls}{obsControls}</>}
  {studioTab==='alerts'&&<><StudioSubnav label="Alert categories" value={alertTab} change={setAlertTab} options={[["donations","Donations"],["subscribers","Subscribers"],["audio","General audio"]]}/>
   {state.mode==='live'&&alertTab!=='audio'&&<p className="studio-helper">Tests use demo mode. <button onClick={()=>setStudioTab('live')}>Open Live</button> to disconnect chat and enter the test workspace.</p>}
   {alertTab==='donations'&&<DonationEffectsControls settings={state.donationEffects??defaultDonationEffects} demo={state.mode==='demo'} save={async settings=>{await action('donation-effects',settings);}} test={async country=>{await action('donation-effects/test',{country});}}/>}
   {alertTab==='subscribers'&&<SubscriberControls view="alerts" onSetup={openConnectionSettings} local={local} demo={state.mode==='demo'} action={action} onKeys={setKeyCount}/>}
   {alertTab==='audio'&&<AudioControls settings={state.audio??defaultAudio} save={async settings=>{await action('audio',settings);}} test={async()=>{await action('audio/test');}}/>}
  </>}
  {studioTab==='history'&&<StreamAnalytics local={local}/>}
  {studioTab==='settings'&&<><StudioSubnav label="Settings categories" value={settingsTab} change={setSettingsTab} options={[["connection","YouTube access"],["scoring","Scoring"],["storage","Storage & reset"],["diagnostics","Diagnostics"]]}/>
   {settingsTab==='connection'&&<><div className="control-card"><h2>YouTube chat access</h2>{local?<form onSubmit={e=>{e.preventDefault();setStudioTab('live');}} autoComplete="off"><p>{keyCount?`${keyCount} API keys configured locally.`:'Add an API key to connect live chat.'}</p>{!keyCount&&<><label htmlFor="credential">YouTube Data API key</label><input id="credential" type="password" autoComplete="off" value={credential} onChange={e=>setCredential(e.target.value)}/><small>This key will be used for your next connection. It is not saved by this form.</small></>}<button className="secondary" type="submit">Go to Live connection</button><details><summary>Advanced key configuration</summary><p>Configure API keys in the local .env file. Keys are tried in order on credential or quota errors; chat pauses when all keys fail. Restart the app after changing the file.</p></details></form>:<p>Configure YouTube access in the local app on your streaming PC.</p>}</div><SubscriberControls view="setup" local={local} demo={state.mode==='demo'} action={action} onKeys={setKeyCount}/></>}
   {settingsTab==='scoring'&&<>{scoringControls}<div className="control-card"><h2>Other scoring rules</h2><p>Chat votes award 1–5 base points by viewer level. Super Chats award 1,000 points per USD. Eligible public subscribers award 100 points.</p><small>These values are fixed. Donation and subscriber bonuses do not receive catch-up multipliers.</small></div></>}
   {settingsTab==='storage'&&<><StorageControls local={local}/><details className="control-card maintenance-zone"><summary>Reset current {state.mode==='demo'?'demo':'live'} scores</summary><p>This clears the current scoreboard. To finish a round normally, use Live.</p>{resetControls}</details></>}
   {settingsTab==='diagnostics'&&<>{healthControls}{(!local||!diagnostics)&&<div className="control-card"><h2>Connection diagnostics</h2><p>{local?'Waiting for local diagnostics…':'Diagnostics are available in the local app.'}</p></div>}</>}
  </>}
 </StudioShell>;
}
