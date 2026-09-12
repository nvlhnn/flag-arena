import type {ArenaState} from './arena';

export function topCountryVoters(state:ArenaState){
 const totals=new Map<string,{name:string;points:Record<string,number>}>();
 for(const [id,viewer] of Object.entries(state.viewers??{}))if(viewer.countryPoints)totals.set(id,{name:viewer.name??id,points:viewer.countryPoints});
 // Older saved rounds can recover the votes still retained in their feed.
 for(const vote of [...state.recent].reverse()){
  if(state.viewers?.[vote.viewerId]?.countryPoints)continue;
  const viewer=totals.get(vote.viewerId)??{name:vote.viewer,points:{}};
  viewer.name=vote.viewer;
  viewer.points[vote.code]=(viewer.points[vote.code]??0)+(vote.points??1);
  totals.set(vote.viewerId,viewer);
 }
 const leaders:Record<string,{name:string;points:number}>={};
 for(const [,viewer] of [...totals].sort(([a],[b])=>a.localeCompare(b)))for(const [code,points] of Object.entries(viewer.points)){
  if(points>(leaders[code]?.points??0))leaders[code]={name:viewer.name,points};
 }
 return leaders;
}
