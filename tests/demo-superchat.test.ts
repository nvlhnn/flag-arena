import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,acceptVote,type ArenaState} from '../lib/arena.ts';
import {addDemoSuperChat,applyDemoSuperChats,demoSupporters} from '../lib/demo-superchat.ts';
import {nextMatch} from '../lib/match.ts';
const input={viewer:'Test viewer',amount:'5',currency:'USD',message:'Go Indonesia!'};
const vote=(state:ArenaState,text:string,viewer='Test viewer',now=2000)=>applyDemoSuperChats(acceptVote(state,{id:String(now),viewerId:viewer,viewer,text,time:now},now).state,now);

void test('demo country message awards exact points, preserves currency, and does not create chat XP',()=>{
 const before=initialState();
 const state=addDemoSuperChat(before,{...input,amount:'150000',currency:'IDR',usdAmount:'9.25'},1000,'a');
 assert.equal(state.scores.ID,9250);assert.deepEqual(state.viewers,{});assert.deepEqual(before.scores,{});
 assert.equal(state.donationEvents![0].currency,'IDR');assert.equal(state.donationEvents![0].preview,true);
 const wall=demoSupporters(state.demoSuperChats);
 assert.deepEqual(wall.cards[0].amounts,[{currency:'IDR',amountMicros:'150000000000'}]);
 assert.equal(wall.cards[0].points,9250);
 assert.deepEqual(applyDemoSuperChats(state,2000),state);
});
void test('no message waits for the same viewer; unrelated chat cannot assign points',()=>{
 let state=addDemoSuperChat(initialState(),{...input,message:''},1000,'a');
 assert.equal(state.demoSuperChats![0].status,'pending');
 state=vote(state,'Brazil','Other viewer');assert.equal(state.demoSuperChats![0].status,'pending');
 state=vote(state,'hello','Test viewer',2100);assert.equal(state.demoSuperChats![0].status,'pending');
 state=vote(state,'Japan','Test viewer',2200);assert.equal(state.scores.JP,5001);
 state=vote(state,'Indonesia','Test viewer',2300);assert.equal(state.demoSuperChats![0].country,'JP');
});
void test('prior country is used for blank messages, explicit messages override it, and wall totals group currencies',()=>{
 let state=vote(initialState(),'Brazil');
 state=addDemoSuperChat(state,{...input,message:''},3000,'a');
 state=addDemoSuperChat(state,{...input,currency:'EUR',amount:'2.5',usdAmount:'3'},3100,'b');
 assert.equal(state.scores.BR,5001);assert.equal(state.scores.ID,3000);
 const card=demoSupporters(state.demoSuperChats).cards[0];assert.equal(card.donationCount,2);assert.equal(card.country,null);
 assert.deepEqual(card.amounts,[{currency:'EUR',amountMicros:'2500000'},{currency:'USD',amountMicros:'5000000'}]);
});
void test('unassigned test donations close with the round and never carry points into the next',()=>{
 let state=addDemoSuperChat(initialState(),{...input,message:''},1000,'a');
 state=nextMatch({...state,match:{phase:'results'}},true,2000);
 state=vote(state,'Indonesia','Test viewer',3000);
 assert.equal(state.scores.ID,1);assert.equal(state.demoSuperChats![0].status,'closed');
});
void test('test donations reject live mode, closed rounds, invalid amounts and invalid fields',()=>{
 assert.throws(()=>addDemoSuperChat({...initialState(),mode:'live'},input),/demo mode/);
 assert.throws(()=>addDemoSuperChat({...initialState(),match:{phase:'results'}},input),/round/);
 for(const amount of ['0','-1','1e3','NaN','1.0000001'])assert.throws(()=>addDemoSuperChat(initialState(),{...input,amount}));
 for(const fields of [{viewer:''},{currency:'$'},{message:42},{currency:'EUR',usdAmount:''}])assert.throws(()=>addDemoSuperChat(initialState(),{...input,...fields}));
});
