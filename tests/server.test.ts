import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,type ChildProcess} from 'node:child_process';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
const directory=mkdtempSync(join(tmpdir(),'flag-arena-test-')),base='http://127.0.0.1:4319';let child:ChildProcess;
before(async()=>{child=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,ARENA_PORT:'4319',ARENA_DATA_DIR:directory},stdio:['ignore','pipe','pipe']});await new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Server did not start')),10000);child.stdout!.once('data',()=>{clearTimeout(timeout);resolve();});child.once('error',reject);child.once('exit',code=>{if(code)reject(new Error(`Server exited: ${code}`));});});});
after(()=>child?.kill());
const post=(name:string,body:unknown,origin=base)=>fetch(`${base}/api/${name}`,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)});
test('local service shares votes with overlays and saves them',async()=>{const controller=new AbortController();const stream=await fetch(`${base}/api/events`,{signal:controller.signal});const reader=stream.body!.getReader();assert.match(new TextDecoder().decode((await reader.read()).value),/data:/);const accepted=await(await post('vote',{viewer:'Integration viewer',text:'Indonesia'})).json();assert.equal(accepted.accepted,true);const event=new TextDecoder().decode((await reader.read()).value);assert.match(event,/"ID":100/);controller.abort();const repeat=await(await post('vote',{viewer:'Integration viewer',text:'Brazil'})).json();assert.equal(repeat.accepted,false);const saved=JSON.parse(readFileSync(join(directory,'state.json'),'utf8'));assert.equal(saved.demo.scores.ID,100);assert.equal(saved.live.scores.ID,undefined);});
test('foreign origins and invalid links cannot control the scoreboard',async()=>{assert.equal((await post('reset',{},'https://example.com')).status,403);assert.equal((await post('connect',{video:'https://example.com',credential:'fake-test-value'})).status,400);assert.equal((await fetch(`${base}/api/state`)).status,200);});
test('reset clears scores without removing cooldown protections',async()=>{await post('reset',{});const state=await(await fetch(`${base}/api/state`)).json();assert.deepEqual(state.scores,{});const again=await(await post('vote',{viewer:'Integration viewer',text:'Indonesia'})).json();assert.equal(again.accepted,false);});
test('server runs the ten-second finish and supports both next-match options',async()=>{
 for(const reset of [false,true]){
  await post('vote',{viewer:`Match voter ${reset}`,text:'Indonesia'});
  assert.equal((await post('match/finish',{})).status,200);
  assert.equal((await post('match/finish',{})).status,400);
  assert.equal((await post('match/next',{reset})).status,400);
  const countdown=await(await fetch(`${base}/api/state`)).json();assert.equal(countdown.match.phase,'countdown');
  await delay(Math.max(0,countdown.match.endsAt-Date.now())+150);
  const result=await(await fetch(`${base}/api/state`)).json();assert.equal(result.match.phase,'results');assert.equal(result.match.results[0].code,'ID');
  assert.equal((await(await post('vote',{viewer:'Too late',text:'Brazil'})).json()).accepted,false);
  assert.equal((await post('match/next',{reset})).status,200);
  const next=await(await fetch(`${base}/api/state`)).json();assert.equal(next.match.phase,'open');assert.deepEqual(next.scores,reset?{}:result.scores);
 }
});
