import {useEffect,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,ZoomIn,ZoomOut,Plus,Trash2,Copy,Grid3X3} from 'lucide-react';
import type {Project,Track,NoteEvent} from '../types';
import {formatTime} from '../types';
interface Props {project:Project;active:string;time:number;onSeek:(time:number)=>void;onActive:(id:string)=>void;onNotes:(notes:NoteEvent[])=>void;onMode:(mode:'audio'|'notes')=>void}
export default function Timeline({project,active,time,onSeek,onActive,onNotes,onMode}:Props){
 const track=project.tracks.find(t=>t.id===active);
 const [tab,setTab]=useState<'tracks'|'notes'>('tracks'),[span,setSpan]=useState(16),[start,setStart]=useState(0),[low,setLow]=useState(48);
 const [selected,setSelected]=useState<string|null>(null),[peaks,setPeaks]=useState<Record<string,number[]>>({});
 const canvas=useRef<HTMLCanvasElement>(null),drag=useRef<{note:NoteEvent;original:NoteEvent;x:number;y:number;resize:boolean}|null>(null);
 const [width,setWidth]=useState(800),[revision,setRevision]=useState(0);
 const notes=track?.notes||[];
 const height=tab==='tracks'?Math.max(130,project.tracks.length*62+26):326;
 const shown=Math.min(Math.max(project.duration,2),span),px=(width-46)/shown;
 const note=notes.find(n=>n.id===selected);
 const pitchLow=track?.instrument==='drums'?30:low;
 useEffect(()=>{setPeaks({});setStart(0);setSelected(null)},[project.id]);
 useEffect(()=>{const element=canvas.current?.parentElement;if(!element)return;const observer=new ResizeObserver(([e])=>setWidth(e.contentRect.width));observer.observe(element);return()=>observer.disconnect()},[]);
 useEffect(()=>{let cancelled=false;for(const t of project.tracks)if(t.asset&&!peaks[t.asset])
  window.workbench.api<number[]>('/peaks/'+project.id+'/'+t.asset).then(data=>{if(!cancelled)setPeaks(p=>({...p,[t.asset!]:data}))}).catch(()=>{});
  return()=>{cancelled=true};
 },[project.id,project.tracks.map(t=>t.asset).join(',')]);
 useEffect(()=>{
  const element=canvas.current;if(!element)return;const dpr=devicePixelRatio||1;
  element.width=Math.round(width*dpr);element.height=height*dpr;const c=element.getContext('2d')!;c.scale(dpr,dpr);
  c.fillStyle='#121a24';c.fillRect(0,0,width,height);c.font='11px Segoe UI';c.textBaseline='middle';
  const beat=60/project.bpm;
  const step=shown>80?10:shown>30?4:beat;
  for(let t=Math.ceil(start/step)*step;t<=start+shown;t+=step){
   const x=46+(t-start)*px;c.strokeStyle=Math.round(t/beat)%4===0?'#334151':'#253140';c.lineWidth=1;c.beginPath();c.moveTo(x,25);c.lineTo(x,height);c.stroke();
   c.fillStyle='#8393a8';c.fillText(t.toFixed(shown>30?0:1)+'s',x+4,12);
  }
  if(tab==='tracks'){
   project.tracks.forEach((t,i)=>{
    const y=26+i*62;c.fillStyle=t.id===active?'#1c2c39':'#161f2a';c.fillRect(0,y,width,60);
    c.fillStyle=t.color;c.fillRect(0,y+7,3,45);
    const values=t.asset?peaks[t.asset]:null;
    if(t.mode==='audio'&&values){
     c.fillStyle=t.color;c.globalAlpha=t.mute?.25:.8;
     for(let x=0;x<width-46;x+=2){
      const seconds=start+x/px;const v=values[Math.floor(seconds/project.duration*values.length)]||0;const amp=Math.min(22,v*28);
      c.fillRect(x+46,y+30-amp,1,amp*2);
     }c.globalAlpha=1;
    }else{
     c.fillStyle=t.color;for(const n of t.notes){if(n.start+n.duration<start||n.start>start+shown)continue;
      c.fillRect(46+(n.start-start)*px,y+9+(84-n.pitch)*.5,Math.max(3,n.duration*px),4);
     }
    }c.fillStyle='#687a91';c.fillText(String(i+1).padStart(2,'0'),12,y+29);
   });
  }else{
   for(let row=0;row<24;row++){
    const pitch=pitchLow+23-row,y=26+row*12.5;
    c.fillStyle=[1,3,6,8,10].includes(pitch%12)?'#151d28':'#1a2431';c.fillRect(0,y,width,12.5);
    c.fillStyle='#8d9caf';c.fillText(pitchName(pitch),3,y+6);c.strokeStyle='#26313f';c.beginPath();c.moveTo(46,y);c.lineTo(width,y);c.stroke();
   }
   for(const original of notes){
    const n=drag.current?.note.id===original.id?drag.current.note:original;
    if(n.pitch<pitchLow||n.pitch>=pitchLow+24||n.start+n.duration<start||n.start>start+shown)continue;
    const x=46+(n.start-start)*px,y=26+(pitchLow+23-n.pitch)*12.5;
    c.fillStyle=n.id===selected?'#e4f9f3':track?.color||'#72d7c2';c.globalAlpha=.4+n.velocity/127*.6;
    c.fillRect(x,y+1,Math.max(8,n.duration*px),10.5);c.globalAlpha=1;
    if(n.id===selected){c.strokeStyle='#72d7c2';c.strokeRect(x,y+1,Math.max(8,n.duration*px),10.5);}
   }
  }
  if(time>=start&&time<=start+shown){
   const x=46+(time-start)*px;c.strokeStyle='#72d7c2';c.lineWidth=1.5;c.beginPath();c.moveTo(x,0);c.lineTo(x,height);c.stroke();
   c.fillStyle='#72d7c2';c.beginPath();c.moveTo(x-4,0);c.lineTo(x+4,0);c.lineTo(x,6);c.fill();
  }
 },[project,active,time,width,height,span,start,low,peaks,tab,selected,revision]);
 function coords(e:{clientX:number;clientY:number}){const rect=canvas.current!.getBoundingClientRect();return{x:e.clientX-rect.left,y:e.clientY-rect.top}}
 function hit(x:number,y:number){return notes.findLast(n=>n.pitch===pitchLow+23-Math.floor((y-26)/12.5)&&x>=46+(n.start-start)*px&&x<=46+(n.start-start)*px+Math.max(8,n.duration*px))}
 function pointerDown(e:React.PointerEvent<HTMLCanvasElement>){
  const {x,y}=coords(e);if(y<26){onSeek(Math.max(0,Math.min(project.duration,start+(x-46)/px)));return}
  if(tab==='tracks'){const t=project.tracks[Math.floor((y-26)/62)];if(t)onActive(t.id);onSeek(Math.max(0,Math.min(project.duration,start+(x-46)/px)));return}
  const n=hit(x,y);setSelected(n?.id||null);
  if(n){drag.current={note:{...n},original:n,x,y,resize:x>46+(n.start-start+n.duration)*px-6};e.currentTarget.setPointerCapture(e.pointerId);}
 }
 function move(e:React.PointerEvent<HTMLCanvasElement>){
  const d=drag.current;if(!d)return;const {x,y}=coords(e);
  const shift=(x-d.x)/px;
  d.note=d.resize?{...d.original,duration:Math.max(.03,Math.min(project.duration-d.original.start,d.original.duration+shift))}
   :{...d.original,start:Math.max(0,Math.min(project.duration-d.original.duration,d.original.start+shift)),pitch:Math.max(0,Math.min(127,d.original.pitch-Math.round((y-d.y)/12.5)))};
  setRevision(r=>r+1);
 }
 function commit(){const d=drag.current;if(d){onNotes(notes.map(n=>n.id===d.note.id?d.note:n));drag.current=null;setRevision(r=>r+1)}}
 function addNote(e?:React.MouseEvent<HTMLCanvasElement>){
  if(!track)return;let onset=time,pitch=60;
  if(e){const p=coords(e);onset=Math.max(0,start+(p.x-46)/px);pitch=pitchLow+23-Math.floor((p.y-26)/12.5)}
  onset=Math.max(0,Math.min(Math.max(0,project.duration-.04),onset));
  const n={id:crypto.randomUUID(),pitch:Math.max(0,Math.min(127,pitch)),start:onset,duration:Math.max(.01,Math.min(60/project.bpm*.5,project.duration-onset)),velocity:90};
  onNotes([...notes,n]);setSelected(n.id);
 }
 function update(values:Partial<NoteEvent>){if(note)onNotes(notes.map(n=>n.id===note.id?{...n,...values}:n))}
 function remove(){onNotes(notes.filter(n=>n.id!==selected));setSelected(null)}
 function duplicate(){if(note){const n={...note,id:crypto.randomUUID(),start:Math.min(project.duration-note.duration,note.start+60/project.bpm)};onNotes([...notes,n]);setSelected(n.id)}}
 function keyboard(e:React.KeyboardEvent){
  if(!note)return;const step=60/project.bpm/4;
  if(e.key==='Delete'){e.preventDefault();remove()}
  if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();update({pitch:Math.max(0,Math.min(127,note.pitch+(e.key==='ArrowUp'?1:-1)))})}
  if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();update({start:Math.max(0,Math.min(project.duration-note.duration,note.start+(e.key==='ArrowRight'?step:-step)))})}
  if(e.ctrlKey&&e.key.toLowerCase()==='d'){e.preventDefault();duplicate()}
 }
 return <section className="timeline panel">
  <div className="section-heading"><div className="segmented"><button className={tab==='tracks'?'active':''} onClick={()=>setTab('tracks')}>音轨时间线</button><button className={tab==='notes'?'active':''} onClick={()=>setTab('notes')}>钢琴卷帘</button></div>
   <div className="inline"><span className="muted">{track?.name||'选择音轨'}</span><button className="icon-button" title="缩小" onClick={()=>setSpan(Math.min(600,span*2))}><ZoomOut size={16}/></button><button className="icon-button" title="放大" onClick={()=>setSpan(Math.max(2,span/2))}><ZoomIn size={16}/></button></div></div>
  <div className="canvas-scroll"><canvas ref={canvas} style={{width:'100%',height}} tabIndex={0} aria-label="时间线；选中音符后可用方向键编辑，Delete 删除" onPointerDown={pointerDown} onPointerMove={move} onPointerUp={commit} onDoubleClick={e=>tab==='notes'&&addNote(e)} onKeyDown={keyboard}/></div>
  <div className="timeline-navigation"><span>{formatTime(start)}</span><input aria-label="时间线水平滚动" type="range" min={0} max={Math.max(0,project.duration-shown)} step={.1} value={start} onChange={e=>setStart(+e.target.value)}/><span>{formatTime(Math.min(project.duration,start+shown))}</span></div>
  {tab==='notes'&&<><div className="roll-toolbar"><button onClick={()=>addNote()} disabled={!track}><Plus size={14}/>音符</button><button onClick={duplicate} disabled={!note}><Copy size={14}/>复制</button><button onClick={remove} disabled={!note}><Trash2 size={14}/>删除</button><button disabled={!notes.length} onClick={()=>{const step=60/project.bpm/4;onNotes(notes.map(n=>({...n,start:Math.min(project.duration-n.duration,Math.round(n.start/step)*step)})))}}><Grid3X3 size={14}/>量化 1/16</button>
   {track?.mode==='audio'&&!!notes.length&&<button onClick={()=>onMode('notes')}>切换为音符重放</button>}
   <label className="inline">音区 <input className="short" type="number" min={0} max={103} value={low} onChange={e=>setLow(Math.max(0,Math.min(103,+e.target.value)))}/></label></div>
   {note?<div className="note-inspector"><label>音高 <input type="number" min={0} max={127} value={note.pitch} onChange={e=>update({pitch:Math.max(0,Math.min(127,+e.target.value))})}/></label><label>起点（秒） <input type="number" min={0} max={project.duration-note.duration} step={.01} value={+note.start.toFixed(3)} onChange={e=>update({start:Math.max(0,Math.min(project.duration-note.duration,+e.target.value))})}/></label><label>时长（秒） <input type="number" min={.03} max={project.duration-note.start} step={.01} value={+note.duration.toFixed(3)} onChange={e=>update({duration:Math.max(.03,Math.min(project.duration-note.start,+e.target.value))})}/></label><label>力度 <input type="number" min={1} max={127} value={note.velocity} onChange={e=>update({velocity:Math.max(1,Math.min(127,+e.target.value))})}/></label></div>:<p className="hint">双击新增音符 · 拖动移动 · 拖动右边缘调整时长 · 方向键微调 · 原录制不会自动量化</p>}</>}
 </section>
}
export function pitchName(pitch:number){return ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][pitch%12]+(Math.floor(pitch/12)-1)}
