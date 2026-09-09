import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptVote,initialState,levelForXp} from '../lib/arena.ts';
import {nextMatch} from '../lib/match.ts';
test('five-second XP throttle leaves every vote counting and upgrade applies next vote',()=>{
 let state=initialState();
 for(let i=0;i<40;i++)state=acceptVote(state,{id:String(i),viewerId:'a',viewer:'a',text:'USA',time:i*5000},i*5000).state;
 assert.equal(state.viewers?.a.xp,40);assert.equal(state.recent[0].level,2);assert.equal(state.recent[0].points,1);assert.equal(state.recent[0].levelUp,true);
 state=acceptVote(state,{id:'fast',viewerId:'a',viewer:'renamed',text:'USA',time:195001},195001).state;
 assert.equal(state.viewers?.a.xp,40);assert.equal(state.recent[0].points,2);assert.equal(state.scores.US,42);
 assert.equal(acceptVote(state,{id:'fast',viewerId:'a',viewer:'a',text:'USA',time:100000},100000).accepted,false);
 assert.equal(acceptVote(state,{id:'bad',viewerId:'a',viewer:'a',text:'hello',time:100000},100000).accepted,false);
});
test('level five requires 360 XP and all new matches reset XP',()=>{
 let state=initialState();
 for(let i=0;i<360;i++)state=acceptVote(state,{id:String(i),viewerId:'a',viewer:'a',text:'USA',time:i*5000},i*5000).state;
 assert.equal(state.viewers?.a.xp,360);assert.equal(state.recent[0].level,5);assert.equal(state.recent[0].time,1795000);
 for(const reset of [false,true]){const next=nextMatch({...state,match:{phase:'results'}},reset,1800000);assert.deepEqual(next.viewers,{});assert.equal(next.scores.US,reset?undefined:state.scores.US);}
 assert.deepEqual([0,39,40,119,120,239,240,359,360].map(levelForXp),[1,1,2,2,3,3,4,4,5]);
});
