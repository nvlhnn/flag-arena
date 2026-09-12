import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptVote,catchUpMultiplier,initialState} from '../lib/arena.ts';
import {nextMatch} from '../lib/match.ts';

test('catch-up thresholds, activation, and off switch',()=>{
 for(const [points,multiplier] of [[0,5],[999,5],[1000,4],[1999,4],[2000,3],[2999,3],[3000,2],[3599,2],[3600,1],[4000,1]]){
  const state={...initialState(),scores:{ID:4000,BR:points}};
  assert.equal(catchUpMultiplier(state,'BR'),multiplier);
  assert.equal(catchUpMultiplier({...state,catchUpEnabled:false},'BR'),1);
 }
 assert.equal(catchUpMultiplier({...initialState(),scores:{ID:999}},'BR'),1);
 assert.equal(catchUpMultiplier({...initialState(),scores:{ID:1000}},'BR'),5);
});

test('bonuses respect level progression and recalculate after crossing a threshold',()=>{
 const state={...initialState(),scores:{ID:4000,BR:999},viewers:{fan:{xp:120,lastXpAt:1000}}};
 const vote={id:'a',viewerId:'fan',viewer:'Fan',text:'Brazil',time:2000};
 const first=acceptVote(state,vote).state;
 assert.equal(first.scores.BR,1014);
 assert.equal(first.recent[0].basePoints,3);
 assert.equal(first.recent[0].multiplier,5);
 assert.equal(first.recent[0].levelUp,false);
 const second=acceptVote(first,{...vote,id:'b'}).state;
 assert.equal(second.recent[0].points,12);
 assert.equal(acceptVote(second,{...vote,id:'b'}).accepted,false);
 const off=acceptVote({...second,catchUpEnabled:false},{...vote,id:'c'}).state;
 assert.equal(off.recent[0].points,3);
 assert.equal(state.scores.BR,999);
 assert.equal(nextMatch({...off,match:{phase:'results'}},true).catchUpEnabled,false);
});

test('level-up still fires when bonus award exceeds new viewer level',()=>{
 const state={...initialState(),scores:{ID:4000},viewers:{fan:{xp:39,lastXpAt:0}}};
 const result=acceptVote(state,{id:'a',viewerId:'fan',viewer:'Fan',text:'Brazil',time:6000}).state;
 assert.equal(result.recent[0].points,5);
 assert.equal(result.recent[0].level,2);
 assert.equal(result.recent[0].levelUp,true);
});
