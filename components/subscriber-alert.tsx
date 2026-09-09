import {useEffect,useMemo,useState} from 'react';
import {Bell} from 'lucide-react';
import {subscriberAlertDurationMs,type SubscriberAlert as Alert} from '../lib/subscribers';
export function SubscriberAlert({alerts=[]}:{alerts?:Alert[]}){
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{if(!alerts.length)return;const timer=setInterval(()=>setNow(Date.now()),100);return()=>clearInterval(timer);},[alerts]);
 const active=alerts.find(item=>now>=item.startsAt&&now<item.startsAt+subscriberAlertDurationMs);
 const delay=useMemo(()=>active?`${-Math.max(0,Date.now()-active.startsAt)/1000}s`:'0s',[active?.id]);
 if(!active)return null;
 return <aside key={active.id} className="subscriber-alert" style={{animationDelay:delay,animationDuration:`${subscriberAlertDurationMs}ms`}} aria-label="New subscriber"><div className="subscriber-shine"/>{active.code?<span className={`fi fi-${active.code.toLowerCase()}`} role="img" aria-label={active.code}/>:<Bell className="subscriber-bell"/>}<div><b>{active.viewer.startsWith('@')?'':'@'}{active.viewer}</b><span>SUBSCRIBED</span><strong>{active.points?`+${active.points}`:'THANK YOU!'}</strong></div></aside>;
}
