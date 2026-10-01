from pathlib import Path
import mido
from .models import Project

def seconds_to_ticks(seconds, tempo_map, ticks=480):
    result=0.0
    ordered=sorted(tempo_map,key=lambda x:x.time)
    if not ordered or ordered[0].time!=0: raise ValueError("节拍映射必须从 0 秒开始")
    for i,point in enumerate(ordered):
        end=ordered[i+1].time if i+1<len(ordered) else seconds
        elapsed=max(0,min(seconds,end)-point.time)
        result+=elapsed*point.bpm/60*ticks
        if seconds<=end: break
    return round(result)

def export_midi(project: Project, target: str, track_ids=None):
    mid=mido.MidiFile(type=1,ticks_per_beat=480,charset="utf-8")
    meta=mido.MidiTrack()
    mid.tracks.append(meta)
    previous=0
    tempo=sorted(project.tempoMap,key=lambda x:x.time)
    for point in tempo:
        tick=seconds_to_ticks(point.time,tempo)
        meta.append(mido.MetaMessage("set_tempo",tempo=mido.bpm2tempo(point.bpm),time=tick-previous))
        previous=tick
    num,den=map(int,project.meter.split("/"))
    meta.insert(0,mido.MetaMessage("time_signature",numerator=num,denominator=den,time=0))
    channel=0
    for track in project.tracks:
        if track.mode!="notes" or (track_ids and track.id not in track_ids): continue
        if track.instrument=="drums": ch=9
        else:
            if channel==9: channel+=1
            ch=channel
            channel+=1
        if ch>15: raise ValueError("MIDI 最多支持 15 条旋律音轨和鼓通道，请分别导出音轨")
        output=mido.MidiTrack()
        mid.tracks.append(output)
        output.append(mido.MetaMessage("track_name",name=track.name,time=0))
        output.append(mido.Message("program_change",channel=ch,program=track.program,time=0))
        events=[]
        for n in track.notes:
            events.append((seconds_to_ticks(n.start,tempo),1,mido.Message("note_on",channel=ch,note=n.pitch,velocity=n.velocity)))
            events.append((seconds_to_ticks(n.start+n.duration,tempo),0,mido.Message("note_off",channel=ch,note=n.pitch,velocity=0)))
        for control in track.controls:
            events.append((seconds_to_ticks(control.time,tempo),0,mido.Message("control_change",channel=ch,control=control.controller,value=control.value)))
        previous=0
        for tick,order,msg in sorted(events,key=lambda x:(x[0],x[1])):
            output.append(msg.copy(time=max(0,tick-previous)))
            previous=tick
        output.append(mido.Message("control_change",channel=ch,control=64,value=0,time=1))
    path=Path(target)
    temp=path.with_suffix(path.suffix+".tmp")
    try:
        mid.save(str(temp))
        temp.replace(path)
    finally:
        temp.unlink(missing_ok=True)
    return {"path":str(path),"tracks":len(mid.tracks)-1}
