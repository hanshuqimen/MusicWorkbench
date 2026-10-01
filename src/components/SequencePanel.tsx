import {useMemo,useState} from 'react';
import {Play,Square,ListMusic} from 'lucide-react';
import type {Instrument} from '../types';
import {labels} from '../types';
import {playableKeys} from '../audio/keymap';
import {parseSequence,type Sequence} from '../audio/sequence';
interface Props {instrument:Instrument;octave:number;frets:number[];velocity:number;bpm:number;ready:boolean;running:boolean;position:number;onPlay:(sequence:Sequence,loop:boolean)=>Promise<void>;onStop:()=>void;onInsert:(sequence:Sequence)=>void}
export default function SequencePanel({instrument,octave,frets,velocity,bpm,ready,running,position,onPlay,onStop,onInsert}:Props){
 const [text,setText]=useState('ASDFDGS'),[speed,setSpeed]=useState(bpm),[division,setDivision]=useState(8),[loop,setLoop]=useState(false),[starting,setStarting]=useState(false);
 const parsed=useMemo(()=>{try{return {sequence:parseSequence(text,{instrument,octave,frets,velocity,bpm:speed,division}),error:''}}catch(e){return {sequence:null,error:(e as Error).message}}},[text,instrument,octave,frets,velocity,speed,division]);
 const disabled=!ready||!parsed.sequence||starting;
 return <section className="sequence-panel panel" aria-label="指令自动弹奏">
  <div className="section-heading"><div><h2>指令自动弹奏</h2><span className="muted">输入按键，让 {labels[instrument]} 为你演奏</span></div><ListMusic size={22}/></div>
  <div className="sequence-body"><label htmlFor="sequence-command">演奏指令</label><textarea id="sequence-command" spellCheck={false} maxLength={4000} rows={2} value={text} disabled={running||starting} onChange={e=>setText(e.target.value)} placeholder="ASDFDGS / [AD]F-G" aria-describedby="sequence-help sequence-error"/>
   <p id="sequence-help" className="hint">可用按键 {playableKeys(instrument).join(' ').toUpperCase()}。忽略大小写与空白；- 或 . 停顿一拍，[AD] 同时弹奏。琴弦使用当前按品，键盘使用当前八度。</p>
   <div className="sequence-controls"><label>演奏速度<input aria-label="指令速度 BPM" type="number" min={20} max={300} value={speed} disabled={running||starting} onChange={e=>setSpeed(+e.target.value)}/><span>BPM</span></label><label>每个位置<select aria-label="指令音符时值" value={division} disabled={running||starting} onChange={e=>setDivision(+e.target.value)}><option value={4}>四分音符</option><option value={8}>八分音符</option><option value={16}>十六分音符</option></select></label><label><input type="checkbox" checked={loop} disabled={running||starting} onChange={e=>setLoop(e.target.checked)}/>循环</label></div>
   {parsed.sequence&&<div className="sequence-preview" aria-label="指令音符预览">{parsed.sequence.steps.slice(0,64).map((step,i)=><span key={i} className={running&&position>=step.start&&position<step.start+step.duration?'current':''}>{step.keys}</span>)}{parsed.sequence.steps.length>64&&<span>…</span>}<small>{parsed.sequence.notes.length} 个音符 · {parsed.sequence.duration.toFixed(1)} 秒</small></div>}
   <p id="sequence-error" className={parsed.error?'sequence-error':'hint'} role={parsed.error?'alert':undefined}>{parsed.error||'试听不会修改工程。满意后写入当前音轨，可继续编辑和导出。'}</p>
   <div className="sequence-actions"><button className="primary" disabled={disabled||running} onClick={async()=>{if(!parsed.sequence)return;setStarting(true);try{await onPlay(parsed.sequence,loop)}finally{setStarting(false)}}}><Play size={15}/>{starting?'准备音源…':'自动弹奏'}</button><button disabled={!running&&!starting} onClick={onStop}><Square size={14}/>停止指令</button><button disabled={disabled||running} onClick={()=>parsed.sequence&&onInsert(parsed.sequence)}><ListMusic size={15}/>写入当前音轨</button></div>
  </div>
 </section>
}
