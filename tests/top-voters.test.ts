import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptVote,initialState} from '../lib/arena.ts';
import {topCountryVoters} from '../lib/top-voters.ts';
import {nextMatch} from '../lib/match.ts';

test('top voters retain points past feed trimming and separate countries',()=>{
 let state=initialState();
 for(let i=0;i<510;i++)state=acceptVote(state,{id:String(i),viewerId:'a',viewer:'Alice',text:'Indonesia',time:1000}).state;
 state=acceptVote(state,{id:'b',viewerId:'b',viewer:'Bob',text:'Brazil',time:1000}).state;
 assert.deepEqual(topCountryVoters(state).ID,{name:'Alice',points:510});
 assert.deepEqual(topCountryVoters(state).BR,{name:'Bob',points:1});
 assert.deepEqual(topCountryVoters(nextMatch({...state,match:{phase:'results'}},true)),{});
});
