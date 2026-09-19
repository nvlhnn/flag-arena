import {parseDonationCountry,type ArenaState} from './arena';
import {defaultDonationEffects,queueDonation} from './donation-effects';
import {superChatPoints,type SuperChatCard,type SupporterPage} from './superchat';

export type DemoSuperChat=SuperChatCard & {round:number;usdMicros:string;message:string};

function micros(value:unknown):string{
 if(typeof value!=='string'||!/^\d{1,9}(\.\d{1,6})?$/.test(value))throw new Error('Enter a positive amount with up to six decimal places.');
 const [whole,fraction='']=value.split('.');
 const amount=BigInt(whole)*BigInt(1000000)+BigInt(fraction.padEnd(6,'0'));
 if(amount<=BigInt(0)||amount>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Amount is outside the supported range.');
 return String(amount);
}

export function applyDemoSuperChats(state:ArenaState,now=Date.now()):ArenaState{
 if(state.mode!=='demo'||!state.demoSuperChats?.some(card=>card.status==='pending'))return state;
 let next={...state,scores:{...state.scores}};
 const round=state.match?.openedAt??0;
 const cards=state.demoSuperChats.map(card=>{
  if(card.status!=='pending')return card;
  if(card.round!==round||state.match?.phase==='results'||now>=(state.match?.endsAt??Infinity))return {...card,status:'closed' as const};
  const viewer=state.viewers?.[card.name];
  const country=card.country??((viewer?.lastVoteAt??-1)>=round?viewer?.lastCountry:undefined);
  if(!country)return card;
  const points=superChatPoints(Number(card.usdMicros));
  const total=(next.scores[country]??0)+points;
  if(!Number.isSafeInteger(total))throw new Error('Demo score is outside the supported range.');
  next={...next,scores:{...next.scores,[country]:total},donationEvents:queueDonation(next.donationEvents??[],{id:card.id,name:card.name,country,points,amountMicros:card.amountMicros,currency:card.currency,preview:true},(state.donationEffects??defaultDonationEffects).duration,now)};
  return {...card,country,points,status:'awarded' as const};
 });
 return {...next,demoSuperChats:cards};
}

export function addDemoSuperChat(state:ArenaState,input:Record<string,unknown>,now=Date.now(),id=crypto.randomUUID()):ArenaState{
 if(state.mode!=='demo')throw new Error('Switch to demo mode to test a Super Chat.');
 if(state.match?.phase==='results'||now>=(state.match?.endsAt??Infinity))throw new Error('Start a new demo round first.');
 if(typeof input.viewer!=='string'||!input.viewer.trim()||input.viewer.length>60)throw new Error('Enter a test viewer name (up to 60 characters).');
 if(typeof input.message!=='string'||input.message.length>2000)throw new Error('Keep the message under 2,000 characters.');
 if(typeof input.currency!=='string'||!/^[A-Z]{3}$/.test(input.currency))throw new Error('Enter a three-letter currency code.');
 if((state.demoSuperChats?.length??0)>=100)throw new Error('Reset the demo to clear its 100 test donations.');
 const amountMicros=micros(input.amount),usdMicros=input.currency==='USD'?amountMicros:micros(input.usdAmount);
 const card:DemoSuperChat={id,name:input.viewer.trim(),avatar:'',country:parseDonationCountry(input.message)??null,amountMicros,currency:input.currency,usdMicros,message:input.message,round:state.match?.openedAt??0,points:0,status:'pending'};
 return applyDemoSuperChats({...state,demoSuperChats:[...(state.demoSuperChats??[]),card]},now);
}

export function demoSupporters(cards:DemoSuperChat[]=[]):SupporterPage{
 const donors=new Map<string,DemoSuperChat[]>();
 for(const card of cards)donors.set(card.name,[...(donors.get(card.name)??[]),card]);
 const entries=[...donors].map(([name,donations])=>{
  const amounts=new Map<string,bigint>();let usd=BigInt(0);
  for(const card of donations){amounts.set(card.currency,(amounts.get(card.currency)??BigInt(0))+BigInt(card.amountMicros));usd+=BigInt(card.usdMicros);}
  const codes=new Set(donations.map(card=>card.country).filter((code):code is string=>Boolean(code)));
  return {id:name,name,avatar:'',country:codes.size===1?[...codes][0]!:null,countries:[...codes].sort(),rank:0,usdMicros:String(usd),points:donations.reduce((sum,card)=>sum+card.points,0),donationCount:donations.length,pendingCount:0,amounts:[...amounts].sort(([a],[b])=>a.localeCompare(b)).map(([currency,amount])=>({currency,amountMicros:String(amount)}))};
 }).sort((a,b)=>BigInt(a.usdMicros)>BigInt(b.usdMicros)?-1:BigInt(a.usdMicros)<BigInt(b.usdMicros)?1:0).map((card,index)=>({...card,rank:index+1}));
 return {session:'demo',total:entries.length,offset:0,cards:entries};
}
