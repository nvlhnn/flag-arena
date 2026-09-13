import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {queueDonation,activeDonation,defaultDonationEffects,validDonationEffects,spokenName} from '../lib/donation-effects.ts';
import {createDonationVoice} from '../server/donation-voice.ts';
const event={id:'one',name:'Alex',country:'ID',points:5000,amountMicros:'5000000',currency:'USD'};

void test('celebrations serialize, expire, cap bursts and yield to the finale',()=>{
 let events=queueDonation([],event,10,1000);
 assert.equal(events[0].startsAt,1500);
 events=queueDonation(events,{...event,id:'two'},6,1000);
 assert.equal(events[1].startsAt,11850);
 assert.deepEqual(queueDonation(events,event,10,1000),events);
 assert.equal(activeDonation(events,'open',2000)?.id,'one');
 assert.equal(activeDonation(events,'countdown',2000),undefined);
 assert.equal(activeDonation(events,'results',2000),undefined);
 assert.equal(activeDonation(events,'open',11550),undefined);
 assert.equal(queueDonation(events,{...event,id:'new'},10,20000).length,1);
 for(let i=0;i<40;i++)events=queueDonation(events,{...event,id:String(i)},10,1000);
 assert.equal(events.length,30);
});
void test('settings reject invalid durations and volume; names remain short plain text',()=>{
 assert.equal(validDonationEffects(defaultDonationEffects),true);
 for(const change of [{duration:5},{duration:16},{duration:8.5},{volume:NaN},{volume:2},{names:'yes'}])assert.equal(validDonationEffects({...defaultDonationEffects,...change}),false);
 assert.equal(spokenName('@Alex_123 🚀'),'Alex 123');
 assert.equal(spokenName('a'.repeat(100)).length,40);
});
void test('voice cache deduplicates simultaneous requests and bounds stored clips',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'arena-voice-'));let count=0,active=0,max=0;
 const voice=createDonationVoice(directory,async(text,path)=>{count++;active++;max=Math.max(max,active);await new Promise(resolve=>setImmediate(resolve));writeFileSync(path,text);active--;});
 const [a,b]=await Promise.all([voice.clip('Alex'),voice.clip('Alex')]);assert.equal(a,b);assert.equal(count,1);
 await voice.clip('Alex');assert.equal(count,1);
 assert.equal(voice.file('../secret'),undefined);
 const full=await voice.playlist({...event,startsAt:0,endsAt:10000},defaultDonationEffects);
 assert.equal(full.clips.length,6);assert.equal(max,1);
 const anonymous=await voice.playlist({...event,startsAt:0,endsAt:10000},{...defaultDonationEffects,names:false,amounts:false});
 assert.equal(anonymous.clips.length,4);assert.equal(anonymous.clips.includes(a),false);
 for(let i=0;i<260;i++)await voice.clip('name '+i);
 assert.equal(readdirSync(join(directory,'donation-voice')).length,256);
});
void test('missing local speech falls back to prerecorded thanks',async()=>{
 const voice=createDonationVoice(mkdtempSync(join(tmpdir(),'arena-voice-fail-')),async()=>{throw new Error('Unavailable');});
 const result=await voice.playlist({...event,startsAt:0,endsAt:10000},defaultDonationEffects);
 assert.deepEqual(result.clips,['/audio/en/donation-thank-you.wav','/audio/en/donation-super-chat.wav']);
});
