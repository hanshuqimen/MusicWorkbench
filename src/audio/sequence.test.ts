import {describe,it,expect} from 'vitest';
import {parseSequence} from './sequence';
import {keyPitch} from './keymap';
import {playableInstruments} from '../types';
const options={instrument:'piano' as const,octave:4,frets:[0,2,2,0,0,0],bpm:120,division:8,velocity:90};
describe('real keyboard command events',()=>{
 it('matches live mapping and seconds for ASDFDGS',()=>{const s=parseSequence('ASDFDGS',options);expect(s.notes.map(n=>n.pitch)).toEqual([60,62,64,65,64,67,62]);expect(s.notes.map(n=>n.start)).toEqual([0,.25,.5,.75,1,1.25,1.5]);expect(s.duration).toBe(1.75)});
 it('parses chords, rests, case, whitespace and duplicate keys',()=>{const s=parseSequence(' [aAD] - . , f ',options);expect(s.steps.map(n=>n.keys)).toEqual(['A+D','—','—','F']);expect(s.notes.map(n=>n.pitch)).toEqual([60,64,65]);expect(s.notes.at(-1)?.start).toBe(.75)});
 it('uses current guitar frets and drums, rejects muted and wrong keys',()=>{expect(parseSequence('AS',{...options,instrument:'guitar'}).notes.map(n=>[n.pitch,n.string])).toEqual([[40,0],[47,1]]);expect(parseSequence('AS',{...options,instrument:'drums'}).notes.map(n=>n.pitch)).toEqual([36,38]);expect(()=>parseSequence('G',{...options,instrument:'bass'})).toThrow('无法弹奏');expect(()=>parseSequence('A',{...options,instrument:'guitar',frets:[-1,0,0,0,0,0]})).toThrow('取消静音')});
 it('supports all additional instruments and rejects invalid grammar and limits',()=>{for(const instrument of playableInstruments)expect(keyPitch('a',instrument,4,options.frets)?.pitch).toBeGreaterThan(0);for(const text of ['[AD','[]','A]','---','XYZ'])expect(()=>parseSequence(text,options)).toThrow();expect(()=>parseSequence('A'.repeat(2001),options)).toThrow();expect(()=>parseSequence('A'.repeat(500),{...options,bpm:20,division:4})).toThrow('10 分钟');expect(()=>parseSequence('A',{...options,bpm:NaN})).toThrow()});
});
