import {useEffect,useRef,useState} from 'react';
import type {ArenaState} from '../lib/arena';
import {ArenaAudio} from '../lib/arena-audio';
import {defaultAudio,overtakeAnnouncements} from '../lib/audio-events';

export function StreamAudio({state}:{state:ArenaState}){
 const [blocked,setBlocked]=useState(false);
 const engine=useRef<ArenaAudio|null>(null),latest=useRef(state),previous=useRef<ArenaState|null>(null);
 const lastRank=useRef(-Infinity),lastTick=useRef(''),closed=useRef(''),winner=useRef(''),lastSubscriber=useRef('');
 latest.current=state;
 useEffect(()=>{const audio=new ArenaAudio(setBlocked);engine.current=audio;return()=>{audio.close();engine.current=null;};},[]);
 useEffect(()=>{
  const audio=engine.current;if(!audio)return;
  audio.configure(state.audio??defaultAudio);
  const before=previous.current;previous.current=state;
  if(!before){if(!audio.settings.muted)void audio.unlock();if(state.match?.phase==='results'){closed.current=String(state.match.endsAt);winner.current=String(state.match.endsAt);}return;}
  const changedRound=before.mode!==state.mode||before.match?.openedAt!==state.match?.openedAt;
  if(changedRound){audio.cancelSpeech();lastRank.current=-Infinity;lastTick.current='';return;}
  if(before.audio?.overtakeStyle!==state.audio?.overtakeStyle)audio.cancelSpeech();
  if(before.match?.phase!==state.match?.phase)audio.cancelSpeech();
  if(state.audioTest&&state.audioTest.id!==before.audioTest?.id&&Date.now()-state.audioTest.at<3000){void audio.effect('rank');void audio.announce({kind:'lead',country:'ID'},true);return;}
  const events=overtakeAnnouncements(before,state,state.audio?.overtakeStyle);
  for(const event of events)void audio.announce(event);

 },[state]);
 useEffect(()=>{
  const tick=()=>{
   const current=latest.current,audio=engine.current,match=current.match;if(!audio)return;
   const subscriber=current.subscriberAlerts?.find(item=>Date.now()>=item.startsAt&&Date.now()<item.startsAt+1000);
   if(subscriber&&lastSubscriber.current!==subscriber.id){lastSubscriber.current=subscriber.id;if(match?.phase!=='countdown'&&match?.phase!=='results'){audio.cancelSpeech();lastRank.current=Date.now();void audio.effect('winner');void audio.announce({kind:'subscriber',country:subscriber.points?subscriber.code||'':''},true);}}
   if(!match?.endsAt)return;
   const key=String(match.endsAt),now=Date.now();
   if(match.phase==='countdown'){
    const seconds=Math.max(0,Math.ceil((match.endsAt-now)/1000)),id=`${key}:${seconds}`;
    if(seconds>0&&seconds<=10&&lastTick.current!==id){lastTick.current=id;void audio.effect(seconds<=3?'urgent':'tick');}
   }
   if((match.phase==='countdown'||match.phase==='results')&&now>=match.endsAt&&closed.current!==key){closed.current=key;audio.cancelSpeech();if(now-match.endsAt<2000)void audio.effect('end');}
   if(match.phase==='results'&&winner.current!==key){
    const reveal=match.endsAt+Math.max(0,(match.results?.length??0)-1)*850;
    if(now>=reveal){winner.current=key;const champion=match.results?.[0];if(champion&&now-reveal<2500){void audio.effect('winner');void audio.announce({kind:'winner',country:champion.code},true);}}
   }
  };
  const timer=setInterval(tick,100);return()=>clearInterval(timer);
 },[]);
 return blocked?<button className="enable-stream-audio" onClick={async()=>{const audio=engine.current;if(audio&&await audio.unlock()){void audio.effect('rank');void audio.announce({kind:'lead',country:'ID'},true);}}}>Enable audio · play test</button>:null;
}
