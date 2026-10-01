import type {Effects,Track} from '../types';
function distortionCurve(amount:number){
 const curve=new Float32Array(2048);const k=amount*50;
 for(let i=0;i<curve.length;i++){const x=2*i/(curve.length-1)-1;curve[i]=k?(1+k)*x/(1+k*Math.abs(x)):x}
 return curve;
}
export class AudioBus {
 input:GainNode;output:GainNode;pan:StereoPannerNode;
 private low:BiquadFilterNode;private mid:BiquadFilterNode;private high:BiquadFilterNode;
 private compressor:DynamicsCompressorNode;private distortion:WaveShaperNode;
 private echo:GainNode;private chorusWet:GainNode;private verbWet:GainNode;
 private lfo:OscillatorNode;private nodes:AudioNode[]=[];
 constructor(private context:BaseAudioContext,destination:AudioNode,track:Track){
  const c=context;this.input=c.createGain();this.output=c.createGain();this.pan=c.createStereoPanner();
  this.low=c.createBiquadFilter();this.low.type='lowshelf';this.low.frequency.value=180;
  this.mid=c.createBiquadFilter();this.mid.type='peaking';this.mid.frequency.value=1100;this.mid.Q.value=.7;
  this.high=c.createBiquadFilter();this.high.type='highshelf';this.high.frequency.value=4500;
  this.compressor=c.createDynamicsCompressor();this.compressor.knee.value=12;
  this.distortion=c.createWaveShaper();this.distortion.oversample='2x';
  this.input.connect(this.low).connect(this.mid).connect(this.high).connect(this.compressor).connect(this.distortion);
  const dry=c.createGain();this.distortion.connect(dry).connect(this.pan);
  const delay=c.createDelay(2);delay.delayTime.value=.29;
  const feedback=c.createGain();feedback.gain.value=.28;
  this.echo=c.createGain();this.distortion.connect(delay).connect(this.echo).connect(this.pan);delay.connect(feedback).connect(delay);
  const chorus=c.createDelay(.1);chorus.delayTime.value=.018;
  const depth=c.createGain();depth.gain.value=.004;
  this.lfo=c.createOscillator();this.lfo.frequency.value=.8;this.lfo.connect(depth).connect(chorus.delayTime);this.lfo.start();
  this.chorusWet=c.createGain();this.distortion.connect(chorus).connect(this.chorusWet).connect(this.pan);
  const convolver=c.createConvolver();const impulse=c.createBuffer(2,Math.round(c.sampleRate*1.5),c.sampleRate);
  let seed=42;
  for(let channel=0;channel<2;channel++){const data=impulse.getChannelData(channel);for(let i=0;i<data.length;i++){
   seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=(seed/4294967296*2-1)*Math.pow(1-i/data.length,2.5);
  }}convolver.buffer=impulse;
  this.verbWet=c.createGain();this.distortion.connect(convolver).connect(this.verbWet).connect(this.pan);
  this.pan.connect(this.output).connect(destination);
  this.nodes=[this.input,this.output,this.pan,this.low,this.mid,this.high,this.compressor,this.distortion,dry,delay,feedback,this.echo,chorus,depth,this.chorusWet,convolver,this.verbWet];
  this.update(track,true);
 }
 update(track:Track,audible:boolean){
  const e=track.effects,b=e.bypass;const c=this.context.currentTime;
  this.output.gain.setTargetAtTime(audible?track.gain:0,c,.008);
  this.pan.pan.setTargetAtTime(track.pan,c,.008);
  this.low.gain.value=b?0:e.low;this.mid.gain.value=b?0:e.mid;this.high.gain.value=b?0:e.high;
  this.compressor.threshold.value=b||!e.compression?0:-12-e.compression*18;
  this.compressor.ratio.value=b?1:1+e.compression*7;
  this.distortion.curve=distortionCurve(b?0:e.distortion);
  this.echo.gain.value=b?0:e.delay*.45;this.chorusWet.gain.value=b?0:e.chorus*.4;this.verbWet.gain.value=b?0:e.reverb*.5;
 }
 dispose(){this.lfo.stop();for(const node of this.nodes)node.disconnect();}
}
export function audibleTracks(tracks:Track[]){const solo=tracks.some(t=>t.solo);return tracks.filter(t=>!t.mute&&(!solo||t.solo))}
