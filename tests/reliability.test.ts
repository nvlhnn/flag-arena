import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequestBudget} from '../server/request-budget.ts';
import {queueVoters} from '../lib/voter-effects.ts';
import {createDiagnostics} from '../server/diagnostics.ts';

test('budget survives reconnect/restart and releases old reservations',()=>{
 const directory=mkdtempSync(join(tmpdir(),'arena-budget-'));let now=100000000;
 const budget=createRequestBudget(directory,()=>now,10);budget.reserve('stream');
 const restarted=createRequestBudget(directory,()=>now,10);restarted.reserve('stream');
 assert.throws(()=>restarted.reserve('lookup'));assert.equal(restarted.read().estimatedUnits,10);
 now+=86400001;restarted.reserve('lookup');assert.equal(restarted.read().estimatedUnits,1);
 writeFileSync(join(directory,'request-budget.json'),'broken');
 assert.throws(()=>createRequestBudget(directory,()=>now,10).reserve('stream'));
});
test('voter bursts display oldest then newest without overlap on the same flag',()=>{
 const vote=(id:string,code='ID')=>({id,code,viewer:id,viewerId:id,text:code,time:1});
 const queue=queueVoters([],[vote('new'),vote('old'),vote('other','BR')],10000);
 assert.equal(queue.find(v=>v.code==='ID')?.id,'old');
 assert.equal(queue.find(v=>v.id==='new')?.starts,12600);
 assert.equal(queue.find(v=>v.id==='other')?.starts,10000);
 assert.equal(queueVoters(queue,[vote('new')],11000).length,3);
});
test('diagnostics persist durations and vote totals without credentials or cursor',()=>{
 const directory=mkdtempSync(join(tmpdir(),'arena-diag-'));const diagnostics=createDiagnostics(directory);
 diagnostics.record({event:'stream_end',durationMs:10000});diagnostics.record({event:'votes',accepted:2,ignored:3});
 diagnostics.flush();
 const data=createDiagnostics(directory).read();assert.equal(data.acceptedVotes,2);assert.equal(data.ignoredMessages,3);assert.equal(data.lastConnectionDurationMs,10000);
 assert.doesNotMatch(JSON.stringify(data),/pageToken|credential/);
});

test('advisory accounting survives restart and permits requests above its estimate',()=>{
 const directory=mkdtempSync(join(tmpdir(),'arena-advisory-'));
 const budget=createRequestBudget(directory,()=>100000000,5,false);
 budget.reserve('stream');budget.reserve('lookup');
 const restored=createRequestBudget(directory,()=>100000000,5,false);
 assert.equal(restored.read().estimatedUnits,6);assert.equal(restored.read().warning,true);assert.equal(restored.read().blocked,false);
 restored.reserve('stream');assert.equal(restored.read().estimatedUnits,11);
});
