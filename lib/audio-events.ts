import {countries,type ArenaState} from './arena';
export type AudioSettings={overtakeStyle?:'grouped'|'all';muted:boolean;voice:boolean;volume:number};
export const defaultAudio:AudioSettings={muted:false,voice:true,volume:0.7};
export type Announcement={kind:'lead'|'overtake'|'top5'|'winner'|'subscriber'|'jump';country:string;other?:string;places?:number;passed?:string[]};
const rank=(state:ArenaState)=>countries.filter(c=>(state.scores[c.code]||0)>0).sort((a,b)=>state.scores[b.code]-state.scores[a.code]||a.name.localeCompare(b.name));
export function rankingAnnouncement(previous:ArenaState,next:ArenaState):Announcement|undefined{
 if(previous.mode!==next.mode||previous.match?.openedAt!==next.match?.openedAt||next.match?.phase==='countdown'||next.match?.phase==='results')return;
 const before=rank(previous),after=rank(next);
 if(!before.length||!after.length)return;
 // A reset or restore is not an overtake.
 if(Object.entries(previous.scores).some(([code,score])=>(next.scores[code]||0)<score))return;
 const leader=after[0];
 const crosses=(code:string,other:string)=>(previous.scores[code]||0)<=previous.scores[other]&&next.scores[code]>next.scores[other];
 if(before.some(other=>other.code!==leader.code&&crosses(leader.code,other.code))&&(!after[1]||next.scores[leader.code]>next.scores[after[1].code]))return {kind:'lead',country:leader.code};
 for(const country of after.slice(0,3)){
  const victim=before.slice(0,3).find(other=>other.code!==country.code&&crosses(country.code,other.code));
  if(victim)return {kind:'overtake',country:country.code,other:victim.code};
 }
 if(before.length>=5)for(const country of after.slice(0,5)){
  if(!before.slice(0,5).some(c=>c.code===country.code)&&crosses(country.code,before[4].code))return {kind:'top5',country:country.code};
 }
}
export function announcementClips(event:Announcement){
 if(event.kind==='jump'){const passed=event.passed!;return passed.length===2?[event.country,'overtakes',passed[0],'and',passed[1]]:[event.country,'overtakes',passed[0],`and-${passed.length-1}-others`];}
 if(event.kind==='subscriber')return event.country?['thanks-subscribing',event.country,'subscriber-bonus']:['thanks-subscribing'];
 return event.kind==='overtake'?[event.country,'overtakes',event.other!]:[event.country,event.kind==='lead'?'takes-the-lead':event.kind==='top5'?'enters-the-top-five':'wins'];
}

export function overtakeAnnouncements(previous:ArenaState,next:ArenaState,style:'grouped'|'all'='grouped'):Announcement[]{
 if(previous.mode!==next.mode||previous.match?.openedAt!==next.match?.openedAt||next.match?.phase==='countdown'||next.match?.phase==='results')return [];
 if(Object.entries(previous.scores).some(([code,score])=>(next.scores[code]||0)<score))return [];
 const before=rank(previous),after=rank(next),events:Announcement[]=[];
 for(const country of after){
  if((next.scores[country.code]||0)<=(previous.scores[country.code]||0))continue;
  const passed=before.filter(other=>other.code!==country.code&&(previous.scores[country.code]||0)<=previous.scores[other.code]&&next.scores[country.code]>next.scores[other.code]).map(c=>c.code);
  if(style==='all'){for(const other of passed)events.push({kind:'overtake',country:country.code,other});continue;}
  if(passed.length===1)events.push({kind:'overtake',country:country.code,other:passed[0]});
  else if(passed.length>1)events.push({kind:'jump',country:country.code,passed});
 }
 return events;
}
