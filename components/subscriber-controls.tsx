import {useEffect,useState} from 'react';
type Config={keyCount:number;subscribers:{configured:boolean;connected:boolean;enabled:boolean;status:string;redirect:string;recordsLastCheck?:number;pendingBonuses?:number;lastCheck?:string}};
export function SubscriberControls({local,demo,action,onKeys}:{local:boolean;demo:boolean;action:(name:string,body?:Record<string,unknown>)=>Promise<any>;onKeys:(count:number)=>void}){
 const [config,setConfig]=useState<Config|null>(null),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{if(!local)return;let stopped=false;const update=async()=>{try{const response=await fetch('/api/config');if(!response.ok)return;const next=await response.json();if(!stopped){setConfig(next);onKeys(next.keyCount);}}catch{}};void update();const timer=setInterval(()=>void update(),5000);return()=>{stopped=true;clearInterval(timer);};},[local,onKeys]);
 const run=async(name:string)=>{setBusy(true);try{const response=await action(name);if(response.url){location.href=response.url;return;}setNotice(name.endsWith('/test')?'Demo subscriber alert sent.':'Subscriber settings updated.');}catch(error){setNotice((error as Error).message);}finally{setBusy(false);}};
 const redirect=config?.subscribers.redirect||'http://127.0.0.1:4318/api/subscribers/callback';
 const copy=async(value:string)=>{try{await navigator.clipboard.writeText(value);setNotice('Copied to clipboard.');}catch{setNotice('Could not copy. Select and copy the text below.');}};
 if(!local)return null;
 return <div className="control-card subscriber-setup">
  <div className="card-title"><h2>Subscriber rewards</h2><span className="tag">+50 POINTS</span></div>
  <p>Connect the Google account that owns your stream to detect new public subscribers.</p>
  <div className="oauth-status"><b>{!config?'Checking setup…':config.subscribers.connected?'Google account connected':config.subscribers.configured?'Ready to sign in':'Google setup needed'}</b><small>{config?.subscribers.status||'Loading subscriber status…'}</small></div>
  {config?.subscribers.configured&&<><button className="primary" disabled={busy} onClick={()=>void run('subscribers/connect')}>{config.subscribers.connected?'Change signed-in channel':'Sign in with Google'}</button>{config.subscribers.connected&&<div className="oauth-actions"><button className="secondary" disabled={busy} onClick={()=>void run('subscribers/resume')}>Resume tracking</button><button className="text-button" disabled={busy} onClick={()=>void run('subscribers/disconnect')}>Disconnect tracking</button></div>}</>}
  <details className="oauth-guide" open={!config?.subscribers.configured}>
   <summary>Google sign-in setup · step by step</summary>
   <ol className="setup-steps">
    <li><b>Open your Google Cloud project</b><p>Use the project with YouTube Data API v3 enabled.</p><a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noreferrer">Open YouTube API settings ↗</a></li>
    <li><b>Configure Google Auth Platform</b><p>Open Branding / Get started. Name the app Flag Arena and enter your support and contact email. Choose External for a personal Google account.</p></li>
    <li><b>Add yourself as a test user</b><p>In Audience, keep Testing and add the Google email that owns your YouTube channel. In Data Access, add the YouTube read-only scope:</p><code className="oauth-redirect">https://www.googleapis.com/auth/youtube.readonly</code></li>
    <li><b>Create a Web application client</b><p>Go to Clients → Create client → Web application. Name it Flag Arena Local. Under <strong>Authorized redirect URIs</strong>, paste this exact value:</p><code className="oauth-redirect">{redirect}</code><button className="secondary" onClick={()=>void copy(redirect)}>Copy redirect URI</button><small>Leave JavaScript origins empty. Use 127.0.0.1 exactly, not localhost.</small><a href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noreferrer">Open Google Auth Platform ↗</a></li>
    <li><b>Save the client ID and secret locally</b><p>After creating the client, copy its ID and secret into the existing fields in your project's <strong>.env</strong> file. Keep the API keys already there.</p><pre className="oauth-redirect">{'YOUTUBE_CLIENT_ID=your-client-id.apps.googleusercontent.com\nYOUTUBE_CLIENT_SECRET=your-client-secret'}</pre><small>These are OAuth credentials, different from API keys. Keep the secret in .env.</small></li>
    <li><b>Restart, then sign in</b><p>Restart Flag Arena after saving .env. Refresh this page and click <strong>Sign in with Google</strong> above. Choose the channel that owns your stream and allow read-only YouTube access. Use Chrome or Edge for sign-in.</p></li>
   </ol>
  </details>
  <div className="subscriber-explainer"><b>Tracking health</b><p>Last successful check: {config?.subscribers.lastCheck?new Date(config.subscribers.lastCheck).toLocaleTimeString():"Not yet checked"}<br/>Subscribers returned: {config?.subscribers.recordsLastCheck??0}<br/>Bonuses waiting for a country vote: {config?.subscribers.pendingBonuses??0}</p><b>Once connected</b><p>Connect your livestream in the Live tab. The first subscriber check sets a starting point; existing subscribers receive no bonus. Later checks run every 15 seconds.</p><small>A new public subscriber earns 50 points for their latest country vote in this match, or their next vote if they have not voted yet. Private subscriptions cannot be detected. Finished results stay locked.</small></div>
  <button className="secondary" disabled={!demo||busy} onClick={()=>void run('subscribers/test')}>Preview subscriber alert (+50 demo)</button>
  {!demo&&<small>Switch to demo mode to preview an alert.</small>}
  {notice&&<p role="status">{notice}</p>}
 </div>;
}
