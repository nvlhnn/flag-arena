import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {countries,initialState} from '../lib/arena.ts';
import {rankingAnnouncement,announcementClips,overtakeAnnouncements} from '../lib/audio-events.ts';

const state=(scores:Record<string,number>)=>({...initialState(),scores});
test('ranking announcements choose leader, top-three overtake, then top-five entry',()=>{
 assert.deepEqual(rankingAnnouncement(state({IR:200,ID:100}),state({IR:200,ID:300})),{kind:'lead',country:'ID'});
 assert.deepEqual(rankingAnnouncement(state({US:500,IR:300,ID:200}),state({US:500,IR:300,ID:400})),{kind:'overtake',country:'ID',other:'IR'});
 assert.deepEqual(rankingAnnouncement(state({US:900,IR:800,ID:700,BR:600,DE:500,JP:400}),state({US:900,IR:800,ID:700,BR:600,DE:500,JP:550})),{kind:'top5',country:'JP'});
});
test('ties, unchanged scores, initial votes, resets and match transitions stay quiet',()=>{
 assert.equal(rankingAnnouncement(state({IR:200,ID:100}),state({IR:200,ID:200})),undefined);
 assert.equal(rankingAnnouncement(state({ID:100}),state({ID:100})),undefined);
 assert.equal(rankingAnnouncement(state({}),state({ID:100})),undefined);
 assert.equal(rankingAnnouncement(state({IR:200,ID:100}),state({IR:0,ID:100})),undefined);
 for(const phase of ['countdown','results'] as const)assert.equal(rankingAnnouncement(state({IR:200,ID:100}),{...state({IR:200,ID:300}),match:{phase,endsAt:100}}),undefined);
 assert.equal(rankingAnnouncement(state({IR:200,ID:100}),{...state({IR:200,ID:300}),match:{phase:'open',openedAt:100}}),undefined);
});
test('one-point votes announce when a tie becomes a real lead or overtake',()=>{
 // Alphabetical order already puts Indonesia first while tied; it must still
 // announce when Indonesia actually gains a one-point lead.
 assert.equal(rankingAnnouncement(state({IR:200,ID:199}),state({IR:200,ID:200})),undefined);
 assert.deepEqual(rankingAnnouncement(state({IR:200,ID:200}),state({IR:200,ID:201})),{kind:'lead',country:'ID'});
 assert.deepEqual(rankingAnnouncement(state({IR:200,ID:200}),state({IR:201,ID:200})),{kind:'lead',country:'IR'});
 assert.deepEqual(rankingAnnouncement(state({US:500,IR:200,ID:200}),state({US:500,IR:200,ID:201})),{kind:'overtake',country:'ID',other:'IR'});
});
test('all country and phrase clips required for announcements exist',()=>{
 for(const country of countries)assert.ok(existsSync(`public/audio/en/${country.code}.wav`),country.code);
 for(const kind of ['lead','overtake','top5','winner','subscriber'] as const)for(const clip of announcementClips({kind,country:'ID',other:'IR'}))assert.ok(existsSync(`public/audio/en/${clip}.wav`),clip);
 assert.deepEqual(announcementClips({kind:'overtake',country:'ID',other:'IR'}),['ID','overtakes','IR']);
});

test('multi-country jumps announce only the highest-ranked country passed',()=>{
 const before=state({US:90,IR:80,ID:70,BR:60,DE:50,JP:40,FR:30});
 assert.deepEqual(overtakeAnnouncements(before,state({...before.scores,FR:51})),[{kind:'jump',country:'FR',passed:['DE','JP']}]);
 assert.deepEqual(overtakeAnnouncements(before,state({...before.scores,FR:40})),[]);
 assert.deepEqual(overtakeAnnouncements(before,{...before,match:{phase:'results'}}),[]);
});

test('grouped overtakes name two countries or summarize three or more',()=>{
 assert.deepEqual(announcementClips({kind:'jump',country:'ID',passed:['IN','MY']}),['ID','overtakes','IN','and','MY']);
 assert.deepEqual(announcementClips({kind:'jump',country:'ID',passed:['IN','MY','JP']}),['ID','overtakes','IN','and-2-others']);
 const before=state({IN:50,MY:50,JP:50,ID:50});
 assert.deepEqual(overtakeAnnouncements(before,state({...before.scores,ID:51})),[{kind:'jump',country:'ID',passed:['IN','JP','MY']}]);
 for(let others=2;others<countries.length-1;others++)assert.ok(existsSync(`public/audio/en/and-${others}-others.wav`));
 assert.ok(existsSync('public/audio/en/and.wav'));
});

test('all style emits one event per passed country while grouped combines them',()=>{
 const before=state({IN:50,MY:40,ID:30}),after=state({IN:50,MY:40,ID:51});
 assert.deepEqual(overtakeAnnouncements(before,after,'all'),[{kind:'overtake',country:'ID',other:'IN'},{kind:'overtake',country:'ID',other:'MY'}]);
 assert.deepEqual(overtakeAnnouncements(before,after,'grouped'),[{kind:'jump',country:'ID',passed:['IN','MY']}]);
});
