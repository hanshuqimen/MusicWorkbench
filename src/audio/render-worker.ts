import {createSynth,configureChannel} from './core';
import type {Track} from '../types';
import type {MIDIController} from 'spessasynth_core';
self.onmessage=e=>{
 const {track,banks,duration,sampleRate}=e.data as {track:Track;banks:{id:string;data:ArrayBuffer;offset:number}[];duration:number;sampleRate:number};
 try{
  const synth=createSynth(sampleRate,banks);
  configureChannel(synth,0,track,banks.find(b=>b.id===track.soundBank)?.offset||0);
  const events=[
   ...track.notes.flatMap(n=>[{time:n.start,kind:'on',n},{time:n.start+n.duration,kind:'off',n}]),
   ...track.controls.map(c=>({time:c.time,kind:'control',c}))
  ].sort((a,b)=>a.time-b.time||(a.kind==='off'?-1:1));
  const length=Math.ceil(duration*sampleRate);
  const left=new Float32Array(length),right=new Float32Array(length);
  let index=0,position=0,lastProgress=0;
  while(position<length){
   while(events[index]&&events[index].time<=position/sampleRate){
    const event=events[index++];
    if('n' in event)event.kind==='on'?synth.noteOn(0,event.n.pitch,event.n.velocity):synth.noteOff(0,event.n.pitch);
    else synth.controllerChange(0,event.c.controller as MIDIController,event.c.value);
   }
   const until=events[index]?Math.ceil(events[index].time*sampleRate):length;
   const count=Math.max(1,Math.min(128,length-position,until-position));
   synth.process(left,right,position,count);position+=count;
   if(position/length-lastProgress>.05){lastProgress=position/length;self.postMessage({progress:lastProgress});}
  }
  synth.destroySynthProcessor();
  self.postMessage({left,right}, {transfer:[left.buffer,right.buffer]});
 }catch(error){self.postMessage({error:String(error)});}
};
