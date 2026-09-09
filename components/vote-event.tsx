import {useEffect,useRef,useState} from 'react';
import {countries,type ArenaState} from '../lib/arena';
type Vote=ArenaState['recent'][number];
export function VoteEvent({votes,mode}:{votes:Vote[];mode:string}){
 const seen=useRef<Set<string>|null>(null);
 const [events,setEvents]=useState<{vote:Vote;until:number}[]>([]);
 useEffect(()=>{
  if(!seen.current){seen.current=new Set(votes.map(v=>v.id));return;}
  const fresh=votes.filter(v=>!seen.current!.has(v.id)&&v.levelUp).reverse();
  seen.current=new Set(votes.map(v=>v.id));
  if(!votes.length){setEvents([]);return;}
  setEvents(old=>{const next=old.filter(e=>e.until>Date.now());for(const vote of fresh){if(next.length>=10)break;next.push({vote,until:Math.max(Date.now(),next.at(-1)?.until??0)+3000});}return next;});
 },[votes]);
 useEffect(()=>{const timer=setInterval(()=>setEvents(old=>old.length&&old[0].until<=Date.now()?old.slice(1):old),100);return()=>clearInterval(timer);},[]);
 const event=events[0],vote=event?.vote??votes[0];
 return <section className="stream-chat" aria-label="Viewer events"><div className="chat-heading">{event?'LEVEL UP!':mode==='live'?'LATEST VOTER':'DEMO VOTER'}</div>{vote?<div className="stream-chat-row"><span className={`fi fi-${vote.code.toLowerCase()}`} role="img" aria-label={countries.find(c=>c.code===vote.code)?.name}/><div><b><span className="viewer-level">Lv. {vote.level??1}</span> {vote.viewer}</b><p>{event?`Reached Level ${vote.level}! Next votes: +${vote.level} points`:vote.text}</p></div><strong>{event?'★':`+${vote.points??1}`}</strong></div>:<p className="chat-placeholder">Vote to earn XP · Level 5 in ~30 minutes · Resets each match</p>}</section>;
}
