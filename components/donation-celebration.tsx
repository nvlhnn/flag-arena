import {useEffect,useState,type CSSProperties} from 'react';
import {countries,type ArenaState} from '../lib/arena';
import {activeDonation,defaultDonationEffects,type DonationCelebration} from '../lib/donation-effects';
import {CountryLandmark,landmarkNames} from './country-landmark';
import './donation-celebration.css';

function Celebration({event,landmarks}:{event:DonationCelebration;landmarks:boolean}){
 const [elapsed]=useState(()=>Math.max(0,Date.now()-event.startsAt));
 const country=countries.find(item=>item.code===event.country)?.name??event.country;
 const illustrated=landmarks&&!!landmarkNames[event.country];
 return <div className="donation-celebration" style={{'--celebration-duration':`${event.endsAt-event.startsAt}ms`,'--celebration-delay':`-${elapsed}ms`} as CSSProperties}>
  <div className="donation-halo"/>
  <div className="donation-sparks" aria-hidden="true">{Array.from({length:12},(_,i)=><i key={i} style={{'--i':i} as CSSProperties}/>)}</div>
  <div className="donation-scene">{illustrated?<CountryLandmark country={event.country}/>:<span className={`fi fi-${event.country.toLowerCase()} donation-large-flag`}/>}</div>
  <div className="donation-plaque"><span className="donation-kicker">{event.preview?'PREVIEW · ':''}SUPER CHAT</span><strong>{event.name}</strong><div><span className={`fi fi-${event.country.toLowerCase()}`}/> {country}</div><b>+{event.points.toLocaleString('en-US')} <small>POINTS</small></b></div>
 </div>;
}
export function DonationCelebrations({state}:{state:ArenaState}){
 const [now,setNow]=useState(Date.now);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),100);return()=>clearInterval(timer);},[]);
 const settings=state.donationEffects??defaultDonationEffects,event=activeDonation(state.donationEvents??[],state.match?.phase,now);
 return settings.animation&&event?<Celebration key={event.id} event={event} landmarks={settings.landmarks}/>:null;
}
