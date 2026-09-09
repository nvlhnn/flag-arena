import {useEffect,useRef,useState} from 'react';
import {ArenaAudio} from '../lib/arena-audio';
import type {AudioSettings} from '../lib/audio-events';

export function AudioControls({settings,save,test}:{settings:AudioSettings;save:(settings:AudioSettings)=>Promise<void>;test:()=>Promise<void>}){
 const [volume,setVolume]=useState(settings.volume),[message,setMessage]=useState('');
 const preview=useRef<ArenaAudio|null>(null);
 useEffect(()=>setVolume(settings.volume),[settings.volume]);
 useEffect(()=>{preview.current?.configure(settings);},[settings]);
 useEffect(()=>()=>preview.current?.close(),[]);
 const update=async(next:AudioSettings)=>{try{await save(next);setMessage('');}catch(error){setMessage((error as Error).message);}};
 const previewVoice=async()=>{
  preview.current??=new ArenaAudio(blocked=>setMessage(blocked?'Audio could not play. Check browser audio permissions.':''));
  preview.current.configure(settings);
  if(await preview.current.unlock()){void preview.current.effect('rank');void preview.current.announce({kind:'overtake',country:'ID',other:'IR'},true);}
 };
 return <div className="control-card audio-controls"><div className="card-title"><h2>Stream audio</h2></div><p>English ranking and winner announcements. Countdown uses beeps only.</p><label className="audio-toggle"><input type="checkbox" checked={settings.muted} onChange={e=>void update({...settings,muted:e.target.checked})}/>Mute all audio</label><label className="audio-toggle"><input type="checkbox" checked={settings.voice} onChange={e=>void update({...settings,voice:e.target.checked})}/>English announcer</label><label>Overtake announcements</label><div className="studio-tabs" aria-label="Overtake announcement style"><button aria-pressed={(settings.overtakeStyle??'grouped')==='grouped'} onClick={()=>void update({...settings,overtakeStyle:'grouped'})}>Grouped</button><button aria-pressed={settings.overtakeStyle==='all'} onClick={()=>void update({...settings,overtakeStyle:'all'})}>Announce all</button></div><small>{settings.overtakeStyle==='all'?'Separate sentences: “Indonesia overtakes India.” Then “Indonesia overtakes Malaysia.” Busy streams may build a queue (maximum 100).':'One sentence: “Indonesia overtakes India and Malaysia.”'}</small><label htmlFor="stream-volume">Volume · {Math.round(volume*100)}%</label><input id="stream-volume" type="range" min="0" max="100" step="5" value={Math.round(volume*100)} onChange={e=>setVolume(Number(e.target.value)/100)} onPointerUp={e=>void update({...settings,volume:Number(e.currentTarget.value)/100})} onKeyUp={e=>void update({...settings,volume:Number(e.currentTarget.value)/100})}/><button className="secondary" disabled={settings.muted||!settings.voice||settings.volume===0} onClick={()=>void previewVoice()}>Preview English voice here</button><button className="secondary" disabled={settings.muted||settings.volume===0} onClick={()=>void test().then(()=>setMessage('Test sent. Listen to the open OBS overlay.')).catch(error=>setMessage(error.message))}>Test overlay audio</button><small>The studio stays silent except when you preview. If playback is blocked, click Enable audio in the overlay.</small>{message&&<p role="status">{message}</p>}</div>;
}
