import {SpessaSynthProcessor,SoundBankLoader, type MIDIController} from 'spessasynth_core';
import type {Track} from '../types';
export function configureChannel(synth:SpessaSynthProcessor,channel:number,track:Track,bankOffset=0){
 synth.midiChannels[channel].setDrums(track.instrument==='drums');
 synth.controllerChange(channel,0 as MIDIController,bankOffset);
 synth.controllerChange(channel,32 as MIDIController,0);
 synth.controllerChange(channel,7 as MIDIController,100);
 synth.controllerChange(channel,91 as MIDIController,0);
 synth.controllerChange(channel,93 as MIDIController,0);
 synth.programChange(channel,track.program);
}
export function createSynth(sampleRate:number,banks:{id:string;data:ArrayBuffer;offset:number}[]){
 const synth=new SpessaSynthProcessor(sampleRate,{effectsEnabled:false,eventsEnabled:false});
 for(const bank of banks)synth.soundBankManager.addSoundBank(SoundBankLoader.fromArrayBuffer(bank.data),bank.id,bank.offset);
 return synth;
}
