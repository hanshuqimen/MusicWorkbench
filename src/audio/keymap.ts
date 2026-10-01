import type {Instrument} from '../types';
import {isKeyboardInstrument} from '../types';
export const pianoKeys=['a','w','s','e','d','f','t','g','y','h','u','j','k','o','l','p',';'];
export const drumPitches=[36,38,42,46,41,45,49,51];
export const drumKeys=['a','s','d','f','j','k','l',';'];
export function playableKeys(instrument:Instrument){
 return isKeyboardInstrument(instrument)?pianoKeys:instrument==='drums'?drumKeys:instrument==='bass'?['a','s','d','f']:instrument==='guitar'?['a','s','d','f','g','h']:[];
}
export function keyPitch(key:string,instrument:Instrument,octave:number,frets:number[]):{pitch:number;string?:number}|undefined{
 const index=playableKeys(instrument).indexOf(key.toLowerCase());if(index<0)return;
 if(isKeyboardInstrument(instrument))return {pitch:(octave+1)*12+index};
 if(instrument==='drums')return {pitch:drumPitches[index]};
 const open=instrument==='bass'?[28,33,38,43]:[40,45,50,55,59,64];
 if(frets[index]===undefined||frets[index]<0)return;
 return {pitch:open[index]+frets[index],string:index};
}
