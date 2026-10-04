import type {Project,Track,NoteEvent,SequenceInput} from '../types';
import {defaultPerformance,instrumentPrograms,labels} from '../types';
import {parseSequence} from '../audio/sequence';

export function emptySequence(bpm:number,start=0):SequenceInput {
 return {text:'',bpm,division:8,loop:false,start,noteIds:[]};
}
export function replaceSequence(track:Track,input:SequenceInput,force=false):Track {
 // Loop changes never regenerate a clip or undo edits made in the piano roll.
 const old=track.sequence;
 if(!input.text.trim()&&!old?.noteIds.length)return {...track,sequence:input};
 if(!force&&old&&['text','bpm','division','start'].every(key=>old[key as keyof SequenceInput]===input[key as keyof SequenceInput]))return {...track,sequence:input};
 const performance=track.performance||defaultPerformance(track.instrument);
 let notes:NoteEvent[]=[];
 if(input.text.trim()){
  const parsed=parseSequence(input.text,{instrument:track.instrument,...performance,bpm:input.bpm,division:input.division});
  if(input.start+parsed.duration>600)throw new Error('当前光标与指令长度合计超过 10 分钟，请移回起点。');
  notes=parsed.notes.map(n=>({...n,start:n.start+input.start}));
 }
 const ids=new Set(old?.noteIds||[]);
 const source=track.style&&track.sourceNotes.length?track.sourceNotes:track.notes;
 const combined=[...source.filter(n=>!ids.has(n.id)),...notes];
 return {...track,mode:'notes',notes:combined,sourceNotes:combined,style:null,
  program:track.style?instrumentPrograms[track.instrument]:track.program,
  timbre:track.style?'GeneralUser GS · '+labels[track.instrument]:track.timbre,
  sequence:{...input,noteIds:notes.map(n=>n.id)}};
}

export function appendNote(track:Track,note:NoteEvent):Track {
 return {...track,mode:'notes',notes:[...track.notes,note],sourceNotes:[]};
}

export function mergeProcessedProject(current:Project,processed:Project,base:Project,ids:string[]):Project {
 const selected=new Set(ids);
 const signature=(t:Track)=>JSON.stringify([t.notes,t.sourceNotes,t.controls,t.mode,t.program,t.soundBank,t.sequence]);
 return {...current,leadTrackId:current.leadTrackId||processed.leadTrackId,chords:processed.chords,history:processed.history,
  tracks:current.tracks.map(t=>{
   if(!selected.has(t.id))return t;
   const before=base.tracks.find(n=>n.id===t.id),result=processed.tracks.find(n=>n.id===t.id);
   // A finished task cannot replace notes edited or played after it was submitted.
   if(!before||!result||signature(before)!==signature(t))return t;
   return {...result,name:t.name,gain:t.gain,pan:t.pan,mute:t.mute,solo:t.solo,selected:t.selected,effects:t.effects,
    performance:t.performance,sequence:t.sequence,arrangement:t.arrangement};
  })};
}
