import {countries,type ArenaState} from './arena';

export function finishMatch(state:ArenaState,now=Date.now()):ArenaState{
 if(state.match&&state.match.phase!=='open')throw new Error('This match is already finishing.');
 return {...state,match:{...state.match,phase:'countdown',endsAt:now+10000}};
}
export function settleMatch(state:ArenaState,now=Date.now()):ArenaState{
 if(state.match?.phase!=='countdown'||now<(state.match.endsAt??Infinity))return state;
 const results=countries.filter(c=>(state.scores[c.code]||0)>0)
  .map(c=>({...c,points:state.scores[c.code]}))
  .sort((a,b)=>b.points-a.points||a.name.localeCompare(b.name)).slice(0,5);
 return {...state,match:{...state.match,phase:'results',results}};
}
export function nextMatch(state:ArenaState,reset:boolean,now=Date.now()):ArenaState{
 if(state.match?.phase!=='results')throw new Error('Wait for the match results first.');
 return {...state,scores:reset?{}:state.scores,recent:[],viewers:{},match:{phase:'open',openedAt:now}};
}
