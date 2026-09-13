import {useState} from 'react';
import {countries} from '../lib/arena';
import type {DonationEffects} from '../lib/donation-effects';
import {landmarkNames} from './country-landmark';

export function DonationEffectsControls({settings,save,test,demo}:{settings:DonationEffects;save:(value:DonationEffects)=>Promise<void>;test:(country:string)=>Promise<void>;demo:boolean}){
 const [country,setCountry]=useState('ID'),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const run=async(job:()=>Promise<void>,success='Saved.')=>{setBusy(true);try{await job();setMessage(success);}catch(error){setMessage((error as Error).message);}finally{setBusy(false);}};
 return <div className="control-card audio-controls"><h2>Donation celebrations</h2><p>English thanks and a country celebration when Super Chat points are awarded.</p>
  <fieldset disabled={busy} style={{border:0,padding:0,minWidth:0,display:'grid',gap:10}}>
   {([['voice','Donation voice'],['names','Say donor name'],['amounts','Say donation amount'],['animation','Show celebration'],['landmarks','Show country landmarks']] as const).map(([key,label])=><label className="audio-toggle" key={key}><input type="checkbox" checked={settings[key]} onChange={e=>void run(()=>save({...settings,[key]:e.target.checked}))}/>{label}</label>)}
   <label htmlFor="donation-duration">Celebration length</label><select id="donation-duration" value={settings.duration} onChange={e=>void run(()=>save({...settings,duration:Number(e.target.value)}))}>{[6,7,8,9,10,11,12,13,14,15].map(seconds=><option key={seconds} value={seconds}>{seconds} seconds</option>)}</select>
   <label htmlFor="donation-volume">Donation voice volume</label><select id="donation-volume" value={settings.volume} onChange={e=>void run(()=>save({...settings,volume:Number(e.target.value)}))}>{[0,.25,.5,.75,.85,1].map(volume=><option key={volume} value={volume}>{Math.round(volume*100)}%</option>)}</select>
   <small>Master mute, English announcer, and stream volume also apply. Names use cached local English speech. Every country has an SVG illustration. Disable landmarks to use flags. Duration applies to new celebrations.</small>
   <a className="secondary" href="/landmarks/gallery.html" target="_blank" rel="noreferrer">Browse all country artwork</a>
   <label htmlFor="donation-country">Preview country</label><select id="donation-country" value={country} onChange={e=>setCountry(e.target.value)}>{countries.map(item=><option key={item.code} value={item.code}>{item.name}{landmarkNames[item.code]?` · ${landmarkNames[item.code]}`:' · Flag'}</option>)}</select>
   <button className="secondary" disabled={!demo} onClick={()=>void run(()=>test(country),'Preview queued. Watch the board; listen in the open OBS overlay.')}>Test donation celebration</button>
   <small>{demo?'Preview only: no points or donation history are added.':'Switch to demo mode to test a celebration.'}</small>
  </fieldset>{message&&<output>{message}</output>}
 </div>;
}
