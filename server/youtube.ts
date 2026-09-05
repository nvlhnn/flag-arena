export function videoId(input:string){
 if(/^[\w-]{11}$/.test(input))return input;
 let url:URL;try{url=new URL(input);}catch{throw new Error('Enter a valid YouTube livestream URL.');}
 if(!['https:','http:'].includes(url.protocol)||!['youtube.com','www.youtube.com','m.youtube.com','youtu.be'].includes(url.hostname))throw new Error('Enter a YouTube livestream URL.');
 const id=url.hostname==='youtu.be'?url.pathname.slice(1):url.searchParams.get('v')||/^\/(?:live|shorts)\/([\w-]{11})/.exec(url.pathname)?.[1];
 if(!id||!/^[\w-]{11}$/.test(id))throw new Error('The link needs a YouTube video ID.');return id;
}
export async function youtube(path:string,params:Record<string,string>,key:string){
 const url=new URL(`https://www.googleapis.com/youtube/v3/${path}`);for(const [k,v] of Object.entries({...params,key}))url.searchParams.set(k,v);
 const response=await fetch(url,{signal:AbortSignal.timeout(15000)});const data=await response.json();
 if(!response.ok){const reason=data.error?.errors?.[0]?.reason||String(response.status);const messages:Record<string,string>={quotaExceeded:'YouTube API quota is exhausted. Reconnect after the quota resets.',dailyLimitExceeded:'YouTube API daily limit reached.',keyInvalid:'This API key is invalid.',accessNotConfigured:'Enable YouTube Data API v3 for this key’s Google Cloud project.',liveChatDisabled:'Live chat is disabled on this stream.',liveChatEnded:'The livestream has ended.',forbidden:'This key cannot read this chat. Check the stream visibility and key restrictions.',liveChatNotFound:'This live chat could not be found.'};throw new Error(messages[reason]||`YouTube request failed (${reason}). Check your API key and stream.`);}
 return data;
}
