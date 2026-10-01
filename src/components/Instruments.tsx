import {useEffect,useRef,useState} from 'react';
import {Piano,Guitar,Drum,Minus,Plus} from 'lucide-react';
import type {Instrument} from '../types';
import {labels} from '../types';
import {pitchName} from './Timeline';
export const pianoKeys=['a','w','s','e','d','f','t','g','y','h','u','j','k','o','l','p',';'];
export const drumPitches=[36,38,42,46,41,45,49,51];
export const drumKeys=['a','s','d','f','j','k','l',';'];
const drumLabels=['底鼓','军鼓','闭镲','开镲','低嗵','高嗵','吊镲','叮叮镲'];
export function Icon({instrument,size=19}:{instrument:Instrument;size?:number}){return instrument==='piano'?<Piano size={size}/>:instrument==='drums'?<Drum size={size}/>:<Guitar size={size}/>}
interface Props {instrument:Instrument;onInstrument:(instrument:Instrument)=>void;octave:number;onOctave:(n:number)=>void;velocity:number;onVelocity:(n:number)=>void;sustain:boolean;onSustain:(value:boolean)=>void;held:Set<number>;onOn:(pitch:number,string?:number)=>void;onOff:(pitch:number)=>void;onPluck:(pitch:number,string:number)=>void;ready:boolean;frets:number[];onFrets:(values:number[])=>void}
export default function Instruments({instrument,onInstrument,octave,onOctave,velocity,onVelocity,sustain,onSustain,held,onOn,onOff,onPluck,ready,frets,onFrets}:Props){
 const chordSet=instrument==='bass'?[[0,0,2,2],[3,3,0,0],[5,5,2,2]]:[[0,2,2,0,0,0],[3,2,0,0,0,3],[-1,3,2,0,1,0]];
 const names=instrument==='bass'?['E','G','A']:['Em','G','C'];
 const strings=instrument==='bass'?[28,33,38,43]:[40,45,50,55,59,64];
 const keys=instrument==='bass'?['a','s','d','f']:['a','s','d','f','g','h'];
 const sweeping=useRef(false),lastString=useRef(-1);
 function press(e:React.PointerEvent<HTMLButtonElement>,pitch:number,index?:number){
  if(!ready)return;e.currentTarget.setPointerCapture(e.pointerId);onOn(pitch,index);
 }
 function release(pitch:number){onOff(pitch)}
 function sweepAt(e:React.PointerEvent<HTMLDivElement>){
  if(!sweeping.current||!ready)return;const rect=e.currentTarget.getBoundingClientRect();
  const i=Math.max(0,Math.min(strings.length-1,Math.floor((e.clientY-rect.top)/rect.height*strings.length)));
  if(i!==lastString.current){lastString.current=i;if(frets[i]>=0)onPluck(strings[i]+frets[i],i);}
 }
 return <section className="instrument-panel panel">
  <div className="section-heading"><div><span className="eyebrow">PLAY AN IDEA</span><h2>让灵感先发声</h2></div><span className="badge">{ready?'采样音源已就绪':'等待音源初始化'}</span></div>
  <div className="instrument-controls"><div className="instrument-tabs">{(['piano','guitar','bass','drums'] as Instrument[]).map(i=><button key={i} className={i===instrument?'active':''} onClick={()=>onInstrument(i)}><Icon instrument={i}/>{labels[i]}</button>)}</div>
   <label className="inline">力度 <input type="range" min={1} max={127} value={velocity} onChange={e=>onVelocity(+e.target.value)}/><span>{velocity}</span></label></div>
  {instrument==='piano'?<>
   <div className="piano-controls"><div className="inline"><button className="icon-button" aria-label="降低八度" onClick={()=>onOctave(Math.max(1,octave-1))}><Minus size={14}/></button><span>C{octave} — E{octave+1}</span><button className="icon-button" aria-label="升高八度" onClick={()=>onOctave(Math.min(7,octave+1))}><Plus size={14}/></button></div><button className={sustain?'active':''} onClick={()=>onSustain(!sustain)}>延音 {sustain?'开':'关'} <kbd>Shift</kbd></button></div>
   <div className="piano-keyboard">{pianoKeys.map((key,index)=>{
    const pitch=(octave+1)*12+index,black=[1,3,6,8,10].includes(pitch%12);
    const whiteBefore=Array.from({length:index},(_,i)=>(octave+1)*12+i).filter(p=>![1,3,6,8,10].includes(p%12)).length;
    return <button key={pitch} disabled={!ready} aria-label={pitchName(pitch)+' 键盘 '+key} className={'piano-key '+(black?'black':'white')+(held.has(pitch)?' pressed':'')} style={black?{left:`calc(${whiteBefore} * 9.09% - 2.7%)`}:undefined} onPointerDown={e=>press(e,pitch)} onPointerUp={()=>release(pitch)} onPointerCancel={()=>release(pitch)} onLostPointerCapture={()=>release(pitch)}>
     {!black&&<span className="note-label">{pitch%12===0?pitchName(pitch):''}</span>}<kbd>{key.toUpperCase()}</kbd></button>
   })}</div>
  </>:instrument==='drums'?<div className="drum-grid">{drumPitches.map((pitch,i)=><button key={pitch} disabled={!ready} className={'drum-pad'+(held.has(pitch)?' pressed':'')} onPointerDown={e=>press(e,pitch)} onPointerUp={()=>release(pitch)} onPointerCancel={()=>release(pitch)}><span className="pad-mark">{String(i+1).padStart(2,'0')}</span><strong>{drumLabels[i]}</strong><kbd>{drumKeys[i].toUpperCase()}</kbd></button>)}</div>:<>
   <div className="piano-controls"><div className="inline"><span className="muted">快捷和弦</span>{names.map((name,i)=><button key={name} onClick={()=>onFrets(chordSet[i])}>{name}</button>)}</div><span className="hint">点击按品 · 在右侧跨弦拖动扫弦</span></div>
   <div className="string-instrument"><div className="fretboard">{strings.map((open,i)=><div className="string-row" key={i}><span>{pitchName(open)}</span>{Array.from({length:8},(_,fret)=><button key={fret} aria-label={`第 ${i+1} 弦第 ${fret} 品`} className={frets[i]===fret?'fretted':''} onClick={()=>{const next=[...frets];next[i]=fret;onFrets(next)}}><span className="string-line"/>{frets[i]===fret&&<i/>}{i===strings.length-1&&<small>{fret}</small>}</button>)}</div>)}</div>
    <div className="pluck-zone" onPointerDown={e=>{sweeping.current=true;lastString.current=-1;e.currentTarget.setPointerCapture(e.pointerId);sweepAt(e)}} onPointerMove={sweepAt} onPointerUp={()=>{sweeping.current=false}} onPointerCancel={()=>{sweeping.current=false}} onLostPointerCapture={()=>{sweeping.current=false}}>
     {strings.map((open,i)=>{const pitch=open+Math.max(0,frets[i]);return <button key={i} aria-label={`拨动第 ${i+1} 弦`} disabled={!ready||frets[i]<0} className={held.has(pitch)?'pressed':''}><span className="string-line"/><kbd>{keys[i].toUpperCase()}</kbd></button>})}
    </div></div>
  </>}
  <p className="hint instrument-hint">鼠标与电脑键盘均可演奏。切换乐器会释放音符；在创作模式中按下录制，即可留下可编辑的演奏。</p>
 </section>
}
