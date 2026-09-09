import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCountry,acceptVote,initialState,countries} from '../lib/arena.ts';
import {videoId} from '../server/youtube.ts';
test('country names, aliases, emoji and explicit country codes',()=>{assert.equal(parseCountry('Indonesia'),'ID');assert.equal(parseCountry('🇮🇩'),'ID');assert.equal(parseCountry('Indonesia 🇮🇩'),'ID');assert.equal(parseCountry('USA'),'US');assert.equal(parseCountry('!vote IN'),'IN');assert.equal(parseCountry('Deutschland'),'DE');assert.equal(parseCountry('in'),undefined);});
test('reject ambiguous and unrelated chat; repeated same flag is one vote',()=>{for(const text of ['hello','Indonesia Brazil','🇮🇩🇧🇷','Brazil 🇮🇩','!vote ZZ',''])assert.equal(parseCountry(text),undefined);assert.equal(parseCountry('🇮🇩🇮🇩'),'ID');});
test('every supported country has a working name',()=>{for(const c of countries)assert.equal(parseCountry(c.name),c.code,c.name);});
test('each distinct message adds one point immediately, including the same viewer and timestamp',()=>{
 const vote={id:'1',viewerId:'viewer-a',viewer:'Fan',text:'Indonesia',time:100000};
 const first=acceptVote({...initialState(),cooldowns:{'viewer-a':100000}},vote);assert.equal(first.state.scores.ID,1);
 assert.equal(acceptVote(first.state,vote).accepted,false);
 const second=acceptVote(first.state,{...vote,id:'2'});assert.equal(second.state.scores.ID,2);
 const third=acceptVote(second.state,{...vote,id:'3',text:'Brazil'});assert.equal(third.state.scores.BR,1);
 assert.deepEqual(third.state.cooldowns,{});
});
test('YouTube links are parsed without fetching user-controlled URLs',()=>{assert.equal(videoId('https://youtube.com/watch?v=abcdefghijk'),'abcdefghijk');assert.equal(videoId('https://youtu.be/abcdefghijk'),'abcdefghijk');assert.equal(videoId('https://youtube.com/live/abcdefghijk'),'abcdefghijk');assert.throws(()=>videoId('https://example.com/watch?v=abcdefghijk'));assert.throws(()=>videoId('not-a-link'));});
