import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,migrateScores,acceptVote} from '../lib/arena.ts';
test('v1 scores convert exactly once and new votes add 100',()=>{
 const old={...initialState(),scoreVersion:undefined,scores:{ID:4,BR:2}};
 const migrated=migrateScores(old);
 assert.deepEqual(migrated.scores,{ID:400,BR:200});
 assert.deepEqual(migrateScores(migrated).scores,migrated.scores);
 const result=acceptVote(migrated,{id:'v2',viewerId:'voter',viewer:'Fan',text:'Indonesia',time:1000});
 assert.equal(result.state.scores.ID,500);
});
test('informational likes and subscriptions never award points',()=>{
 for(const text of ['like','subscribe']){
 const result=acceptVote(initialState(),{id:text,viewerId:'voter',viewer:'Fan',text,time:1000});
 assert.equal(result.accepted,false);assert.deepEqual(result.state.scores,{});
 }
});
