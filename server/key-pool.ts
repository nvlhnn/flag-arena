export class KeyPool{
 private index=0;
 constructor(private keys:string[]){if(!keys.length)throw new Error('Add YOUTUBE_API_KEYS to .env or enter an API key.');}
 current(){return this.keys[this.index];}
 advance(){if(this.index+1>=this.keys.length)return false;this.index++;return true;}
 async lookup<T>(request:(key:string)=>Promise<T>):Promise<T>{
  for(;;){try{return await request(this.current());}catch(error){
   if(!['keyInvalid','quotaExceeded','dailyLimitExceeded','rateLimitExceeded','userRateLimitExceeded','429'].includes((error as {reason?:string}).reason||'')||!this.advance())throw error;
  }}
 }
}
