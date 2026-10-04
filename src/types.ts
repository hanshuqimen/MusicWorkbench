export type Instrument='piano'|'guitar'|'bass'|'drums'|'electricPiano'|'organ'|'violin'|'cello'|'flute'|'sax'|'trumpet'|'accordion'|'harp'|'koto'|'shamisen'|'bagpipe'|'vocals'|'other';
export interface NoteEvent {id:string;pitch:number;start:number;duration:number;velocity:number;string?:number|null}
export interface ControlEvent {time:number;controller:number;value:number}
export interface PerformanceSettings {octave:number;velocity:number;frets:number[]}
export interface SequenceInput {text:string;bpm:number;division:4|8|16;loop:boolean;start:number;noteIds:string[]}
export interface ArrangementSettings {preset:StylePreset;strength:number;seed:number}
export interface Effects {bypass:boolean;low:number;mid:number;high:number;compression:number;distortion:number;chorus:number;delay:number;reverb:number}
export interface Track {id:string;name:string;instrument:Instrument;mode:'audio'|'notes';asset:string|null;originalAsset:string|null;program:number;soundBank:string;notes:NoteEvent[];sourceNotes:NoteEvent[];controls:ControlEvent[];gain:number;pan:number;mute:boolean;solo:boolean;selected:boolean;estimated:boolean;effects:Effects;color:string;timbre:string;style:string|null;performance?:PerformanceSettings;sequence?:SequenceInput|null;arrangement?:ArrangementSettings|null}
export interface TempoPoint {time:number;bpm:number}
export interface Chord {start:number;end:number;root:number;quality:string}
export interface Project {schemaVersion:1;id:string;name:string;duration:number;bpm:number;key:string;meter:string;tempoMap:TempoPoint[];beats:number[];chords:Chord[];original:string|null;leadTrackId:string|null;tracks:Track[];history:Record<string,unknown>[]}
export interface StylePreset {id:'chinese'|'japanese'|'scottish'|'russian'|'jazz'|'blues'|'rock'|'bossa'|'waltz'|'ambient';name:string;description?:string;programs:Record<string,number>;timbres:Record<string,string>;ornament:number;density:number;swing:number}
export interface Asset {id:string;file:string;url:string;size:number;sha256:string;ready:boolean;license:string}
export interface JobResult {project?:Project;preview?:boolean;start?:number;end?:number;device?:string;detail?:string}
export interface JobStatus {id:string;kind:string;state:'queued'|'running'|'succeeded'|'failed'|'cancelled';stage:string;error?:string;warning?:string;device?:string;completed?:number;downloaded?:number;total?:number;result?:JobResult}
export interface Health {status:string;assets:Asset[];recovery:boolean}
export interface Font {id:string;name:string}
export interface Workbench {
 api<T=unknown>(route:string,body?:unknown,method?:string):Promise<T>;
 readAudio(id:string,asset:string):Promise<Uint8Array>;
 readFont(id:string):Promise<Uint8Array>;
 importAudio(file?:File):Promise<Project|null>;
 openProject():Promise<Project|null>;
 saveProject(project:Project):Promise<{path:string}|null>;
 exportMidi(project:Project,ids?:string[]):Promise<{path:string;tracks:number}|null>;
 exportAudio(data:Uint8Array,format:'wav'|'mp3',name:string):Promise<{path:string}|null>;
 importPack():Promise<Asset[]|null>;
 importFont():Promise<Font|null>;
 logs():Promise<{path:string}|null>;
 restart():Promise<boolean>;
 uninstall():Promise<{started:boolean;portable:boolean}>;
 onBackendExit(fn:(code:number)=>void):()=>void;
}
declare global {interface Window {workbench:Workbench}}
export const labels:Record<Instrument,string>={piano:'钢琴',guitar:'吉他',bass:'贝斯',drums:'鼓',electricPiano:'电钢琴',organ:'风琴',violin:'小提琴',cello:'大提琴',flute:'长笛',sax:'萨克斯',trumpet:'小号',accordion:'手风琴',harp:'竖琴',koto:'筝',shamisen:'三味线',bagpipe:'风笛',vocals:'人声',other:'其他'};
export const playableInstruments:Instrument[]=['piano','guitar','bass','drums','electricPiano','organ','violin','cello','flute','sax','trumpet','accordion','harp','koto','shamisen','bagpipe'];
export function isKeyboardInstrument(instrument:Instrument){return playableInstruments.includes(instrument)&&!['guitar','bass','drums'].includes(instrument)}
export function defaultPerformance(instrument:Instrument):PerformanceSettings {return {octave:4,velocity:90,frets:instrument==='bass'?[0,0,2,2]:[0,2,2,0,0,0]}}
export const instrumentPrograms:Record<Instrument,number>={piano:0,guitar:24,bass:33,drums:0,electricPiano:4,organ:19,violin:40,cello:42,flute:73,sax:65,trumpet:56,accordion:21,harp:46,koto:107,shamisen:106,bagpipe:109,vocals:53,other:0};
export const defaultEffects:Effects={bypass:false,low:0,mid:0,high:0,compression:0,distortion:0,chorus:0,delay:0,reverb:0};
export const instrumentColors:Record<Instrument,string>={piano:'#baa6ff',guitar:'#f2bc79',bass:'#74b3f5',drums:'#ef8b9d',electricPiano:'#b4a0df',organ:'#b7c58e',violin:'#f0aa7d',cello:'#c99075',flute:'#85d6c0',sax:'#e0c776',trumpet:'#efca82',accordion:'#9fbcea',harp:'#d1b7e9',koto:'#c6cba0',shamisen:'#f3bd96',bagpipe:'#8bcac4',vocals:'#72d7c2',other:'#a7b3d0'};
export function newTrack(instrument:Instrument):Track {
 return {id:crypto.randomUUID(),name:labels[instrument],instrument,mode:'notes',asset:null,originalAsset:null,
 program:instrumentPrograms[instrument],soundBank:'generaluser',notes:[],sourceNotes:[],controls:[],gain:.8,pan:0,mute:false,solo:false,selected:false,estimated:false,effects:{...defaultEffects},color:instrumentColors[instrument],timbre:['koto','shamisen','bagpipe'].includes(instrument)?'GeneralUser GS · GM '+labels[instrument]+'采样近似音色':'GeneralUser GS · '+labels[instrument],style:null,performance:defaultPerformance(instrument),sequence:null,arrangement:null};
}
export function formatTime(time:number){const n=Math.max(0,time);return Math.floor(n/60).toString().padStart(2,'0')+':'+(n%60).toFixed(1).padStart(4,'0')}
