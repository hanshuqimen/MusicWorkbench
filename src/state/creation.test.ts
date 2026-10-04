import {describe,it,expect} from 'vitest';
import type {Project,Track} from '../types';
import {newTrack} from '../types';
import {emptySequence,replaceSequence,appendNote,mergeProcessedProject} from './creation';

const note={id:'live-note',pitch:72,start:3,duration:.3,velocity:80};
function project(tracks:Track[]):Project {return {schemaVersion:1,id:'project',name:'创作',duration:16,bpm:120,key:'C',meter:'4/4',tempoMap:[{time:0,bpm:120}],beats:[],chords:[],original:null,leadTrackId:null,tracks,history:[]}}
describe('automatic creation and independent tracks',()=>{
 it('keeps a freely recorded arrangement when editing empty command settings',()=>{
  const track={...newTrack('piano'),style:'jazz',program:65,notes:[note],sourceNotes:[note]};
  const result=replaceSequence(track,{...emptySequence(120),loop:true});
  expect(result.notes).toBe(track.notes);expect(result.style).toBe('jazz');expect(result.program).toBe(65);
 });
 it('updates a typed phrase instead of accumulating every keystroke',()=>{
  let track=newTrack('piano');
  for(const text of ['A','AS','ASDF'])track=replaceSequence(track,{...(track.sequence||emptySequence(120)),text});
  expect(track.notes.map(n=>n.pitch)).toEqual([60,62,64,65]);
  expect(track.notes.map(n=>n.start)).toEqual([0,.25,.5,.75]);
 });
 it('clears only the input clip and retains separately played notes',()=>{
  let track=replaceSequence(newTrack('piano'),{...emptySequence(120),text:'WASD'});
  track=appendNote(track,note);
  track=replaceSequence(track,{...track.sequence!,text:''});
  expect(track.notes).toEqual([note]);expect(track.sequence?.noteIds).toEqual([]);
 });
 it('uses the original phrase when editing an already arranged clip',()=>{
  let track=replaceSequence(newTrack('piano'),{...emptySequence(120),text:'AS'});
  track={...track,style:'jazz',notes:[...track.notes,note],program:65};
  const result=replaceSequence(track,{...track.sequence!,text:'DF'});
  expect(result.notes.map(n=>n.pitch)).toEqual([64,65]);expect(result.style).toBeNull();expect(result.program).toBe(0);
 });
 it('does not discard piano-roll edits when only changing loop',()=>{
  const original=replaceSequence(newTrack('piano'),{...emptySequence(120),text:'A'});
  const track={...original,notes:[{...original.notes[0],pitch:70}]};
  const result=replaceSequence(track,{...track.sequence!,loop:true});
  expect(result.notes).toBe(track.notes);expect(result.notes[0].pitch).toBe(70);
 });
 it('changes a phrase octave while keeping other recorded notes',()=>{
  let track=replaceSequence(newTrack('piano'),{...emptySequence(120),text:'A'});
  track=appendNote(track,note);track.performance!.octave=5;
  const result=replaceSequence(track,track.sequence!,true);
  expect(result.notes.map(n=>n.pitch)).toEqual([72,72]);expect(result.notes[0].id).toBe('live-note');
 });
 it('rejects malformed and overlong phrases before changing notes',()=>{
  const track=replaceSequence(newTrack('piano'),{...emptySequence(120),text:'AS'});
  expect(()=>replaceSequence(track,{...track.sequence!,text:'[AD'})).toThrow();
  expect(()=>replaceSequence(track,{...track.sequence!,start:600,text:'A'})).toThrow();
  expect(track.notes).toHaveLength(2);
 });
 it('preserves concurrent edits and new tracks outside a job selection',()=>{
  const piano=newTrack('piano'),guitar=newTrack('guitar'),bass=newTrack('bass');
  const base=project([piano,guitar]);
  const current=project([piano,{...guitar,notes:[note],program:26,pan:.5},bass]);
  const processed=project([{...piano,notes:[{...note,pitch:60}],style:'jazz'},guitar]);
  const merged=mergeProcessedProject(current,processed,base,[piano.id]);
  expect(merged.tracks[0].style).toBe('jazz');expect(merged.tracks[1]).toBe(current.tracks[1]);expect(merged.tracks[2]).toBe(bass);
 });
 it('does not replace fresh input on a track being processed',()=>{
  const piano=newTrack('piano'),base=project([piano]);
  const current=project([appendNote(piano,note)]),processed=project([{...piano,style:'rock'}]);
  expect(mergeProcessedProject(current,processed,base,[piano.id]).tracks[0]).toBe(current.tracks[0]);
 });
});
