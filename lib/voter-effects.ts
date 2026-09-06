import type {ArenaState} from './arena';
type Vote=ArenaState['recent'][number];
export type VoterEffect=Vote&{starts:number;expires:number};
export function queueVoters(previous:VoterEffect[],newestFirst:Vote[],now:number):VoterEffect[]{
 const queue=previous.filter(v=>v.expires>now);
 for(const vote of [...newestFirst].reverse()){
  if(queue.some(v=>v.id===vote.id))continue;
  // Keep bursts bounded; score counting is independent of visual effects.
  if(queue.length>=100)break;
  const starts=Math.max(now,...queue.filter(v=>v.code===vote.code).map(v=>v.expires));
  queue.push({...vote,starts,expires:starts+2600});
 }
 return queue;
}
