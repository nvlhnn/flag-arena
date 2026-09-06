import {existsSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {join} from 'node:path';

// Conservative LOCAL estimate, not Google's authoritative project quota.
// A rolling 24-hour window also avoids spending twice across a day boundary.
export function createRequestBudget(directory:string,now=Date.now,limit=9000){
 const path=join(directory,'request-budget.json');
 let entries:{time:number;units:number}[]=[],blocked=false;
 try{if(existsSync(path)){
  const saved=JSON.parse(readFileSync(path,'utf8'));
  if(!Array.isArray(saved)||saved.some(e=>!Number.isFinite(e.time)||!Number.isFinite(e.units)||e.units<=0))throw new Error('Invalid budget');
  entries=saved;
 }}catch{blocked=true;}
 function prune(){entries=entries.filter(e=>e.time>now()-86400000);}
 return {
  read(){prune();return {estimatedUnits:entries.reduce((n,e)=>n+e.units,0),limit,window:'rolling 24 hours',blocked,requestsLastHour:entries.filter(e=>e.time>now()-3600000).length,estimateOnly:true,nextReleaseAt:entries[0]?new Date(entries[0].time+86400000).toISOString():null};},
  reserve(kind:'stream'|'lookup'){
   prune();const units=kind==='stream'?5:1;
   if(blocked||entries.reduce((n,e)=>n+e.units,0)+units>limit)throw new Error('Local request budget unavailable or exhausted. See diagnostics.');
   const next=[...entries,{time:now(),units}];
   // Reserve on disk BEFORE making an external request. Disk failure fails closed.
   writeFileSync(path+'.tmp',JSON.stringify(next),{flush:true});renameSync(path+'.tmp',path);entries=next;
  }
 };
}
