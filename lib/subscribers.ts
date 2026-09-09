import type {ArenaState} from './arena';
export type Subscriber={id:string;name:string;publishedAt:number};
export type SubscriberAlert={id:string;viewer:string;code?:string;points:number;startsAt:number};
export type SubscriberLedger={ownerId:string;baselineAt:number;initialized?:boolean;known:Record<string,number>;pending:Record<string,{name:string;round:number}>};
export const subscriberBonus=50;
export const subscriberAlertDurationMs=3000; // 0.5s enter + 2s hold + 0.5s exit.
function open(state:ArenaState,now:number){return state.match?.phase!=='results'&&(!state.match?.endsAt||now<state.match.endsAt);}
function alert(state:ArenaState,id:string,name:string,code:string|undefined,points:number,now:number):ArenaState{
 const alerts=state.subscriberAlerts||[],startsAt=Math.max(now,(alerts.at(-1)?.startsAt??0)+subscriberAlertDurationMs);
 if(startsAt>now+30000)return state;
 return {...state,subscriberAlerts:[...alerts,{id,viewer:name.slice(0,60),code,points,startsAt}].slice(-20)};
}
export function ingestSubscribers(state:ArenaState,ledger:SubscriberLedger,records:Subscriber[],now=Date.now()){
 ledger={...ledger,known:{...ledger.known},pending:{...ledger.pending}};
 for(const subscriber of records){
  if(Object.hasOwn(ledger.known,subscriber.id))continue;
  ledger.known[subscriber.id]=now;
  if(subscriber.publishedAt<ledger.baselineAt||!Number.isFinite(subscriber.publishedAt))continue;
  const round=state.match?.openedAt??0;
  const vote=state.recent.find(v=>v.viewerId===subscriber.id&&v.time>=round);
  if(open(state,now)&&vote){
   state={...state,scores:{...state.scores,[vote.code]:(state.scores[vote.code]||0)+subscriberBonus}};
   state=alert(state,`${subscriber.id}:${now}`,subscriber.name,vote.code,subscriberBonus,now);
  }else{
   if(open(state,now))ledger.pending[subscriber.id]={name:subscriber.name,round};
   state=alert(state,`${subscriber.id}:${now}`,subscriber.name,undefined,0,now);
  }
 }
 return {state,ledger};
}
export function applyPendingSubscribers(state:ArenaState,ledger:SubscriberLedger,now=Date.now()){
 ledger={...ledger,pending:{...ledger.pending}};
 for(const [id,pending] of Object.entries(ledger.pending)){
  if(!open(state,now)||pending.round!==(state.match?.openedAt??0)){delete ledger.pending[id];continue;}
  const vote=state.recent.find(v=>v.viewerId===id&&v.time>=pending.round);if(!vote)continue;
  delete ledger.pending[id];state={...state,scores:{...state.scores,[vote.code]:(state.scores[vote.code]||0)+subscriberBonus}};
  state=alert(state,`${id}:bonus:${now}`,pending.name,vote.code,subscriberBonus,now);
 }
 return {state,ledger};
}
