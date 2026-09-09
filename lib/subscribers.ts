import type {ArenaState} from './arena';
export type Subscriber={id:string;name:string;publishedAt:number};
export type SubscriberAlert={id:string;viewer:string;code?:string;points:number;startsAt:number};
export type SubscriberLedger={streamId?:string;scanJobs?:{page:string;full?:boolean}[];ownerId:string;baselineAt:number;initialized?:boolean;known:Record<string,number>;pending:Record<string,{name:string;round:number}>};
// Keep one active stream's subscriber ledger; never archive old subscriber lists.
export function subscriberLedgerForStream(ledger:SubscriberLedger|undefined,streamId:string,now=Date.now()):SubscriberLedger|undefined{
 if(!ledger)return undefined;
 if(ledger.streamId===streamId)return ledger;
 return {ownerId:ledger.ownerId,streamId,baselineAt:now,known:{},pending:{},scanJobs:[]};
}
export const subscriberBonus=50;
export const subscriberAlertDurationMs=3000; // 0.5s enter + 2s hold + 0.5s exit.
function open(state:ArenaState,now:number){return state.match?.phase!=='results'&&(!state.match?.endsAt||now<state.match.endsAt);}
function latestCountry(state:ArenaState,id:string,round:number){
 const viewer=state.viewers?.[id];
 if(viewer?.lastCountry&&(viewer.lastVoteAt??0)>=round)return viewer.lastCountry;
 return state.recent.find(v=>v.viewerId===id&&v.time>=round)?.code;
}
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
  const code=latestCountry(state,subscriber.id,round);
  if(open(state,now)&&subscriber.publishedAt>=round&&code){
   state={...state,scores:{...state.scores,[code]:(state.scores[code]||0)+subscriberBonus}};
   state=alert(state,`${subscriber.id}:${now}`,subscriber.name,code,subscriberBonus,now);
  }else{
   if(open(state,now)&&subscriber.publishedAt>=round)ledger.pending[subscriber.id]={name:subscriber.name,round};
   state=alert(state,`${subscriber.id}:${now}`,subscriber.name,undefined,0,now);
  }
 }
 return {state,ledger};
}
export function applyPendingSubscribers(state:ArenaState,ledger:SubscriberLedger,now=Date.now()){
 if(!Object.keys(ledger.pending).length)return {state,ledger};
 const original=ledger;let changed=false;
 ledger={...ledger,pending:{...ledger.pending}};
 for(const [id,pending] of Object.entries(ledger.pending)){
  if(!open(state,now)||pending.round!==(state.match?.openedAt??0)){delete ledger.pending[id];changed=true;continue;}
  const code=latestCountry(state,id,pending.round);if(!code)continue;
  delete ledger.pending[id];changed=true;state={...state,scores:{...state.scores,[code]:(state.scores[code]||0)+subscriberBonus}};
  state=alert(state,`${id}:bonus:${now}`,pending.name,code,subscriberBonus,now);
 }
 return {state,ledger:changed?ledger:original};
}
