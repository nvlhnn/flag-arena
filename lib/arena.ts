import iso from 'i18n-iso-countries';
import english from 'i18n-iso-countries/langs/en.json';
iso.registerLocale(english);
const favorites=['ID','IN','US','BR','PH','MX','TR','DE','GB','FR','JP','KR','AR','CA','PK','BD','VN','TH','MY','AU','ES','IT','PT','NL','SA','EG','ZA','NG','MA','DZ','IR','IQ','UA','PL','RU','CN','NP','LK','NO','SE','FI','DK','CH','BE','GR','RO','CL','CO','PE','EC','VE','KE','GH','ET','TZ','SG','NZ','IE','IL','PS'];
export const countries=Object.entries(iso.getNames('en',{select:'official'})).map(([code,name])=>({code,name})).sort((a,b)=>{const ai=favorites.indexOf(a.code),bi=favorites.indexOf(b.code);return(ai<0?999:ai)-(bi<0?999:bi)||a.name.localeCompare(b.name);});
export type Vote={id:string;viewerId:string;viewer:string;text:string;time:number};
export const POINTS_PER_VOTE=100;
export type ArenaState={scoreVersion?:2;mode:'demo'|'live';connected?:boolean;status:string;scores:Record<string,number>;recent:(Vote&{code:string})[];cooldowns:Record<string,number>;seen:string[]};
export const initialState=():ArenaState=>({scoreVersion:2,mode:'demo',status:'Ready for a demo. YouTube is not connected.',scores:{},recent:[],cooldowns:{},seen:[]});
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
export function acceptVote(state:ArenaState,vote:Vote):{accepted:boolean;reason:string;state:ArenaState}{
 if(state.seen.includes(vote.id))return{accepted:false,reason:'This message was already processed.',state};
 const code=parseCountry(vote.text);if(!code)return{accepted:false,reason:'Send one country name, flag emoji, or !vote followed by its two-letter code.',state};
 const last=state.cooldowns[vote.viewerId];if(last!==undefined&&vote.time-last<10000)return{accepted:false,reason:`Wait ${Math.max(1,Math.ceil((10000-(vote.time-last))/1000))} seconds before voting again.`,state};
 const cooldowns=Object.fromEntries(Object.entries(state.cooldowns).filter(([,t])=>vote.time-t<10000));
 return{accepted:true,reason:'Vote counted.',state:{...state,scores:{...state.scores,[code]:(state.scores[code]||0)+POINTS_PER_VOTE},recent:[{...vote,viewer:vote.viewer.slice(0,60),code},...state.recent].slice(0,500),cooldowns:{...cooldowns,[vote.viewerId]:vote.time},seen:[...state.seen,vote.id].slice(-10000)}};
}

export function migrateScores(state:ArenaState):ArenaState {
 if(state.scoreVersion===2)return state;
 return {...state,scoreVersion:2,scores:Object.fromEntries(Object.entries(state.scores).map(([code,votes])=>[code,votes*POINTS_PER_VOTE]))};
}
