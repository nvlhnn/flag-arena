import './env.ts';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {readFileSync,writeFileSync,renameSync,existsSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';

type Tokens={access_token:string;refresh_token?:string;expiresAt:number};
export function createSubscriberOAuth(directory:string,port:number){
 const path=join(directory,'subscriber-oauth.json'),client=process.env.YOUTUBE_CLIENT_ID||'',secret=process.env.YOUTUBE_CLIENT_SECRET||'';
 const redirect=`http://127.0.0.1:${port}/api/subscribers/callback`;
 let tokens:Tokens|undefined,pending:{state:string;verifier:string;expires:number}|undefined,refreshing:Promise<string>|undefined;
 try{if(existsSync(path)){const saved=JSON.parse(readFileSync(path,'utf8'));if(typeof saved.access_token==='string'&&Number.isFinite(saved.expiresAt))tokens=saved;}}catch{}
 const save=()=>{writeFileSync(path+'.tmp',JSON.stringify(tokens),{flush:true});renameSync(path+'.tmp',path);};
 async function exchange(params:Record<string,string>){
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:client,client_secret:secret,...params}),signal:AbortSignal.timeout(15000)});
  const data=await response.json();if(!response.ok||typeof data.access_token!=='string')throw new Error('Google authorization failed. Reconnect subscriber tracking.');
  tokens={access_token:data.access_token,refresh_token:data.refresh_token||tokens?.refresh_token,expiresAt:Date.now()+Number(data.expires_in||3600)*1000};save();return tokens.access_token;
 }
 return {
  status:()=>({configured:!!client&&!!secret,connected:!!tokens,redirect}),
  start(){
   if(!client||!secret)throw new Error('Add YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET to .env, then restart the app.');
   const state=randomBytes(32).toString('hex'),verifier=randomBytes(32).toString('base64url');pending={state,verifier,expires:Date.now()+600000};
   const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');url.search=new URLSearchParams({client_id:client,redirect_uri:redirect,response_type:'code',scope:'https://www.googleapis.com/auth/youtube.readonly',access_type:'offline',prompt:'consent',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}).toString();return url.toString();
  },
  async callback(code:string,state:string){
   const attempt=pending;pending=undefined;
   if(!attempt||Date.now()>attempt.expires||state.length!==attempt.state.length||!timingSafeEqual(Buffer.from(state),Buffer.from(attempt.state))||!code)throw new Error('Expired or invalid authorization response. Start sign-in again.');
   // Do not retain an earlier account's refresh token during new authorization.
   tokens=undefined;await exchange({grant_type:'authorization_code',code,redirect_uri:redirect,code_verifier:attempt.verifier});
  },
  async access(){
   if(!tokens)throw new Error('Connect subscriber tracking first.');
   if(tokens.expiresAt>Date.now()+60000)return tokens.access_token;
   if(!tokens.refresh_token)throw new Error('Subscriber sign-in expired. Reconnect.');
   refreshing??=exchange({grant_type:'refresh_token',refresh_token:tokens.refresh_token}).finally(()=>{refreshing=undefined;});return refreshing;
  },
  async disconnect(){
   const token=tokens?.refresh_token||tokens?.access_token;
   if(token){const response=await fetch('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token}),signal:AbortSignal.timeout(15000)});if(!response.ok&&response.status!==400)throw new Error('Google could not revoke access. Try disconnecting again.');}
   tokens=undefined;pending=undefined;if(existsSync(path))unlinkSync(path);
  }
 };
}
