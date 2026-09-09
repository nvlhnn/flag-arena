import {announcementClips,defaultAudio,type Announcement,type AudioSettings} from './audio-events';

/** Prerecorded speech goes through Web Audio, including the OBS browser mixer. */
export class ArenaAudio{
 private context?:AudioContext;
 private master?:GainNode;
 private speech?:GainNode;
 private buffers=new Map<string,AudioBuffer>();
 private generation=0;
 private speakingUntil=0;
 private queue=Promise.resolve();
 private queued=0;
 private pendingCountries=new Set<string>();
 settings:AudioSettings={...defaultAudio};
 constructor(private report:(blocked:boolean)=>void){}
 private async ready(){
  if(!this.context){this.context=new AudioContext();this.master=this.context.createGain();this.master.connect(this.context.destination);this.speech=this.context.createGain();this.speech.connect(this.master);}
  if(this.context.state==='suspended')void this.context.resume().catch(()=>this.report(true));
  const ready=this.context.state==='running';this.report(!ready);return ready;
 }
 async unlock(){try{await this.ready();if(this.context?.state==='suspended')await this.context.resume();const running=this.context?.state==='running';this.report(!running);return running;}catch{this.report(true);return false;}}
 configure(settings:AudioSettings){this.settings=settings;if(this.master&&this.context)this.master.gain.setValueAtTime(settings.muted?0:settings.volume,this.context.currentTime);if(settings.muted||!settings.voice)this.cancelSpeech();}
 cancelSpeech(){this.generation++;this.speakingUntil=0;if(this.speech&&this.context){this.speech.disconnect();this.speech=this.context.createGain();this.speech.connect(this.master!);}}
 async effect(kind:'tick'|'urgent'|'end'|'rank'|'winner'){
  if(this.settings.muted)return;
  try{if(!await this.ready())return;this.configure(this.settings);const ctx=this.context!;
   const notes=kind==='winner'?[523,659,784,1047]:kind==='rank'?[523,784]:kind==='end'?[130,98]:[kind==='urgent'?1100:750];
   for(const [index,frequency] of notes.entries()){
    const start=ctx.currentTime+index*.15,osc=ctx.createOscillator(),gain=ctx.createGain(),duration=kind==='end'?.65:kind==='tick'?.07:.18;
    osc.type=kind==='end'?'triangle':'sine';osc.frequency.value=frequency;gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.22,start+.008);gain.gain.exponentialRampToValueAtTime(.001,start+duration);osc.connect(gain);gain.connect(this.master!);osc.start(start);osc.stop(start+duration+.02);osc.onended=()=>{osc.disconnect();gain.disconnect();};
   }
  }catch{this.report(true);}
 }
 async announce(event:Announcement,priority=false){
  if(priority)return this.speak(event,true);
  if(this.settings.muted||!this.settings.voice||this.queued>=(this.settings.overtakeStyle==='all'?100:6)||(this.settings.overtakeStyle!=='all'&&this.pendingCountries.has(event.country)))return;
  const generation=this.generation,enqueuedAt=Date.now();this.queued++;this.pendingCountries.add(event.country);
  const task=this.queue.then(async()=>{
   if(generation!==this.generation||(this.settings.overtakeStyle!=='all'&&Date.now()-enqueuedAt>8000))return;
   await this.speak(event);
   const remaining=this.context?Math.max(0,this.speakingUntil-this.context.currentTime):0;
   if(Number.isFinite(remaining)&&remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining*1000));
  }).finally(()=>{this.queued--;this.pendingCountries.delete(event.country);});
  this.queue=task.catch(()=>{});return task;
 }
 private async speak(event:Announcement,priority=false){
  if(this.settings.muted||!this.settings.voice)return;
  if(priority)this.cancelSpeech();
  const generation=this.generation;
  try{if(!await this.ready()||generation!==this.generation)return;const ctx=this.context!;
   if(ctx.currentTime<this.speakingUntil&&!priority)return;
   // Reserve the voice slot while assets load; never build a speech backlog.
   this.speakingUntil=Infinity;
   const buffers=await Promise.all(announcementClips(event).map(async clip=>{
    if(this.buffers.has(clip))return this.buffers.get(clip)!;
    const response=await fetch(`/audio/en/${clip}.wav`);if(!response.ok)throw new Error('Voice clip unavailable');
    const decoded=await ctx.decodeAudioData(await response.arrayBuffer());
    // Remove synthesis padding so separately recorded words form a short sentence.
    const samples=decoded.getChannelData(0),margin=Math.floor(decoded.sampleRate*.025);let first=0,last=samples.length-1;
    while(first<last&&Math.abs(samples[first])<.006)first++;
    while(last>first&&Math.abs(samples[last])<.006)last--;
    first=Math.max(0,first-margin);last=Math.min(samples.length-1,last+margin);
    const buffer=ctx.createBuffer(decoded.numberOfChannels,last-first+1,decoded.sampleRate);
    for(let channel=0;channel<decoded.numberOfChannels;channel++)buffer.copyToChannel(decoded.getChannelData(channel).subarray(first,last+1),channel);
    this.buffers.set(clip,buffer);return buffer;
   }));
   if(generation!==this.generation||this.settings.muted||!this.settings.voice)return;
   this.configure(this.settings);let start=ctx.currentTime+.15;
   for(const buffer of buffers){const source=ctx.createBufferSource();source.buffer=buffer;source.connect(this.speech!);source.start(start);source.onended=()=>source.disconnect();start+=buffer.duration+.025;}
   this.speakingUntil=start;
  }catch{if(generation===this.generation){this.speakingUntil=0;this.report(true);}}
 }
 close(){this.generation++;void this.context?.close();}
}
