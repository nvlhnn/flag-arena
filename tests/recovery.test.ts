import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,writeFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {initialState} from '../lib/arena.ts';

test('startup recovers a damaged score file and preserves its unreadable copy',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'arena-recovery-'));
 const demo={...initialState(),scores:{ID:100}};
 writeFileSync(join(directory,'state.json'),'broken');
 writeFileSync(join(directory,'state.json.backup'),JSON.stringify({demo,live:{...initialState(),mode:'live'},video:'video',resume:{chat:'chat',page:'saved',since:1000}}));
 const child=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,ARENA_PORT:'4320',ARENA_DATA_DIR:directory},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Server startup timeout')),10000);child.stdout.once('data',()=>{clearTimeout(timer);resolve();});child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('exit',code=>{clearTimeout(timer);reject(new Error(`Server exited ${code}`));});});
  const state=await(await fetch('http://127.0.0.1:4320/api/state')).json();assert.equal(state.scores.ID,100);
  const diagnostics=await(await fetch('http://127.0.0.1:4320/api/diagnostics')).json();assert.equal(diagnostics.resumeAvailable,true);
  assert.ok(readdirSync(directory).some(name=>name.startsWith('state.json.unreadable-')));
 }finally{child.kill();}
});
