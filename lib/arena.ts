import type {SubscriberAlert} from './subscribers';
import type {AudioSettings} from './audio-events';
import iso from 'i18n-iso-countries';
import english from 'i18n-iso-countries/langs/en.json';
iso.registerLocale(english);
const favorites=['ID','IN','US','BR','PH','MX','TR','DE','GB','FR','JP','KR','AR','CA','PK','BD','VN','TH','MY','AU','ES','IT','PT','NL','SA','EG','ZA','NG','MA','DZ','IR','IQ','UA','PL','RU','CN','NP','LK','NO','SE','FI','DK','CH','BE','GR','RO','CL','CO','PE','EC','VE','KE','GH','ET','TZ','SG','NZ','IE','IL','PS'];
export const countries=Object.entries(iso.getNames('en',{select:'official'})).map(([code,name])=>({code,name})).sort((a,b)=>{const ai=favorites.indexOf(a.code),bi=favorites.indexOf(b.code);return(ai<0?999:ai)-(bi<0?999:bi)||a.name.localeCompare(b.name);});
export const levelForXp=(xp:number)=>xp>=360?5:xp>=240?4:xp>=120?3:xp>=40?2:1;
export type ViewerProgress={xp:number;lastXpAt:number};
export type Vote={level?:number;points?:number;levelUp?:boolean;id:string;viewerId:string;viewer:string;text:string;time:number};
export const POINTS_PER_VOTE=1;
export type Match={phase:'open'|'countdown'|'results';openedAt?:number;endsAt?:number;results?:{code:string;name:string;points:number}[]};
export type ArenaState={viewers?:Record<string,ViewerProgress>;subscriberAlerts?:SubscriberAlert[];audio?:AudioSettings;audioTest?:{id:string;at:number};match?:Match;scoreVersion?:2;mode:'demo'|'live';connected?:boolean;status:string;scores:Record<string,number>;recent:(Vote&{code:string})[];cooldowns:Record<string,number>;seen:string[]};
export const initialState=():ArenaState=>({scoreVersion:2,mode:'demo',status:'Ready for a demo. YouTube is not connected.',scores:{},viewers:{},recent:[],cooldowns:{},seen:[]});
const normalize=(s:string)=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const aliases=new Map<string,string>();
for(const c of countries){aliases.set(normalize(c.name),c.code);const all=iso.getName(c.code,'en',{select:'all'});for(const name of Array.isArray(all)?all:[all])if(name)aliases.set(normalize(name),c.code);}
for(const [name,code] of Object.entries({usa:'US',america:'US','united states':'US',uk:'GB',britain:'GB',england:'GB','south korea':'KR',korea:'KR','north korea':'KP',russia:'RU',vietnam:'VN',iran:'IR',syria:'SY',taiwan:'TW',palestine:'PS',turkiye:'TR','czech republic':'CZ',uae:'AE',deutschland:'DE',brasil:'BR'}))aliases.set(normalize(name),code);
export function parseCountry(text:string):string|undefined{
 const flags=[...text.matchAll(/[\u{1F1E6}-\u{1F1FF}]{2}/gu)].map(m=>[...m[0]].map(x=>String.fromCharCode(x.codePointAt(0)!-0x1f1e6+65)).join(''));
 const stripped=text.replace(/[\u{1F1E6}-\u{1F1FF}]/gu,'').trim(),command=/^!vote\s+([a-z]{2})$/i.exec(stripped),word=command?command[1].toUpperCase():aliases.get(normalize(stripped));
 if(stripped&&!word)return undefined;
 const candidates=new Set([...flags,...(word?[word]:[])]);if(candidates.size!==1)return undefined;
 const code=[...candidates][0];return countries.some(c=>c.code===code)?code:undefined;
}
export function acceptVote(state:ArenaState,vote:Vote,now=Date.now(),seenIds?:ReadonlySet<string>):{accepted:boolean;reason:string;state:ArenaState}{
 if(state.match?.phase==='results'||(state.match?.endsAt!==undefined&&now>=state.match.endsAt))return{accepted:false,reason:'Match finished. Voting is closed.',state};
 if(state.match?.openedAt!==undefined&&vote.time<state.match.openedAt)return{accepted:false,reason:'Message belongs to an earlier match.',state};
 if(seenIds?seenIds.has(vote.id):state.seen.includes(vote.id))return{accepted:false,reason:'This message was already processed.',state};
 const code=parseCountry(vote.text);if(!code)return{accepted:false,reason:'Send one country name, flag emoji, or !vote followed by its two-letter code.',state};
 const previous=state.viewers?.[vote.viewerId];
 const xp=previous?.xp??0,points=levelForXp(xp);
 const earnsXp=!previous||vote.time-previous.lastXpAt>=5000;
 const progress={xp:Math.min(360,xp+(earnsXp?1:0)),lastXpAt:earnsXp?vote.time:previous.lastXpAt};
 const level=levelForXp(progress.xp);
 return{accepted:true,reason:'Vote counted.',state:{...state,viewers:{...state.viewers,[vote.viewerId]:progress},scores:{...state.scores,[code]:(state.scores[code]||0)+points},recent:[{...vote,viewer:vote.viewer.slice(0,60),code,points,level,levelUp:level>points},...state.recent].slice(0,500),cooldowns:{},seen:[...state.seen,vote.id].slice(-10000)}};
}

export function migrateScores(state:ArenaState):ArenaState {
 if(state.scoreVersion===2)return state;
 return {...state,scoreVersion:2,scores:Object.fromEntries(Object.entries(state.scores).map(([code,votes])=>[code,votes*100]))};
}
