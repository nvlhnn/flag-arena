import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,acceptVote} from '../lib/arena.ts';
import {finishMatch,settleMatch,nextMatch} from '../lib/match.ts';

test('countdown accepts final votes, freezes at zero, and stores the top five',()=>{
 const base={...initialState(),scores:{ID:500,US:400,BR:300,JP:200,FR:100,DE:100}};
 const countdown=finishMatch(base,1000);assert.equal(countdown.match?.endsAt,11000);
 assert.throws(()=>finishMatch(countdown,2000));
 const vote={id:'last',viewerId:'a',viewer:'A',text:'Indonesia',time:10999};
 const accepted=acceptVote(countdown,vote,10999);assert.equal(accepted.accepted,true);
 assert.equal(acceptVote(countdown,vote,11000).accepted,false);
 assert.equal(settleMatch(accepted.state,10999),accepted.state);
 const results=settleMatch(accepted.state,11000);assert.equal(results.match?.phase,'results');
 assert.equal(results.match?.results?.length,5);assert.equal(results.match?.results?.[0].points,600);
 assert.equal(results.match?.results?.[4].code,'FR');
 assert.equal(acceptVote(results,{...vote,id:'later',time:20000},20000).accepted,false);
 assert.deepEqual(settleMatch(results,99999),results);
});
test('next-match choices keep or reset scores and reject delayed old messages',()=>{
 const result=settleMatch(finishMatch({...initialState(),scores:{ID:100}},0),10000);
 const keep=nextMatch(result,false,12000),reset=nextMatch(result,true,12000);
 assert.equal(keep.scores.ID,100);assert.deepEqual(reset.scores,{});assert.equal(keep.match?.phase,'open');
 const vote={id:'late',viewerId:'b',viewer:'B',text:'Brazil',time:11999};
 assert.equal(acceptVote(keep,vote,13000).accepted,false);
 assert.equal(acceptVote(keep,{...vote,time:12000},13000).accepted,true);
 assert.throws(()=>nextMatch(initialState(),true));
});
test('saved countdowns finalize after downtime and empty matches have no invented winners',()=>{
 const restored=JSON.parse(JSON.stringify(finishMatch(initialState(),0)));
 assert.deepEqual(settleMatch(restored,20000).match?.results,[]);
});
