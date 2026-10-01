import type {Project,Track,NoteEvent,ControlEvent} from '../types';
import {AudioBus,audibleTracks} from './effects';
type ScheduledEvent={type:'on'|'off'|'control';channel:number;pitch?:number;velocity?:number;controller?:number;value?:number;time:number;transport:boolean};
export class AudioEngine {
 context?:AudioContext;node?:AudioWorkletNode;master?:GainNode;
 private buses:AudioBus[]=[];private tracks:Track[]=[];private banks=new Map<string,ArrayBuffer>();private offsets:Record<string,number>={generaluser:0};
 private buffers=new Map<string,AudioBuffer>();private sources:AudioBufferSourceNode[]=[];private ready?:Promise<void>;
 private schedule?:ReturnType<typeof setInterval>;private origin=0;private offset=0;private events:ScheduledEvent[]=[];private cursor=0;
 private clickTimer?:ReturnType<typeof setInterval>;private clicks=new Set<OscillatorNode>();
 playing=false;
 onEnded?:()=>void;
 async ensure(tracks:Track[]){
  if(!this.ready)this.ready=(async()=>{
   const context=new AudioContext({sampleRate:44100,latencyHint:'interactive'});this.context=context;
   await context.audioWorklet.addModule(new URL(import.meta.env.BASE_URL+'audio-worklet.js',window.location.href).href);
   const node=new AudioWorkletNode(context,'music-workbench',{numberOfInputs:0,numberOfOutputs:16,outputChannelCount:Array(16).fill(2)});
   this.node=node;this.master=context.createGain();
   const limiter=context.createDynamicsCompressor();limiter.threshold.value=-2;limiter.knee.value=0;limiter.ratio.value=20;limiter.attack.value=.001;limiter.release.value=.08;
   this.master.connect(limiter).connect(context.destination);
   const data=await window.workbench.readFont('generaluser');this.banks.set('generaluser',new Uint8Array(data).buffer);
   await new Promise<void>((resolve,reject)=>{
    node.port.onmessage=e=>{if(e.data.ready)resolve();if(e.data.error)reject(new Error(e.data.error));};
    node.port.postMessage({type:'init',banks:[{id:'generaluser',data:this.banks.get('generaluser')!.slice(0),offset:0}]});
   });
  })().catch(error=>{this.ready=undefined;this.context?.close();this.context=undefined;throw error;});
  await this.ready;
  await this.context!.resume();
  await this.sync(tracks);
 }
 async sync(tracks:Track[]){
  if(!this.node||!this.context||!this.master)return;
  const missing=[...new Set(tracks.map(t=>t.soundBank))].filter(id=>!this.banks.has(id));
  if(missing.length){
   for(const id of missing){const b=await window.workbench.readFont(id);this.banks.set(id,new Uint8Array(b).buffer);this.offsets[id]=Object.keys(this.offsets).length;}
   // Bank reload is only performed during a stopped configuration change.
   this.stop();this.node.port.postMessage({type:'init',banks:[...this.banks].map(([id,data])=>({id,data:data.slice(0),offset:this.offsets[id]}))});
  }
  const structural=this.tracks.map(t=>t.id).join(',')!==tracks.map(t=>t.id).join(',');
  if(structural){
   this.stop();
   this.node.disconnect();for(const bus of this.buses)bus.dispose();
   this.buses=tracks.map((track,i)=>{const bus=new AudioBus(this.context!,this.master!,track);this.node!.connect(bus.input,i);return bus;});
  }
  this.tracks=tracks;
  const allowed=new Set(audibleTracks(tracks).map(t=>t.id));
  tracks.forEach((t,i)=>this.buses[i]?.update(t,allowed.has(t.id)));
  this.node.port.postMessage({type:'config',tracks:tracks.map(t=>({...t,notes:[],sourceNotes:[],controls:[]})),offsets:this.offsets});
 }
 now(){return this.context?.currentTime||0}
 transportClock(position:number){return this.origin+position}
 position(){return this.playing?Math.max(0,this.now()-this.origin):this.offset}
 channel(id:string){return this.tracks.findIndex(t=>t.id===id)}
 noteOn(id:string,pitch:number,velocity:number){
  const channel=this.channel(id);if(channel<0)return;
  this.node?.port.postMessage({type:'events',events:[{type:'on',channel,pitch,velocity,time:this.now(),transport:false}]});
 }
 noteOff(id:string,pitch:number){
  const channel=this.channel(id);if(channel<0)return;
  this.node?.port.postMessage({type:'events',events:[{type:'off',channel,pitch,time:this.now(),transport:false}]});
 }
 control(id:string,controller:number,value:number){
  const channel=this.channel(id);if(channel<0)return;
  this.node?.port.postMessage({type:'events',events:[{type:'control',channel,controller,value,time:this.now(),transport:false}]});
 }
 panic(){this.node?.port.postMessage({type:'panic'});}
 async buffer(projectId:string,asset:string){
  const key=projectId+'/'+asset;const cached=this.buffers.get(key);if(cached)return cached;
  if(!this.context)throw new Error('音频引擎尚未启动');
  const bytes=await window.workbench.readAudio(projectId,asset);
  const decoded=await this.context.decodeAudioData(new Uint8Array(bytes).buffer);
  this.buffers.set(key,decoded);return decoded;
 }
 clearCache(){this.buffers.clear();}
 async play(project:Project,offset=0,end=project.duration,original=false,lead=.08){
  await this.ensure(project.tracks);this.stop();
  this.offset=offset;this.origin=this.now()+lead-offset;
  this.playing=true;this.events=[];this.cursor=0;
  if(original&&project.original){
   const source=this.context!.createBufferSource();source.buffer=await this.buffer(project.id,project.original);
   this.origin=this.now()+lead-offset;
   source.connect(this.master!);source.start(this.origin+offset,offset,Math.max(.001,end-offset));this.sources.push(source);
  }else{
   for(let i=0;i<project.tracks.length;i++){
    const track=project.tracks[i];
    if(track.mode==='audio'&&track.asset){
     const source=this.context!.createBufferSource();source.buffer=await this.buffer(project.id,track.asset);
     source.connect(this.buses[i].input);this.sources.push(source);
    }else{
     for(const n of track.notes){if(n.start+n.duration<=offset||n.start>=end)continue;
      this.events.push({type:'on',channel:i,pitch:n.pitch,velocity:n.velocity,time:this.origin+Math.max(offset,n.start),transport:true},
       {type:'off',channel:i,pitch:n.pitch,time:this.origin+Math.min(end,n.start+n.duration),transport:true});
     }
     for(const c of track.controls)if(c.time>=offset&&c.time<end)this.events.push({type:'control',channel:i,controller:c.controller,value:c.value,time:this.origin+c.time,transport:true});
    }
   }
   // Decode can be slow; all tracks get the same freshly chosen audio-clock origin.
   const shift=this.now()+lead-offset-this.origin;this.origin+=shift;this.events.forEach(e=>e.time+=shift);
   this.sources.forEach(source=>source.start(this.origin+offset,offset,Math.max(.001,end-offset)));
  }
  this.events.sort((a,b)=>a.time-b.time||(a.type==='off'?-1:1));
  const tick=()=>{
   if(!this.playing)return;
   const upcoming:ScheduledEvent[]=[];
   while(this.events[this.cursor]?.time<this.now()+.15)upcoming.push(this.events[this.cursor++]);
   if(upcoming.length)this.node?.port.postMessage({type:'events',events:upcoming});
   if(this.position()>=end){this.stop();this.offset=end;this.onEnded?.();}
  };this.schedule=setInterval(tick,25);tick();
 }
 stop(){
  if(this.playing)this.offset=this.position();
  this.playing=false;if(this.schedule)clearInterval(this.schedule);this.schedule=undefined;
  if(this.clickTimer)clearInterval(this.clickTimer);this.clickTimer=undefined;
  for(const click of this.clicks){try{click.stop();click.disconnect()}catch{}}this.clicks.clear();
  this.sources.forEach(s=>{try{s.stop();s.disconnect();}catch{}});this.sources=[];
  this.node?.port.postMessage({type:'stop'});
 }
 metronome(bpm:number,start:number,beats=4){
  if(!this.context)return;
  if(this.clickTimer)clearInterval(this.clickTimer);
  let i=0;
  const scheduleClicks=()=>{while(i<beats&&start+i*60/bpm<this.now()+.15){
   const oscillator=this.context!.createOscillator(),gain=this.context!.createGain();
   oscillator.frequency.value=i%4?880:1320;gain.gain.value=.08;oscillator.connect(gain).connect(this.master!);
   const time=Math.max(this.now(),start+i++*60/bpm);gain.gain.setValueAtTime(.08,time);gain.gain.exponentialRampToValueAtTime(.001,time+.07);
   this.clicks.add(oscillator);oscillator.onended=()=>{this.clicks.delete(oscillator);oscillator.disconnect();gain.disconnect()};
   oscillator.start(time);oscillator.stop(time+.08);
  }if(i>=beats&&this.clickTimer){clearInterval(this.clickTimer);this.clickTimer=undefined}};
  this.clickTimer=setInterval(scheduleClicks,25);scheduleClicks();
 }
 async render(project:Project,ids:string[]|undefined,onProgress:(value:number,label:string)=>void){
  await this.ensure(project.tracks);this.stop();
  const tracks=audibleTracks(project.tracks).filter(t=>!ids||ids.includes(t.id));
  if(!tracks.length)throw new Error('没有可导出的音轨');
  const sampleRate=44100,duration=Math.min(600,project.duration)+1.5,length=Math.ceil(duration*sampleRate);
  const mixed=[new Float32Array(length),new Float32Array(length)];
  for(let i=0;i<tracks.length;i++){
   const track=tracks[i];onProgress(i/tracks.length,'渲染 '+track.name);
   let buffer:AudioBuffer;
   if(track.mode==='audio'&&track.asset)buffer=await this.buffer(project.id,track.asset);
   else{
    const data=await this.renderNotes(track,duration,value=>onProgress((i+value*.8)/tracks.length,'采样重放 '+track.name));
    buffer=this.context!.createBuffer(2,length,sampleRate);buffer.copyToChannel(data.left,0);buffer.copyToChannel(data.right,1);
   }
   const offline=new OfflineAudioContext(2,length,sampleRate);
   const bus=new AudioBus(offline,offline.destination,track);
   const source=offline.createBufferSource();source.buffer=buffer;source.connect(bus.input);source.start();
   const rendered=await offline.startRendering();bus.dispose();
   for(let ch=0;ch<2;ch++){const data=rendered.getChannelData(ch);for(let s=0;s<length;s++)mixed[ch][s]+=data[s];}
  }
  onProgress(1,'编码音频');
  return encodeWav(mixed,sampleRate);
 }
 private renderNotes(track:Track,duration:number,onProgress:(value:number)=>void){
  return new Promise<{left:Float32Array<ArrayBuffer>;right:Float32Array<ArrayBuffer>}>((resolve,reject)=>{
   const worker=new Worker(new URL('./render-worker.ts',import.meta.url),{type:'module'});
   worker.onmessage=e=>{if(e.data.error){worker.terminate();reject(new Error(e.data.error));}
    else if(e.data.left){worker.terminate();resolve(e.data);}else onProgress(e.data.progress)};
   worker.onerror=e=>{worker.terminate();reject(new Error(e.message));};
   const data=this.banks.get(track.soundBank)||this.banks.get('generaluser')!;
   worker.postMessage({track,duration,sampleRate:44100,banks:[{id:track.soundBank,data:data.slice(0),offset:this.offsets[track.soundBank]||0}]});
  });
 }
}
export function encodeWav(channels:Float32Array[],sampleRate:number){
 const length=channels[0].length,data=new ArrayBuffer(44+length*8),view=new DataView(data);
 const text=(offset:number,value:string)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i))};
 text(0,'RIFF');view.setUint32(4,data.byteLength-8,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);
 view.setUint16(20,3,true);view.setUint16(22,2,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*8,true);
 view.setUint16(32,8,true);view.setUint16(34,32,true);text(36,'data');view.setUint32(40,length*8,true);
 for(let i=0;i<length;i++){view.setFloat32(44+i*8,channels[0][i],true);view.setFloat32(48+i*8,channels[1][i],true)}
 return new Uint8Array(data);
}
export const engine=new AudioEngine();
