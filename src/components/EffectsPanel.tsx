import type {Track,Effects} from '../types';
import {SlidersHorizontal} from 'lucide-react';
export default function EffectsPanel({track,onChange}:{track:Track;onChange:(effects:Effects)=>void}){
 const fields:{key:keyof Omit<Effects,'bypass'>;name:string;min:number;max:number;step:number}[]=[
 {key:'low',name:'低频',min:-18,max:18,step:.5},{key:'mid',name:'中频',min:-18,max:18,step:.5},{key:'high',name:'高频',min:-18,max:18,step:.5},
 ...(['compression','distortion','chorus','delay','reverb'] as const).map((key,i)=>({key,name:['压缩','失真','合唱','延迟','混响'][i],min:0,max:1,step:.01}))];
 return <details className="effects panel"><summary><SlidersHorizontal size={17}/>音轨效果器<span className="muted">{track.name}</span></summary><div className="effects-content"><label className="checkbox"><input type="checkbox" checked={track.effects.bypass} onChange={e=>onChange({...track.effects,bypass:e.target.checked})}/>旁路全部效果</label>{fields.map(f=><label className="effect-control" key={f.key}><span>{f.name}</span><input disabled={track.effects.bypass} type="range" min={f.min} max={f.max} step={f.step} value={track.effects[f.key]} onChange={e=>onChange({...track.effects,[f.key]:+e.target.value})}/><span className="mono">{f.max===1?Math.round(track.effects[f.key]*100)+'%':track.effects[f.key].toFixed(1)+' dB'}</span></label>)}</div></details>
}
