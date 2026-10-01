import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createSynth,configureChannel} from './core';
import {audibleTracks} from './effects';
import {newTrack,playableInstruments} from '../types';

describe('sampled instrument audio',()=>{
 it('renders a real piano note and immediately silences panic',()=>{
  const bytes=readFileSync('vendor/GeneralUser-GS.sf2');
  const synth=createSynth(44100,[{id:'generaluser',data:new Uint8Array(bytes).buffer,offset:0}]);
  configureChannel(synth,0,newTrack('piano'));
  const outputs=Array.from({length:16},()=>[new Float32Array(128),new Float32Array(128)]);
  const effects=[new Float32Array(128),new Float32Array(128)];
  synth.noteOn(0,60,100);
  let energy=0;for(let i=0;i<100;i++){outputs.forEach(pair=>pair.forEach(channel=>channel.fill(0)));synth.processSplit(outputs,effects[0],effects[1],0,128);energy+=outputs[0][0].reduce((a,b)=>a+b*b,0)}
  expect(energy).toBeGreaterThan(.01);
  synth.stopAllChannels(true);outputs.forEach(pair=>pair.forEach(channel=>channel.fill(0)));synth.processSplit(outputs,effects[0],effects[1],0,128);
  expect(outputs[0][0].every(value=>Math.abs(value)<.00001)).toBe(true);
 });
 it('respects solo and mute in the shared export track selection',()=>{
  const piano=newTrack('piano'),guitar=newTrack('guitar'),drums=newTrack('drums');
  guitar.solo=true;drums.mute=true;
  expect(audibleTracks([piano,guitar,drums]).map(t=>t.id)).toEqual([guitar.id]);
  guitar.mute=true;expect(audibleTracks([piano,guitar,drums])).toEqual([]);
 });
 it('each of the sixteen instrument programs produces actual sampled audio',()=>{
  const bytes=readFileSync('vendor/GeneralUser-GS.sf2');
  const synth=createSynth(44100,[{id:'generaluser',data:new Uint8Array(bytes).buffer,offset:0}]);
  const outputs=Array.from({length:16},()=>[new Float32Array(128),new Float32Array(128)]),effects=[new Float32Array(128),new Float32Array(128)];
  for(const instrument of playableInstruments){
   synth.stopAllChannels(true);configureChannel(synth,0,newTrack(instrument));synth.noteOn(0,instrument==='drums'?36:60,100);
   let energy=0;for(let i=0;i<120;i++){outputs.forEach(pair=>pair.forEach(channel=>channel.fill(0)));synth.processSplit(outputs,effects[0],effects[1],0,128);energy+=outputs[0][0].reduce((a,b)=>a+b*b,0)}
   expect(energy,instrument).toBeGreaterThan(.001);
  }
 });
});
