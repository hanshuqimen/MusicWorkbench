import type {Instrument,NoteEvent} from '../types';
import {labels} from '../types';
import {keyPitch,playableKeys} from './keymap';
export interface SequenceStep {keys:string;start:number;duration:number;pitches:number[]}
export interface Sequence {notes:NoteEvent[];steps:SequenceStep[];duration:number}
export interface SequenceOptions {instrument:Instrument;octave:number;frets:number[];bpm:number;division:number;velocity:number}
export function parseSequence(text:string,options:SequenceOptions):Sequence {
 if(text.length>4000)throw new Error('指令最多 4000 个字符。');
 const {instrument,octave,frets,bpm,division,velocity}=options;
 if(!Number.isFinite(bpm)||bpm<20||bpm>300||![4,8,16].includes(division)||!Number.isInteger(velocity)||velocity<1||velocity>127||octave<1||octave>7)throw new Error('请使用 20–300 BPM、四／八／十六分音符及有效力度。');
 const width=60/bpm*4/division,steps:SequenceStep[]=[],notes:NoteEvent[]=[];
 let index=0;
 while(index<text.length){
  const character=text[index];if(/\s|,/.test(character)){index++;continue}
  const position=index++;let keys=character;
  if(character==='['){const end=text.indexOf(']',index);if(end<0)throw new Error(`第 ${position+1} 个字符的和弦缺少 ]。`);keys=text.slice(index,end);index=end+1;if(!keys.trim())throw new Error('和弦不能为空。');}
  const rest=character==='-'||character==='.';
  const mapped:ReturnType<typeof keyPitch>[]=[],normalized:string[]=[];
  if(!rest)for(const key of keys){
   if(/\s|,/.test(key))continue;
   const match=keyPitch(key,instrument,octave,frets);
   if(!match)throw new Error(`第 ${position+1} 个字符：${labels[instrument]} 无法弹奏 ${key.toUpperCase()}。可用按键：${playableKeys(instrument).join(' ').toUpperCase()}；琴弦需要取消静音。`);
   if(!mapped.some(n=>n?.pitch===match.pitch)){mapped.push(match);normalized.push(key.toUpperCase());}
  }
  if(steps.length>=2000)throw new Error('指令最多 2000 个节拍位置。');
  const start=steps.length*width;
  if(start+width>600.000001)throw new Error('指令超过 10 分钟，请减少字符或提高速度。');
  for(const match of mapped)if(match)notes.push({id:crypto.randomUUID(),...match,start,duration:width*.85,velocity});
  steps.push({keys:rest?'—':normalized.join('+'),start,duration:width,pitches:mapped.flatMap(n=>n?[n.pitch]:[])});
 }
 if(!steps.length||!notes.length)throw new Error('请输入至少一个可弹奏按键，例如 ASDFDGS。');
 return {notes,steps,duration:steps.length*width};
}
