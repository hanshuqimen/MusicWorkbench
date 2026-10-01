import {createSynth,configureChannel} from './core';
import type {Track} from '../types';
import type {SpessaSynthProcessor,MIDIController} from 'spessasynth_core';
declare const sampleRate:number;
declare const currentTime:number;
declare class AudioWorkletProcessor {port:MessagePort;constructor();}
declare function registerProcessor(name:string,processor:typeof AudioWorkletProcessor):void;
interface Event {type:'on'|'off'|'control';channel:number;pitch?:number;velocity?:number;controller?:number;value?:number;time:number;transport:boolean}
class WorkbenchProcessor extends AudioWorkletProcessor {
 synth?:SpessaSynthProcessor;
 events:Event[]=[];
 effects=[new Float32Array(128),new Float32Array(128)];
 constructor(){super();this.port.onmessage=e=>{
  const m=e.data;
  try{
   if(m.type==='init'){this.synth=createSynth(sampleRate,m.banks);this.port.postMessage({ready:true});}
   if(m.type==='config'&&this.synth)m.tracks.forEach((t:Track,i:number)=>configureChannel(this.synth!,i,t,m.offsets[t.soundBank]||0));
   if(m.type==='events'){this.events.push(...m.events);this.events.sort((a,b)=>a.time-b.time);}
   if(m.type==='panic'&&this.synth){this.events=[];this.synth.stopAllChannels(true);for(let i=0;i<16;i++)this.synth.controllerChange(i,64 as MIDIController,0);}
   if(m.type==='stop'&&this.synth){this.events=this.events.filter(e=>!e.transport);this.synth.stopAllChannels(true);}
  }catch(error){this.port.postMessage({error:String(error)});}
 };}
 process(_inputs:Float32Array[][],outputs:Float32Array[][]){
  if(!this.synth)return true;
  const length=outputs[0]?.[0]?.length||128;
  let position=0;
  while(position<length){
   while(this.events[0]&&this.events[0].time<=currentTime+position/sampleRate){
    const e=this.events.shift()!;
    if(e.type==='on')this.synth.noteOn(e.channel,e.pitch!,e.velocity!);
    else if(e.type==='off')this.synth.noteOff(e.channel,e.pitch!);
    else this.synth.controllerChange(e.channel,e.controller as MIDIController,e.value!);
   }
   const next=this.events[0];
   const end=next?Math.max(position+1,Math.min(length,Math.ceil((next.time-currentTime)*sampleRate))):length;
   this.synth.processSplit(outputs,this.effects[0],this.effects[1],position,end-position);
   position=end;
  }
  return true;
 }
}
registerProcessor('music-workbench',WorkbenchProcessor);
