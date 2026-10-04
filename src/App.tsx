import {useEffect,useRef,useState} from 'react';
import {AudioLines,ArrowUpRight,Upload,FolderOpen,Save,Download,Settings2,Plus,Play,Pause,Square,RotateCcw,Undo2,Redo2,Check,LoaderCircle,X,RefreshCw,Headphones,Music2,Mic,Repeat2,Volume2,ChevronDown,ChevronRight,SlidersHorizontal,Trash2,BookOpen} from 'lucide-react';
import type {Project,Track,Instrument,JobStatus,StylePreset,Health,Asset,NoteEvent,ControlEvent,Font,SequenceInput,PerformanceSettings} from './types';
import {newTrack,labels,formatTime,isKeyboardInstrument,playableInstruments,defaultPerformance} from './types';
import {engine} from './audio/engine';
import Timeline from './components/Timeline';
import Instruments,{Icon} from './components/Instruments';
import EffectsPanel from './components/EffectsPanel';
import SequencePanel from './components/SequencePanel';
import UserGuide from './components/UserGuide';
import {keyPitch} from './audio/keymap';
import type {Sequence} from './audio/sequence';
import {emptySequence,replaceSequence,appendNote,mergeProcessedProject} from './state/creation';

interface Press {trackId:string;pitch:number;start:number;velocity:number;string?:number;noteId?:string;captureClock?:number}
interface Recording {trackId:string;clock:number;offset:number;notes:NoteEvent[];controls:ControlEvent[]}
export default function App(){
 const [project,setProject]=useState<Project|null>(null),projectRef=useRef<Project|null>(null);
 const [active,setActive]=useState(''),[mode,setMode]=useState<'arrange'|'create'>('arrange');
 const [health,setHealth]=useState<Health|null>(null),[presets,setPresets]=useState<StylePreset[]>([]),[fonts,setFonts]=useState<Font[]>([]);
 const [preset,setPreset]=useState<StylePreset|null>(null),[strength,setStrength]=useState(.5),[seed,setSeed]=useState(42);
 const [job,setJob]=useState<JobStatus|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [settings,setSettings]=useState(false),[device,setDevice]=useState('自动 GPU / CPU'),[model,setModel]=useState('htdemucs_6s');
 const [guide,setGuide]=useState(false),[tour,setTour]=useState<number|null>(null),[welcome,setWelcome]=useState(()=>localStorage.getItem('workbench-guide-seen')!=='1');
 const [sequencePlaying,setSequencePlaying]=useState(false),[sequencePosition,setSequencePosition]=useState(0),[uninstalling,setUninstalling]=useState(false);
 const sequenceRun=useRef<{trackId:string;sequence:Sequence;loop:boolean}|null>(null),sequenceToken=useRef(0);
 const sustainKey=useRef(false);
 const [autoCapture,setAutoCapture]=useState(()=>localStorage.getItem('workbench-auto-capture')!=='0');
 const autoTake=useRef<{trackId:string;clock:number;offset:number}|null>(null),lastTrack=useRef(new Map<Instrument,string>()),activeRef=useRef('');
 const jobInput=useRef<{id:string;base:Project;ids:string[]}|null>(null);
 const [execution,setExecution]=useState<'auto'|'cpu'>(()=>localStorage.getItem('workbench-device')==='cpu'?'cpu':'auto');
 const [instrument,setInstrument]=useState<Instrument>('piano'),[octave,setOctave]=useState(4),[velocity,setVelocity]=useState(90),[sustain,setSustain]=useState(false),[held,setHeld]=useState(new Set<number>());
 const [frets,setFrets]=useState([0,2,2,0,0,0]),[playing,setPlaying]=useState(false),[position,setPosition]=useState(0),[loop,setLoop]=useState(false),[metronome,setMetronome]=useState(false);
 const [recording,setRecording]=useState(false),[count,setCount]=useState(0),[preview,setPreview]=useState<Project|null>(null);
 const [range,setRange]=useState({start:0,end:20}),[exportOpen,setExportOpen]=useState(false),[exporting,setExporting]=useState(false),[exportProgress,setExportProgress]=useState(0),[exportLabel,setExportLabel]=useState('');
 const undo=useRef<Project[]>([]),redo=useRef<Project[]>([]),[historyRevision,setHistoryRevision]=useState(0);
 const pressed=useRef(new Map<number,Press>()),record=useRef<Recording|null>(null),countTimers=useRef<ReturnType<typeof setTimeout>[]>([]),mounted=useRef(true),initialized=useRef(false),keyMap=useRef(new Map<string,number>());
 const busy=!!job&&['running','queued'].includes(job.state),assetsReady=health?.assets.find(a=>a.id==='generaluser')?.ready||false;
 const activeTrack=project?.tracks.find(t=>t.id===active),selected=project?.tracks.filter(t=>t.selected)||[];
 const sequenceInput=activeTrack?.sequence||emptySequence(project?.bpm||120,position);
 const fail=(e:unknown)=>setError(e instanceof Error?e.message:String(e));
 function assign(value:Project,reset=false){
  const run=sequenceRun.current,previous=projectRef.current;
  if(run&&previous){const signature=(p:Project)=>p.tracks.map(t=>[t.id,t.soundBank,t.program,t.mode].join(':')).join('|');if(signature(value)!==signature(previous))stopSequence()}
  projectRef.current=value;setProject(value);if(reset){stopSequence();undo.current=[];redo.current=[];setHistoryRevision(r=>r+1);setPreview(null);setPosition(0);engine.stop();engine.clearCache();setPlaying(false);}
 }
 function change(fn:(p:Project)=>Project,remember=false){
  const p=projectRef.current;if(!p)return;
  if(remember){undo.current=[...undo.current.slice(-24),p];redo.current=[];setHistoryRevision(r=>r+1);}
  assign(fn(p));if(remember)setPreview(null);
 }
 function updateTrack(id:string,values:Partial<Track>,remember=false){change(p=>({...p,tracks:p.tracks.map(t=>t.id===id?{...t,...values}:t)}),remember);}
 async function refreshHealth(){const h=await window.workbench.api<Health>('/health');setHealth(h);return h}
 async function boot(){
  try{
   const [h,styles,fontList]=await Promise.all([refreshHealth(),window.workbench.api<StylePreset[]>('/presets'),window.workbench.api<Font[]>('/fonts')]);
   setPresets(styles);setPreset(styles[0]);setFonts(fontList);
   let p=await window.workbench.api<Project|null>('/projects/recovery');
   if(p){setNotice('已恢复上次未关闭的工程。');}
   else{p=await window.workbench.api<Project>('/projects/new',{},'POST');p.tracks=[newTrack('piano')];await window.workbench.api('/projects/'+p.id,p,'PUT');}
   assign(p,true);activateTrack(p.tracks[0]?.id||'',!p.original,styles);setMode(p.original?'arrange':'create');setRange({start:0,end:Math.min(20,p.duration)});
   if(!h.assets.filter(a=>execution!=='cpu'||!a.id.startsWith('cuda-')).every(a=>a.ready)&&!initialized.current){initialized.current=true;const j=await window.workbench.api<JobStatus>('/jobs',{kind:'initialize',device:execution},'POST');setJob(j);}
   else if(!initialized.current){initialized.current=true;setJob(await window.workbench.api<JobStatus>('/jobs',{kind:'selftest',device:execution},'POST'));}
  }catch(e){fail(e)}
 }
 useEffect(()=>{mounted.current=true;void boot();const unsubscribe=window.workbench.onBackendExit(()=>{setError('本地后端已退出，请在设置中点击重新启动。');setHealth(null);});
  return()=>{mounted.current=false;unsubscribe();engine.stop();countTimers.current.forEach(clearTimeout)}},[]);
 useEffect(()=>{
  if(!project)return;const timer=setTimeout(()=>window.workbench.api('/projects/'+project.id,project,'PUT').catch(fail),600);
  return()=>clearTimeout(timer);
 },[project]);
 useEffect(()=>{if(project&&engine.context)engine.sync(project.tracks).catch(fail)},[project?.tracks]);
 useEffect(()=>{
  if(!job||!['running','queued'].includes(job.state))return;let cancelled=false,inFlight=false;
  const poll=async()=>{if(inFlight||cancelled)return;inFlight=true;
   try{const value=await window.workbench.api<JobStatus>('/jobs/'+job.id);if(cancelled)return;setJob(value);
    if(value.device)setDevice(value.device==='cuda'?'NVIDIA GPU':'CPU');
    if(value.state==='failed')setError(value.error||'处理失败，请重试。');
    if(value.state==='succeeded'){
     const result=value.result;
     if(result?.detail)setDevice(result.detail);
     if(result?.project&&projectRef.current?.id===result.project.id){
      const processed=result.project;
      if(result.preview){const input=jobInput.current;setPreview(input?.id===value.id?mergeProcessedProject(projectRef.current,processed,input.base,input.ids):processed);setNotice('预览已生成，点击试听预览；完整应用请点击生成全曲。');}
      else{
       change(current=>{
        if(value.kind==='separate'){
         const creations=current.tracks.filter(t=>!t.estimated&&t.mode==='notes'&&t.notes.length);
         return {...processed,tracks:[...processed.tracks,...creations].slice(0,16)};
        }
        const input=jobInput.current;
        return input?.id===value.id?mergeProcessedProject(current,processed,input.base,input.ids):current;
       },true);
       if(value.kind==='separate')activateTrack(processed.tracks.find(t=>t.instrument==='piano')?.id||processed.tracks[0]?.id||'',false);
       setPreview(null);setNotice(value.kind==='transcribe'?'转谱完成，可在钢琴卷帘中修正音符。':'处理完成，可以试听、编辑或导出。');
      }
     }await refreshHealth();
     if(value.kind==='initialize')setJob(await window.workbench.api<JobStatus>('/jobs',{kind:'selftest',device:execution},'POST'));
    }else if(value.kind==='initialize')await refreshHealth();
   }catch(e){fail(e)}finally{inFlight=false}
  };const timer=setInterval(poll,600);void poll();return()=>{cancelled=true;clearInterval(timer)};
 },[job?.id,job?.state]);
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),6000);return()=>clearTimeout(timer)},[notice]);
 useEffect(()=>{
  const timer=setInterval(()=>{if(engine.playing){if(sequenceRun.current){const pos=engine.position();setSequencePosition(pos);setHeld(new Set(sequenceRun.current.sequence.notes.filter(n=>n.start<=pos&&n.start+n.duration>pos).map(n=>n.pitch)))}else setPosition(engine.position());}},40);return()=>clearInterval(timer);
 },[]);
 useEffect(()=>{engine.onEnded=()=>{const run=sequenceRun.current;if(run){if(run.loop){setSequencePosition(0);engine.playNotes(run.trackId,run.sequence.notes,run.sequence.duration)}else{sequenceRun.current=null;setSequencePlaying(false);setHeld(new Set());setNotice('指令演奏完成，旋律已在音轨中，可继续编辑或编配。')}return}setPlaying(false);if(record.current)stopRecording();else if(loop&&projectRef.current)void playProject(projectRef.current,0)}},[loop]);
 function stopSequence(){sequenceToken.current++;if(sequenceRun.current){sequenceRun.current=null;engine.stop();setHeld(new Set())}setSequencePlaying(false);setSequencePosition(0)}
 function releaseAll(){
  for(const entry of pressed.current.values())finishPress(entry);
  const take=autoTake.current;
  if(take&&(sustain||sustainKey.current)){const time=Math.min(600,take.offset+performance.now()/1000-take.clock);change(p=>({...p,tracks:p.tracks.map(t=>t.id===take.trackId?{...t,controls:[...t.controls,{time,controller:64,value:0}]}:t)}));}
  pressed.current.clear();keyMap.current.clear();autoTake.current=null;sustainKey.current=false;setHeld(new Set());engine.panic();setSustain(false);
 }
 function finishPress(entry:Press){
  engine.noteOff(entry.trackId,entry.pitch);
  if(entry.noteId)change(p=>{
   const elapsed=performance.now()/1000-entry.captureClock!;
   const tracks=p.tracks.map(t=>t.id===entry.trackId?{...t,notes:t.notes.map(n=>n.id===entry.noteId?{...n,duration:Math.max(.01,Math.min(600-n.start,elapsed))}:n),sourceNotes:[]}:t);
   return {...p,tracks,duration:Math.min(600,Math.max(p.duration,...tracks.flatMap(t=>t.notes.map(n=>n.start+n.duration))))};
  });
  const rec=record.current;
  if(rec&&entry.trackId===rec.trackId&&entry.start>=rec.clock){
   const start=rec.offset+entry.start-rec.clock;
   const end=Math.min(600,rec.offset+engine.now()-rec.clock);
   if(end>start)rec.notes.push({id:crypto.randomUUID(),pitch:entry.pitch,start,duration:Math.max(.01,end-start),velocity:entry.velocity,string:entry.string});
  }
 }
 function stopRecording(){
  countTimers.current.forEach(clearTimeout);countTimers.current=[];setCount(0);
  releaseAll();const rec=record.current;record.current=null;setRecording(false);
  if(rec)rec.controls.push({time:Math.max(0,Math.min(600,rec.offset+engine.now()-rec.clock)),controller:64,value:0});
  if(rec)change(p=>({...p,duration:Math.min(600,Math.max(p.duration,...rec.notes.map(n=>n.start+n.duration))),
   tracks:p.tracks.map(t=>t.id===rec.trackId?{...t,notes:[...t.notes,...rec.notes],sourceNotes:[],controls:[...t.controls,...rec.controls]}:t)}),true);
 }
 function stop(){stopSequence();stopRecording();engine.stop();setPlaying(false);setPosition(0)}
 function activateTrack(id:string,creating=mode==='create',styles=presets){
  stopSequence();if(record.current||countTimers.current.length)stopRecording();else releaseAll();
  const track=projectRef.current?.tracks.find(t=>t.id===id);activeRef.current=id;setActive(id);
  if(!track)return;
  if(playableInstruments.includes(track.instrument)){
   lastTrack.current.set(track.instrument,id);setInstrument(track.instrument);
   const value=track.performance||defaultPerformance(track.instrument);
   setOctave(value.octave);setVelocity(value.velocity);setFrets(value.frets);
  }
  const settings=track.arrangement;
  setPreset(settings?.preset||styles.find(p=>p.id===track.style)||styles[0]||null);setStrength(settings?.strength??.5);setSeed(settings?.seed??42);
  if(creating&&track.mode==='notes')change(p=>({...p,tracks:p.tracks.map(t=>({...t,selected:t.id===id}))}));
 }
 function chooseInstrument(value:Instrument){
  stopSequence();releaseAll();if(record.current)stopRecording();
  const p=projectRef.current;if(!p)return;
  const existing=p.tracks.find(t=>t.id===lastTrack.current.get(value)&&t.mode==='notes')||p.tracks.find(t=>t.mode==='notes'&&t.instrument===value&&!t.estimated);
  if(existing)activateTrack(existing.id,true);
  else{
   if(p.tracks.length>=16){setError('首版最多支持 16 条音轨，请先删除一条。');return}
   const track=newTrack(value);change(p=>({...p,tracks:[...p.tracks,track]}),true);activateTrack(track.id,true);
  }
  setMode('create');
 }
 function practiceTrack(){
  const p=projectRef.current;if(!p)return;
  const current=p.tracks.find(t=>t.id===activeRef.current);
  if(current?.mode==='notes'&&current.instrument===instrument)return current;
  const existing=p.tracks.find(t=>t.mode==='notes'&&t.instrument===instrument&&!t.estimated);
  if(existing){activateTrack(existing.id,true);return existing}
  if(p.tracks.length>=16)throw new Error('首版最多支持 16 条音轨');
  const track=newTrack(instrument);change(p=>({...p,tracks:[...p.tracks,track]}),true);activateTrack(track.id,true);return track;
 }
 async function noteOn(pitch:number,string?:number){
  if(!assetsReady||pressed.current.has(pitch))return;
  try{
   const track=practiceTrack();if(!track)return;
   const entry:Press={trackId:track.id,pitch,start:engine.now(),velocity,string};
   pressed.current.set(pitch,entry);setHeld(new Set(pressed.current.keys()));
   if(mode==='create'&&autoCapture&&!record.current&&!count&&!countTimers.current.length&&!exporting){
    // Capture immediately, including quick notes before the sampler is warm.
    entry.captureClock=performance.now()/1000;
    let take=autoTake.current;
    if(!take||take.trackId!==track.id){
     const current=projectRef.current!.tracks.find(t=>t.id===track.id)!;
     const offset=engine.playing?engine.position():Math.max(position,...current.notes.map(n=>n.start+n.duration),0);
     take={trackId:track.id,clock:entry.captureClock,offset};autoTake.current=take;
    }
    const start=take.offset+entry.captureClock-take.clock;
    if(start<=599.99){
     const note={id:crypto.randomUUID(),pitch,start,duration:.01,velocity,string};entry.noteId=note.id;
     change(p=>({...p,duration:Math.max(p.duration,start+.01),tracks:p.tracks.map(t=>{if(t.id!==track.id)return t;const result=appendNote(t,note);return sustain?{...result,controls:[...result.controls,{time:start,controller:64,value:127}]}:result})}),true);
    }else setNotice('演奏仍可发声；自动记录已达到 10 分钟上限。');
   }
   await engine.ensure(projectRef.current!.tracks);
   if(pressed.current.get(pitch)!==entry)return;
   entry.start=engine.now();engine.noteOn(track.id,pitch,velocity);
   return entry;
  }catch(e){pressed.current.delete(pitch);setHeld(new Set(pressed.current.keys()));fail(e)}
 }
 function noteOff(pitch:number){const entry=pressed.current.get(pitch);if(!entry)return;finishPress(entry);pressed.current.delete(pitch);setHeld(new Set(pressed.current.keys()));}
 async function pluck(pitch:number,string:number){
  noteOff(pitch);const entry=await noteOn(pitch,string);
  if(entry)setTimeout(()=>{if(mounted.current&&pressed.current.get(pitch)===entry)noteOff(pitch)},600);
 }
 function toggleSustain(value:boolean){
  setSustain(value);const track=practiceTrack();if(!track)return;
  engine.control(track.id,64,value?127:0);
  const rec=record.current;if(rec&&engine.now()>=rec.clock)rec.controls.push({time:rec.offset+engine.now()-rec.clock,controller:64,value:value?127:0});
  else if(mode==='create'&&autoCapture&&autoTake.current){const time=Math.min(600,autoTake.current.offset+performance.now()/1000-autoTake.current.clock);change(p=>({...p,tracks:p.tracks.map(t=>t.id===track.id?{...t,controls:[...t.controls,{time,controller:64,value:value?127:0}]}:t)}));}
 }
 useEffect(()=>{
  const down=(e:KeyboardEvent)=>{
   if((e.target as HTMLElement).closest('input,textarea,select,[contenteditable=true],[role=dialog]'))return;
   if(e.repeat||e.ctrlKey||e.altKey||e.metaKey)return;
   if(e.code==='Space'){e.preventDefault();engine.playing?pause():void play();return;}
   if(sequenceRun.current)return;
   if(e.key==='Shift'&&isKeyboardInstrument(instrument)){sustainKey.current=true;toggleSustain(true);return}
   const mapped=keyPitch(e.key,instrument,octave,frets);
   if(mapped){e.preventDefault();keyMap.current.set(e.code,mapped.pitch);void noteOn(mapped.pitch,mapped.string);}
  };
  const up=(e:KeyboardEvent)=>{if(e.key==='Shift'&&sustainKey.current){sustainKey.current=false;toggleSustain(false)}const pitch=keyMap.current.get(e.code);if(pitch!==undefined){noteOff(pitch);keyMap.current.delete(e.code)}};
  const blur=()=>{stopSequence();if(record.current)stopRecording();else releaseAll()};
  window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);
  return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur)};
 },[instrument,octave,velocity,active,frets,assetsReady,project?.id,mode,autoCapture,count,recording,exporting]);
 async function playProject(p:Project,start=position,end=p.duration,original=false,lead=.08){
  stopSequence();
  try{await engine.play(p,Math.min(start,Math.max(0,end-.01)),end,original,lead);setPlaying(true);
   if(metronome){const origin=engine.transportClock(start);engine.metronome(p.bpm,origin,Math.ceil((end-start)*p.bpm/60));}
   return true;
  }catch(e){engine.stop();fail(e);setPlaying(false);return false}
 }
 async function play(){releaseAll();const p=projectRef.current;if(!p)return;await playProject(p,position>=p.duration?0:position);}
 function pause(){if(sequenceRun.current){stopSequence();return}if(record.current)stopRecording();else releaseAll();engine.stop();setPosition(engine.position());setPlaying(false)}
 async function playSequence(sequence:Sequence,repeat:boolean){
  try{stop();const current=sequenceToken.current,track=practiceTrack();if(!track)return;await engine.ensure(projectRef.current!.tracks);if(current!==sequenceToken.current)return;
   sequenceRun.current={trackId:track.id,sequence,loop:repeat};engine.playNotes(track.id,sequence.notes,sequence.duration);setSequencePlaying(true);setMode('create');
  }catch(e){stopSequence();fail(e)}
 }
 function updateSequence(input:SequenceInput){
  if(record.current||count)return;
  try{const track=practiceTrack();if(!track)return;
   let result:Track;
   try{result=replaceSequence(track,input)}catch{result={...track,sequence:input}}
   change(p=>({...p,duration:Math.max(p.duration,...result.notes.map(n=>n.start+n.duration),0),tracks:p.tracks.map(t=>t.id===track.id?result:t)}),true);setMode('create');
  }catch(e){fail(e)}
 }
 function updatePerformance(values:Partial<PerformanceSettings>){
  stopSequence();releaseAll();const track=practiceTrack();if(!track)return;
  const value={...(track.performance||defaultPerformance(instrument)),...values};
  let result:Track={...track,performance:value};
  if(track.sequence){try{result=replaceSequence(result,track.sequence,true)}catch{}}
  change(p=>({...p,duration:Math.max(p.duration,...result.notes.map(n=>n.start+n.duration),0),tracks:p.tracks.map(t=>t.id===track.id?result:t)}),true);
  setOctave(value.octave);setVelocity(value.velocity);setFrets(value.frets);
 }
 function updateArrangement(values:Partial<{preset:StylePreset;strength:number;seed:number}>){
  if(!preset&&!values.preset)return;const settings={preset:values.preset||preset!,strength:values.strength??strength,seed:values.seed??seed};
  setPreset(settings.preset);setStrength(settings.strength);setSeed(settings.seed);setPreview(null);
  if(activeRef.current)updateTrack(activeRef.current,{arrangement:settings});
 }
 async function beginRecord(){
  if(recording||count){stopRecording();return}
  try{
   stopSequence();engine.stop();setPlaying(false);setMode('create');
   const track=practiceTrack();if(!track)return;
   await engine.ensure(projectRef.current!.tracks);releaseAll();
   const bpm=projectRef.current!.bpm,beat=60/bpm;
   const begin=engine.now()+.1;engine.metronome(bpm,begin,4);
   for(let i=0;i<4;i++)countTimers.current.push(setTimeout(()=>setCount(4-i),100+i*beat*1000));
   countTimers.current.push(setTimeout(async()=>{
    setCount(0);const p=projectRef.current!;
    const offset=position>=p.duration?0:position;
    if(!await playProject(p,offset,p.duration,false,0))return;
    record.current={trackId:track.id,clock:engine.transportClock(offset),offset,notes:[],controls:[]};
    setRecording(true);
   },100+beat*4000));
  }catch(e){fail(e)}
 }
 async function runJob(kind:'separate'|'transcribe'|'arrange',isPreview=false){
  try{
   setError('');stopSequence();if(record.current)stopRecording();else releaseAll();engine.stop();setPlaying(false);
   let p=projectRef.current;if(!p)return;
   const ids=p.tracks.filter(t=>t.selected&&playableInstruments.includes(t.instrument)).map(t=>t.id);
   if(kind!=='separate'&&!ids.length)throw new Error('请在左侧勾选要处理的乐器音轨。');
   if(kind==='arrange'&&preset){const settings={preset,strength,seed};change(current=>({...current,tracks:current.tracks.map(t=>ids.includes(t.id)?{...t,arrangement:settings}:t)}));p=projectRef.current!;}
   await window.workbench.api('/projects/'+p.id,p,'PUT');
   const value=await window.workbench.api<JobStatus>('/jobs',{kind,projectId:p.id,trackIds:ids,model,device:execution,style:kind==='arrange'?preset:undefined,strength,seed,preview:isPreview,start:range.start,end:range.end},'POST');
   jobInput.current={id:value.id,base:p,ids};setJob(value);
  }catch(e){fail(e)}
 }
 async function importAudio(file?:File){
  try{stop();const p=await window.workbench.importAudio(file);if(p){assign(p,true);activateTrack(p.tracks[0].id,false);setMode('arrange');setRange({start:0,end:Math.min(20,p.duration)});setNotice('音频已导入。点击分离音轨，随后勾选想改编的乐器。');}}
  catch(e){fail(e)}
 }
 async function open(){try{stop();const p=await window.workbench.openProject();if(p){assign(p,true);activateTrack(p.tracks[0]?.id||'',!p.original);setMode(p.original?'arrange':'create');setRange({start:0,end:Math.min(20,p.duration)});setNotice('工程已打开。');}}catch(e){fail(e)}}
 async function save(){try{releaseAll();if(projectRef.current){const result=await window.workbench.saveProject(projectRef.current);if(result)setNotice('工程已保存：'+result.path);}}catch(e){fail(e)}}
 async function newProject(){try{stop();const p=await window.workbench.api<Project>('/projects/new',{},'POST');p.tracks=[newTrack('piano')];assign(p,true);activateTrack(p.tracks[0].id,true);setMode('create');}catch(e){fail(e)}}
 function history(direction:'undo'|'redo'){
  const source=direction==='undo'?undo:redo,target=direction==='undo'?redo:undo;
  if(!source.current.length||!project)return;pause();target.current.push(project);
  assign(source.current.pop()!);activateTrack(projectRef.current?.tracks.some(t=>t.id===active)?active:projectRef.current?.tracks[0]?.id||'',false);setHistoryRevision(r=>r+1);
 }
 function editNotes(notes:NoteEvent[]){
  if(!activeTrack)return;if(busy&&job?.kind!=='initialize'&&job?.kind!=='selftest'){setError('处理期间可自由演奏；请等待任务完成后修改音符。');return}
  pause();updateTrack(active,{notes,sourceNotes:notes},true);
 }
 async function exportFile(format:'mid'|'wav'|'mp3',onlyActive=false){
  if(!project)return;
  try{stopSequence();setExporting(true);setExportOpen(false);setExportProgress(0);
   const ids=onlyActive?[active]:undefined;
   if(format==='mid'){const result=await window.workbench.exportMidi(project,ids);if(result)setNotice('MIDI 已导出；原声轨与效果请使用音频或工程导出。');}
   else{
    const data=await engine.render(project,ids,(value,label)=>{setExportProgress(value);setExportLabel(label)});
    setPlaying(false);const result=await window.workbench.exportAudio(data,format,project.name+(onlyActive?' - '+activeTrack?.name:''));
    if(result)setNotice('音频已导出：'+result.path);
   }
  }catch(e){fail(e)}finally{setExporting(false)}
 }
 async function initialize(){try{setError('');setJob(await window.workbench.api<JobStatus>('/jobs',{kind:'initialize',device:execution},'POST'))}catch(e){fail(e)}}
 if(!window.workbench)return <div className="unavailable"><h1>请通过桌面启动器打开 MusicWorkbench</h1><p>本页面需要桌面程序管理本地音频服务。</p></div>;
 return <div className="app-shell" onDragOver={e=>{e.preventDefault()}} onDrop={e=>{e.preventDefault();if(!busy&&e.dataTransfer.files[0])void importAudio(e.dataTransfer.files[0])}}>
  <header className="app-header"><div className="brand"><div className="brand-icon"><AudioLines size={25}/></div><div><strong>MusicWorkbench<span className="version">BETA 03</span></strong><span>本地音乐改编与创作工作台</span></div></div>
   <nav className="workspace-tabs"><button className={mode==='arrange'?'active':''} onClick={()=>{releaseAll();setMode('arrange')}}><SlidersHorizontal size={16}/>改编工作台</button><button className={mode==='create'?'active':''} onClick={()=>{releaseAll();setMode('create');if(active)activateTrack(active,true)}}><Music2 size={16}/>创作工作台</button></nav>
   <div className="header-actions"><span className="local-badge"><i/>本机处理</span><button aria-label="用户指引" onClick={()=>{stop();setGuide(true);setWelcome(false);localStorage.setItem('workbench-guide-seen','1')}}><BookOpen size={17}/>使用指引</button><button className="icon-button" title="设置与资源" aria-label="设置与资源" onClick={()=>setSettings(true)}><Settings2 size={19}/></button></div></header>
  <div className="project-bar"><div className="project-title"><span className="eyebrow">PROJECT</span><input aria-label="工程名称" value={project?.name||'正在初始化…'} disabled={!project} onChange={e=>change(p=>({...p,name:e.target.value||'未命名创作'}))}/><span className="save-dot" title="自动保存到本机"/></div>
   <div className="project-actions"><button disabled={busy||recording} onClick={()=>void newProject()}><Plus size={15}/>新建</button><button disabled={busy||recording} onClick={()=>void open()}><FolderOpen size={15}/>打开</button><button disabled={!project} onClick={()=>void save()}><Save size={15}/>保存工程</button><div className="export-container"><button className="primary" disabled={!project||exporting} onClick={()=>setExportOpen(!exportOpen)}><Download size={15}/>导出<ChevronDown size={13}/></button>{exportOpen&&<div className="export-menu">{(['wav','mp3','mid'] as const).map(f=><button key={f} onClick={()=>void exportFile(f)}>混音导出 · {f.toUpperCase()}</button>)}<hr/>{(['wav','mp3','mid'] as const).map(f=><button key={f} disabled={!activeTrack} onClick={()=>void exportFile(f,true)}>当前音轨 · {f.toUpperCase()}</button>)}</div>}</div></div></div>
  {error&&<div className="error-banner" role="alert"><span>{error}</span><button onClick={()=>setError('')} aria-label="关闭错误提示"><X size={16}/></button></div>}
  {notice&&<div className="notice-banner" role="status">{notice}</div>}
  <main className="workbench-grid">
   <aside className="track-sidebar">
    <div className="sidebar-heading"><div><span className="eyebrow">YOUR SESSION</span><h2>音轨 <span>{project?.tracks.length||0}</span></h2></div><button className="icon-button" title="新增当前乐器音轨" disabled={!project||busy} onClick={()=>{if(projectRef.current!.tracks.length>=16){setError('首版最多支持 16 条音轨');return}const t=newTrack(instrument);change(p=>({...p,tracks:[...p.tracks,t]}),true);activateTrack(t.id,true);setMode('create')}}><Plus size={18}/></button></div>
    <button className="import-button" disabled={busy||recording} onClick={()=>void importAudio()}><Upload size={17}/><span>导入音乐<small>WAV · MP3 · FLAC · M4A</small></span><ArrowUpRight size={15}/></button>
    {project?.original&&<div className="separation"><div className="inline"><span>音轨分离</span><select aria-label="分离模式" value={model} onChange={e=>setModel(e.target.value)} disabled={busy}><option value="htdemucs_6s">六轨 · 含钢琴与吉他</option><option value="htdemucs">四轨兼容模式</option></select></div><button disabled={busy} onClick={()=>void runJob('separate')}><AudioLines size={16}/>{project.tracks.some(t=>t.estimated)?'重新分离':'分离音轨'}</button><p className="hint">模型估计类别，可能存在串音。四轨模式不能单选钢琴和吉他。</p></div>}
    <div className="track-list">{project?.tracks.map((track,index)=><div className={'track-card'+(active===track.id?' active':'')} key={track.id} onClick={()=>{if(!recording&&active!==track.id)activateTrack(track.id)}} style={{'--track-color':track.color} as React.CSSProperties}>
     <div className="track-top"><input type="checkbox" aria-label={'选择 '+track.name} checked={track.selected} onClick={e=>e.stopPropagation()} onChange={e=>updateTrack(track.id,{selected:e.target.checked})}/><span className="track-icon"><Icon instrument={track.instrument} size={17}/></span><input className="track-name" aria-label={'音轨 '+(index+1)+' 名称'} value={track.name} onChange={e=>updateTrack(track.id,{name:e.target.value})}/><small>{String(index+1).padStart(2,'0')}</small></div>
     <div className="track-caption"><span>{track.estimated?'模型估计 · ':''}{labels[track.instrument]} · {track.mode==='audio'?'原声音频':track.style?'已编配':track.notes.length+' 个音符'}</span><div className="track-toggles"><button className={track.solo?'active':''} aria-label={'独奏 '+track.name} onClick={e=>{e.stopPropagation();updateTrack(track.id,{solo:!track.solo})}}>S</button><button className={track.mute?'muted-on':''} aria-label={'静音 '+track.name} onClick={e=>{e.stopPropagation();updateTrack(track.id,{mute:!track.mute})}}>M</button></div></div>
     <div className="track-volume"><Volume2 size={12}/><input aria-label={track.name+' 音量'} type="range" min={0} max={2} step={.01} value={track.gain} onChange={e=>updateTrack(track.id,{gain:+e.target.value})}/><span>{track.gain===0?'−∞':(20*Math.log10(track.gain)).toFixed(1)} dB</span></div>
     {active===track.id&&<div className="track-detail"><label>声像<input aria-label={track.name+' 声像'} type="range" min={-1} max={1} step={.05} value={track.pan} onChange={e=>updateTrack(track.id,{pan:+e.target.value})}/></label><button className="icon-button" title="删除音轨" disabled={busy||recording} onClick={e=>{e.stopPropagation();releaseAll();change(p=>({...p,tracks:p.tracks.filter(t=>t.id!==track.id)}),true);activateTrack(project.tracks.find(t=>t.id!==track.id)?.id||'')}}><Trash2 size={12}/></button></div>}
    </div>)}</div>
    <div className="sidebar-bottom"><Headphones size={17}/><div><strong>声音留在你的电脑</strong><span>无上传 · 无云端处理 · 自动保存</span></div></div>
   </aside>
   <div className="center-workspace">
    {welcome&&<section className="welcome-guide"><BookOpen size={21}/><div><strong>第一次使用？从这里认识工作台</strong><p>导入改编、自由演奏，或输入 ASDFDGS 自动弹奏。</p></div><button onClick={()=>{stop();setGuide(true);setWelcome(false);localStorage.setItem('workbench-guide-seen','1')}}>查看指引</button><button className="icon-button" aria-label="关闭首次使用提示" onClick={()=>{setWelcome(false);localStorage.setItem('workbench-guide-seen','1')}}><X size={15}/></button></section>}
    <section className="intro"><div><span className="eyebrow">{mode==='arrange'?'REIMAGINE YOUR MUSIC':'CAPTURE YOUR MOMENT'}</span><h1>{mode==='arrange'?'给熟悉的旋律，新的演奏方式。':'从一个音符，开始你的作品。'}</h1><p>{mode==='arrange'?'导入音乐，选中乐器，再让不同的编配语言带来新的听感。':'直接演奏或输入指令，旋律自动留在音轨；切换乐器，继续叠加你的作品。'}</p></div><div className="intro-mark"><AudioLines size={52}/></div></section>
    {project?<Timeline project={project} active={active} time={position} onSeek={t=>{pause();setPosition(t)}} onActive={activateTrack} onNotes={editNotes} onMode={m=>updateTrack(active,{mode:m},true)}/>:<div className="loading-panel"><LoaderCircle className="spin"/><p>正在启动本地工作台…</p><button onClick={()=>void boot()}><RefreshCw size={15}/>重试连接</button></div>}
    <Instruments instrument={instrument} onInstrument={chooseInstrument} octave={octave} onOctave={octave=>updatePerformance({octave})} velocity={velocity} onVelocity={velocity=>updatePerformance({velocity})} sustain={sustain} onSustain={toggleSustain} held={held} onOn={(p,s)=>void noteOn(p,s)} onOff={noteOff} onPluck={(p,s)=>void pluck(p,s)} ready={assetsReady&&!!project&&!sequencePlaying&&!exporting} frets={frets} onFrets={frets=>updatePerformance({frets})} autoCapture={autoCapture} onAutoCapture={value=>{releaseAll();setAutoCapture(value);localStorage.setItem('workbench-auto-capture',value?'1':'0')}} creating={mode==='create'}/>
    <SequencePanel instrument={instrument} octave={octave} frets={frets} velocity={velocity} input={sequenceInput} ready={assetsReady&&!!project&&!recording&&!count&&!exporting} editable={!!project&&!recording&&!count&&!exporting} running={sequencePlaying} position={sequencePosition} onPlay={playSequence} onStop={stop} onChange={updateSequence}/>
    {activeTrack&&<EffectsPanel track={activeTrack} onChange={effects=>updateTrack(active,{effects})}/>}
   </div>
   <aside className="right-sidebar">
    <section className="style-panel panel"><div className="section-heading"><div><span className="eyebrow">ARRANGEMENT</span><h2>探索演奏风格</h2></div><span className="number-label">{String(presets.length).padStart(2,'0')}</span></div>
     <div className="style-cards">{presets.map((style,i)=><button key={style.id} className={'style-card style-'+style.id+(preset?.id===style.id?' active':'')} onClick={()=>updateArrangement({preset:style})}><div className="style-art"><span>{['宫','和','风','舞','爵','蓝','摇','波','圆','境'][i]}</span><div className="style-lines"/><small>{String(i+1).padStart(2,'0')}</small></div><div className="style-label"><strong>{style.name}</strong><small>{style.description||'器乐风格编配'}</small></div>{preset?.id===style.id&&<span className="style-check"><Check size={12}/></span>}</button>)}</div>
     <div className="style-strength"><label>风格强度 <span>{Math.round(strength*100)}%</span></label><input aria-label="风格强度" type="range" min={0} max={1} step={.01} value={strength} onChange={e=>updateArrangement({strength:+e.target.value})}/><div className="range-labels"><span>轻微装饰</span><span>丰富编配</span></div></div>
     <div className="selected-summary"><span className="eyebrow">SELECTED TRACKS</span><p>{selected.length?selected.map(t=>t.name).join('、'):'在左侧勾选要改编的音轨'}</p></div>
     <label className="field">主旋律轨<select value={project?.leadTrackId||''} disabled={!project||busy} onChange={e=>change(p=>({...p,leadTrackId:e.target.value||null}))}><option value="">自动推荐</option>{project?.tracks.filter(t=>playableInstruments.includes(t.instrument)&&!['bass','drums','cello'].includes(t.instrument)).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
     <div className="preview-range"><label>预览起点<input aria-label="预览起点（秒）" type="number" min={0} max={project?.duration||600} value={range.start} step={1} onChange={e=>setRange(r=>({...r,start:+e.target.value}))}/></label><label>预览终点<input aria-label="预览终点（秒）" type="number" min={0} max={project?.duration||600} value={range.end} step={1} onChange={e=>setRange(r=>({...r,end:+e.target.value}))}/></label></div>
     <button className="wide" disabled={busy||!project||!selected.length} onClick={()=>void runJob('arrange',true)}><Headphones size={16}/>生成片段预览</button>
     {preview&&<button className="wide" onClick={()=>void playProject(preview,range.start,Math.min(range.end,preview.duration))}><Play size={15}/>试听预览</button>}
     <button className="primary wide" disabled={busy||!project||!selected.length} onClick={()=>void runJob('arrange')}><AudioLines size={16}/>生成全曲编配</button>
     <details className="advanced"><summary>高级编配设置</summary><label className="field">随机种子<input type="number" min={0} max={2147483647} value={seed} onChange={e=>updateArrangement({seed:Math.max(0,Math.min(2147483647,+e.target.value))})}/></label>{preset&&<>
      <label className="field">装饰音密度<input type="range" min={0} max={1} step={.01} value={preset.ornament} onChange={e=>updateArrangement({preset:{...preset,ornament:+e.target.value}})}/></label><label className="field">伴奏密度<input type="range" min={0} max={1} step={.01} value={preset.density} onChange={e=>updateArrangement({preset:{...preset,density:+e.target.value}})}/></label><label className="field">节奏摆动<input type="range" min={0} max={.35} step={.01} value={preset.swing} onChange={e=>updateArrangement({preset:{...preset,swing:+e.target.value}})}/></label>
      <label className="field">当前轨配器 · GM 编号<input type="number" min={0} max={127} value={preset.programs[activeTrack?.instrument||'piano']||0} onChange={e=>updateArrangement({preset:{...preset,programs:{...preset.programs,[activeTrack?.instrument||'piano']:Math.max(0,Math.min(127,+e.target.value))}}})}/></label></>}</details>
     <p className="hint">保留主要旋律与原速度。未选中的音轨保留原声；部分民族乐器使用已标注的近似音色。</p>
    </section>
    {activeTrack&&<section className="analysis-panel panel"><div className="section-heading"><h3>音符与音源</h3><Music2 size={17}/></div><p>{activeTrack.timbre||'GeneralUser GS 采样音源'}</p><button className="wide" disabled={busy||!selected.length} onClick={()=>void runJob('transcribe')}>选中乐器转为可编辑音符</button>{activeTrack.originalAsset&&<button className="wide" onClick={()=>{pause();updateTrack(active,{mode:'audio',asset:activeTrack.originalAsset},true)}}>恢复当前轨原声</button>}
      <label className="field">音源<select value={activeTrack.soundBank} disabled={playing||recording} onChange={e=>updateTrack(active,{soundBank:e.target.value})}><option value="generaluser">GeneralUser GS</option>{fonts.map(font=><option value={font.id} key={font.id}>{font.name}</option>)}</select></label>
      <label className="field">乐器音色 · GM 编号<input type="number" min={0} max={127} value={activeTrack.program} onChange={e=>updateTrack(active,{program:Math.max(0,Math.min(127,+e.target.value)),timbre:''},true)}/></label>
    </section>}
    {(job||!assetsReady)&&<section className="job-panel panel" aria-live="polite"><div className="inline">{busy?<LoaderCircle className="spin" size={17}/>:job?.state==='failed'?<X size={17}/>:<Check size={17}/>}<strong>{job?.stage||'资源尚未初始化'}</strong></div>{job?.total&&<><progress max={job.total} value={job.downloaded??job.completed??0}/><small>{job.downloaded!==undefined?Math.round(job.downloaded/1024/1024)+' / '+Math.round(job.total/1024/1024)+' MB':(job.completed||0)+' / '+job.total}</small></>}{job?.warning&&<p className="hint">{job.warning}</p>}{busy?<button className="wide" onClick={()=>window.workbench.api<JobStatus>('/jobs/'+job!.id+'/cancel',{},'POST').then(setJob).catch(fail)}>取消任务</button>:job?.state==='failed'||!assetsReady?<button className="wide" onClick={()=>void initialize()}>重试资源初始化</button>:null}</section>}
   </aside>
  </main>
  <footer className="transport"><div className="transport-play"><button className="icon-button" title="回到起点" onClick={()=>{pause();setPosition(0)}}><RotateCcw size={17}/></button><button className="play-button" aria-label={playing?'暂停':'播放'} disabled={!project||!assetsReady} onClick={()=>playing?pause():void play()}>{playing?<Pause size={21} fill="currentColor"/>:<Play size={21} fill="currentColor"/>}</button><button className="icon-button" aria-label="停止" onClick={stop}><Square size={16}/></button><button className={'record-button'+(recording||count?' recording':'')} aria-label={recording?'结束录制':'开始录制'} disabled={!project||!assetsReady||(busy&&job?.kind!=='initialize'&&job?.kind!=='selftest')||exporting} onClick={()=>void beginRecord()}>{count||<span/>}</button><span className="time-display">{formatTime(position)} <small>/ {formatTime(project?.duration||0)}</small></span></div>
   <div className="transport-settings"><label>BPM<input aria-label="速度 BPM" type="number" min={20} max={300} step={1} value={project?+project.bpm.toFixed(1):120} disabled={playing||recording} onChange={e=>change(p=>({...p,bpm:Math.max(20,Math.min(300,+e.target.value)),tempoMap:[{time:0,bpm:Math.max(20,Math.min(300,+e.target.value))}]}))}/></label><label>调性<select aria-label="调性" value={project?.key||'C'} onChange={e=>change(p=>({...p,key:e.target.value}))}>{['C','C#','D','D#','E','F','F#','G','G#','A','A#','B','Cm','C#m','Dm','D#m','Em','Fm','F#m','Gm','G#m','Am','A#m','Bm'].map(k=><option key={k}>{k}</option>)}</select></label><span className="meter">{project?.meter||'4/4'}</span><button className={loop?'active icon-button':'icon-button'} title="循环播放" onClick={()=>setLoop(!loop)}><Repeat2 size={18}/></button><button className={metronome?'active':'muted'} onClick={()=>setMetronome(!metronome)}>节拍器</button></div>
   <div className="transport-end"><button className="icon-button" disabled={!undo.current.length||recording} title="撤销" onClick={()=>history('undo')}><Undo2 size={17}/></button><button className="icon-button" disabled={!redo.current.length||recording} title="重做" onClick={()=>history('redo')}><Redo2 size={17}/></button>{project?.original&&<button className="ab-button" title="试听原曲" onClick={()=>void playProject(project,position>=project.duration?0:position,project.duration,true)}>原曲 A/B</button>}<span className="device-indicator"><i/>{recording?'正在录制':playing?'播放中':'就绪'}</span></div></footer>
  {settings&&<div className="modal-backdrop" onClick={()=>setSettings(false)}><section className="settings-modal panel" role="dialog" aria-modal="true" aria-label="设置与本地资源" onClick={e=>e.stopPropagation()}><div className="section-heading"><h2>设置与本地资源</h2><button className="icon-button" aria-label="关闭设置" onClick={()=>setSettings(false)}><X size={20}/></button></div><p className="muted">音频始终在本机处理。下载模型与音源后可离线使用。</p><label className="field">计算设备<select value={execution} onChange={e=>{const value=e.target.value as 'auto'|'cpu';setExecution(value);localStorage.setItem('workbench-device',value)}}><option value="auto">自动选择 GPU，失败时切换 CPU</option><option value="cpu">强制 CPU</option></select></label><p className="hint">{device}</p>
   <label className="field">工程时长（秒）<input type="number" min={1} max={600} value={project?+project.duration.toFixed(1):16} disabled={!project||!!project.original||playing||recording} onChange={e=>change(p=>({...p,duration:Math.max(1,Math.min(600,+e.target.value,...p.tracks.flatMap(t=>t.notes.map(n=>n.start+n.duration))))}))}/></label>
   <div className="asset-list">{health?.assets.map(a=><div className="asset-row" key={a.id}><span>{a.file}<small>{(a.size/1024/1024).toFixed(1)} MB · {a.license}</small></span>{a.ready?<Check size={16}/>:<span className="muted">待下载</span>}</div>)}</div>
   <div className="settings-buttons"><button disabled={busy} onClick={()=>void initialize()}><Download size={16}/>校验／下载资源</button><button disabled={busy} onClick={()=>window.workbench.importPack().then(()=>refreshHealth()).catch(fail)}>导入离线资源包</button><button onClick={()=>window.workbench.importFont().then(font=>{if(font)setFonts(f=>[...f,font])}).catch(fail)}>导入 SF2 音源</button><button disabled={busy} onClick={()=>window.workbench.restart().then(()=>{setError('');return refreshHealth()}).catch(fail)}><RefreshCw size={16}/>重新启动后端</button><button onClick={()=>window.workbench.logs().then(result=>result&&setNotice('日志已导出：'+result.path)).catch(fail)}>导出诊断日志</button></div><p className="hint">导入的 SF2 使用主音色库（Bank 0）；乐器编号从 0 开始。音轨分类和转谱结果允许误差，请试听并修正。</p><div className="uninstall-section"><h3>应用管理</h3><p className="hint">完全卸载会清除运行环境、模型、GPU 组件、缓存和自动恢复工程。请先另存要保留的作品。</p><button className="danger" disabled={uninstalling||exporting||recording} onClick={async()=>{try{stop();setUninstalling(true);const result=await window.workbench.uninstall();if(!result.started)setUninstalling(false)}catch(e){setUninstalling(false);fail(e)}}}><Trash2 size={16}/>{uninstalling?'正在启动卸载…':'完全卸载应用'}</button></div></section></div>}
  <UserGuide open={guide} onClose={()=>setGuide(false)} tour={tour} onTour={setTour}/>
  {exporting&&<div className="modal-backdrop"><section className="export-modal panel" role="dialog" aria-modal="true" aria-label="正在导出"><LoaderCircle className="spin" size={28}/><h2>{exportLabel||'正在导出'}</h2><progress max={1} value={exportProgress}/><p className="muted">使用与实时演奏一致的采样音源和效果参数。</p></section></div>}
 </div>
}
