import test from 'node:test';
import assert from 'node:assert/strict';
import {ArenaAudio} from '../lib/arena-audio.ts';

test('speech respects mute, queues without overlap, and cancels clips still loading',async()=>{
 const originalContext=globalThis.AudioContext,originalFetch=globalThis.fetch;
 let starts=0,requests=0,release:()=>void=()=>{};
 const barrier=new Promise<void>(resolve=>{release=resolve;});
 const node=()=>({connect(){},disconnect(){},gain:{setValueAtTime(){}}});
 const buffer=()=>({duration:1,numberOfChannels:1,sampleRate:22050,getChannelData:()=>new Float32Array([.1,.2,.1]),copyToChannel(){}});
 class Context{
  state='running';currentTime=0;destination={};
  createGain(){return node();}resume(){return Promise.resolve();}close(){return Promise.resolve();}
  decodeAudioData(){return Promise.resolve(buffer());}createBuffer(){return buffer();}
  createBufferSource(){return {...node(),buffer:null,start(){starts++;},onended:null};}
 }
 globalThis.AudioContext=Context as unknown as typeof AudioContext;
 globalThis.fetch=(async()=>{requests++;await barrier;return new Response(new ArrayBuffer(0));}) as typeof fetch;
 const player=new ArenaAudio(()=>{});
 try{
  player.configure({muted:true,voice:true,volume:.5});await player.announce({kind:'lead',country:'ID'});assert.equal(requests,0);
  player.configure({muted:false,voice:true,volume:.5});
  const pending=player.announce({kind:'lead',country:'ID'});await new Promise(resolve=>setImmediate(resolve));
  const queued=player.announce({kind:'lead',country:'BR'});assert.equal(requests,2,'Queued sentence does not load over the first sentence');
  player.cancelSpeech();release();await pending;await queued;assert.equal(starts,0,'Countdown can cancel a pending ranking voice');
  await player.announce({kind:'winner',country:'ID'},true);assert.equal(starts,2);
  player.configure({muted:false,voice:false,volume:.5});await player.announce({kind:'winner',country:'BR'},true);assert.equal(starts,2);
 }finally{player.close();globalThis.AudioContext=originalContext;globalThis.fetch=originalFetch;}
});
