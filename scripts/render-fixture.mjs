import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {SpessaSynthProcessor,SoundBankLoader} from 'spessasynth_core';
const sampleRate=44100,duration=8,frames=sampleRate*duration;
const synth=new SpessaSynthProcessor(sampleRate,{effectsEnabled:false,eventsEnabled:false});
synth.soundBankManager.addSoundBank(SoundBankLoader.fromArrayBuffer(new Uint8Array(readFileSync('vendor/GeneralUser-GS.sf2')).buffer),'generaluser');
const instruments=['piano','guitar','bass','drums'],programs=[0,24,33,0];
const events=[];
for(let ch=0;ch<4;ch++){
 synth.midiChannels[ch].setDrums(ch===3);synth.programChange(ch,programs[ch]);
 synth.controllerChange(ch,91,0);synth.controllerChange(ch,93,0);
 for(let i=0;i<12;i++){
  const start=.2+i*.5,pitches=ch===0?[60,64,67]:ch===1?[72+(i%3)*2]:ch===2?[36+(i%4===2?7:0)]:[i%2===0?36:38,42];
  for(const pitch of pitches){
   events.push({time:start,ch,pitch,on:true},{time:start+(ch===3?.08:.35),ch,pitch,on:false});
  }
 }
}
events.sort((a,b)=>a.time-b.time||(a.on?1:-1));
const outputs=Array.from({length:4},()=>[new Float32Array(frames),new Float32Array(frames)]);
const fx=[new Float32Array(frames),new Float32Array(frames)];
let i=0;
for(let position=0;position<frames;){
 while(events[i]&&events[i].time<=position/sampleRate){const e=events[i++];if(e.on)synth.noteOn(e.ch,e.pitch,85);else synth.noteOff(e.ch,e.pitch);}
 const next=events[i]?Math.ceil(events[i].time*sampleRate):frames;
 const count=Math.max(1,Math.min(128,frames-position,next-position));
 synth.processSplit(outputs,fx[0],fx[1],position,count);position+=count;
}
function wav(channels){
 const data=Buffer.alloc(44+frames*8);
 data.write('RIFF',0);data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);
 data.writeUInt16LE(3,20);data.writeUInt16LE(2,22);data.writeUInt32LE(sampleRate,24);data.writeUInt32LE(sampleRate*8,28);data.writeUInt16LE(8,32);data.writeUInt16LE(32,34);data.write('data',36);data.writeUInt32LE(frames*8,40);
 for(let f=0;f<frames;f++){data.writeFloatLE(channels[0][f],44+f*8);data.writeFloatLE(channels[1][f],48+f*8)}return data;
}
mkdirSync('output/fixtures',{recursive:true});
const mixed=[new Float32Array(frames),new Float32Array(frames)];
for(let ch=0;ch<4;ch++){
 writeFileSync('output/fixtures/'+instruments[ch]+'.wav',wav(outputs[ch]));
 for(let side=0;side<2;side++)for(let f=0;f<frames;f++)mixed[side][f]+=outputs[ch][side][f];
}
writeFileSync('output/fixtures/reference-mix.wav',wav(mixed));
synth.destroySynthProcessor();console.log('真实采样参考分轨已生成：8 秒，钢琴／吉他／贝斯／鼓');
