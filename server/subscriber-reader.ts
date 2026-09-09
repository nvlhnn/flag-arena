import type {Subscriber,SubscriberLedger} from '../lib/subscribers.ts';
export async function subscriberRequest(path:string,params:Record<string,string>,token:string,reserve:()=>void){
 reserve();const url=new URL(`https://www.googleapis.com/youtube/v3/${path}`);url.search=new URLSearchParams(params).toString();
 let response:Response;
 try{response=await fetch(url,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});}catch{throw Object.assign(new Error('Subscriber network request failed.'),{retryable:true});}
 let data:any;try{data=await response.json();}catch{throw Object.assign(new Error('Subscriber response could not be read.'),{retryable:response.status!==401&&response.status!==403&&response.status!==429});}
 if(!response.ok){
  const reason=data.error?.errors?.[0]?.reason;
  const message=response.status===401?'Subscriber sign-in expired. Reconnect.':reason==='quotaExceeded'||reason==='dailyLimitExceeded'?'Subscriber Google project quota exhausted. Resume after the quota resets.':response.status===429||reason==='rateLimitExceeded'?'Subscriber rate limit reached. Tracking paused.':response.status===403?'Subscriber access denied. Check channel permissions and API configuration.':'Subscriber service temporarily unavailable.';
  throw Object.assign(new Error(message),{retryable:response.status>=500});
 }
 return data;
}
export async function readSubscribers(token:string,reserve:()=>void,ledger?:SubscriberLedger){
 const records:Subscriber[]=[];let page='';
 for(let count=0;count<10;count++){
  const data=await subscriberRequest('subscriptions',{part:'snippet,subscriberSnippet',myRecentSubscribers:'true',maxResults:'50',...(page?{pageToken:page}:{})},token,reserve);
  for(const item of data.items||[]){const id=item.subscriberSnippet?.channelId,name=item.subscriberSnippet?.title,time=Date.parse(item.snippet?.publishedAt||'');if(typeof id==='string'&&typeof name==='string')records.push({id,name,publishedAt:time});}
  page=data.nextPageToken;
  // Once a page overlaps our previous snapshot, older pages cannot contain a
  // newly created subscription. First setup uses the current time as baseline.
  if(!page||!ledger||records.length>0&&records.every(record=>Object.hasOwn(ledger.known,record.id)||record.publishedAt<ledger.baselineAt))return records;
 }
 throw new Error('Subscriber list exceeded 500 entries. Tracking paused to protect quota; narrow the polling strategy before resuming.');
}
