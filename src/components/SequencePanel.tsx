import {useMemo,useState} from 'react';
import {Play,Square,ListMusic} from 'lucide-react';
import type {Instrument,SequenceInput} from '../types';
import {labels} from '../types';
import {playableKeys} from '../audio/keymap';
import {parseSequence,type Sequence} from '../audio/sequence';
interface Props {instrument:Instrument;octave:number;frets:number[];velocity:number;input:SequenceInput;ready:boolean;editable:boolean;running:boolean;position:number;onChange:(input:SequenceInput)=>void;onPlay:(sequence:Sequence,loop:boolean)=>Promise<void>;onStop:()=>void}
export default function SequencePanel({instrument,octave,frets,velocity,input,ready,editable,running,position,onChange,onPlay,onStop}:Props){
 const {text,bpm:speed,division,loop}=input;
 const [starting,setStarting]=useState(false);
 const parsed=useMemo(()=>{try{const sequence=parseSequence(text,{instrument,octave,frets,velocity,bpm:speed,division});if(input.start+sequence.duration>600)throw new Error('当前光标与指令长度合计超过 10 分钟，请移回起点。');return {sequence,error:''}}catch(e){return {sequence:null,error:(e as Error).message}}},[text,instrument,octave,frets,velocity,speed,division,input.start]);
 const disabled=!ready||!parsed.sequence||starting;
 return <section className="sequence-panel panel" aria-label="指令自动弹奏">
  <div className="section-heading"><div><h2>指令自动弹奏</h2><span className="muted">输入按键，让 {labels[instrument]} 为你演奏</span></div><ListMusic size={22}/></div>
  <div className="sequence-body"><label htmlFor="sequence-command">演奏指令 · 自动保存到当前音轨</label><textarea id="sequence-command" aria-label="演奏指令" spellCheck={false} maxLength={4000} rows={2} value={text} disabled={!editable||running||starting} onChange={e=>onChange({...input,text:e.target.value})} placeholder="输入 WASD / ASDFDGS / [AD]F-G" aria-describedby="sequence-help sequence-error"/>
   <p id="sequence-help" className="hint">可用按键 {playableKeys(instrument).join(' ').toUpperCase()}。忽略大小写与空白；- 或 . 停顿一拍，[AD] 同时弹奏。琴弦使用当前按品，键盘使用当前八度。</p>
   <div className="sequence-controls"><label>演奏速度<input aria-label="指令速度 BPM" type="number" min={20} max={300} value={speed} disabled={!editable||running||starting} onChange={e=>onChange({...input,bpm:Math.max(0,Math.min(1000,+e.target.value))})}/><span>BPM</span></label><label>每个位置<select aria-label="指令音符时值" value={division} disabled={!editable||running||starting} onChange={e=>onChange({...input,division:+e.target.value as 4|8|16})}><option value={4}>四分音符</option><option value={8}>八分音符</option><option value={16}>十六分音符</option></select></label><label><input type="checkbox" checked={loop} disabled={!editable||running||starting} onChange={e=>onChange({...input,loop:e.target.checked})}/>循环</label></div>
   {parsed.sequence&&<div className="sequence-preview" aria-label="指令音符预览">{parsed.sequence.steps.slice(0,64).map((step,i)=><span key={i} className={running&&position>=step.start&&position<step.start+step.duration?'current':''}>{step.keys}</span>)}{parsed.sequence.steps.length>64&&<span>…</span>}<small>{parsed.sequence.notes.length} 个音符 · {parsed.sequence.duration.toFixed(1)} 秒</small></div>}
   <p id="sequence-error" className={text.trim()&&parsed.error?'sequence-error':'hint'} role={text.trim()&&parsed.error?'alert':undefined}>{text.trim()?parsed.error||'已自动生成旋律音轨，可循环播放、编辑音符或选择风格。修改指令更新这一段，不会重复追加。':'输入有效按键后自动显示在上方音轨；每条音轨独立保留指令与演奏设置。'}</p>
   <div className="sequence-actions"><button className="primary" disabled={disabled||running} onClick={async()=>{if(!parsed.sequence)return;setStarting(true);try{await onPlay(parsed.sequence,loop)}finally{setStarting(false)}}}><Play size={15}/>{starting?'准备音源…':'自动弹奏'}</button><button disabled={!running&&!starting} onClick={onStop}><Square size={14}/>停止指令</button></div>
  </div>
 </section>
}
