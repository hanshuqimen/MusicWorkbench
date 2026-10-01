import json, sys, traceback
from pathlib import Path
from .models import JobRequest, Project
from .storage import atomic_json
from .resources import initialize
from .inference import separate, transcribe_track, analyze_audio, inference_selftest
from .arrangement import arrange_track,estimate_chords,arrangement_role
from .config import project_root

def emit(**data):
    print(json.dumps(data,ensure_ascii=False),flush=True)

def execute(payload):
    request=JobRequest.model_validate(payload["request"])
    if request.kind=="initialize": return initialize(emit,enable_gpu=request.device!="cpu")
    if request.kind=="selftest":
        return inference_selftest(emit,request.device)
    project=Project.model_validate(payload["project"])
    if request.kind=="separate":
        if not project.original: raise ValueError("请先导入音频")
        project.tracks,device=separate(project,request,emit)
        project.bpm,project.beats,project.key=analyze_audio(project_root(project.id)/project.original,emit)
        from .models import TempoPoint
        # Keep actual beat positions separately; absolute note timing is never rescaled.
        project.tempoMap=[TempoPoint(time=0,bpm=project.bpm)]
        return {"project":project.model_dump(),"device":device}
    ids=set(request.trackIds)
    if not ids: raise ValueError("请至少选择一条乐器轨")
    selected=[t for t in project.tracks if t.id in ids]
    if len(selected)!=len(ids): raise ValueError("选中的音轨已不存在")
    if any(t.instrument in ("vocals","other") for t in selected):
        raise ValueError("人声与其他混合轨支持原声和效果处理；请选择钢琴、吉他、贝斯或鼓进行编配")
    for i,track in enumerate(selected):
        source=transcribe_track(track,project,emit)
        track.sourceNotes=[n.model_copy(deep=True) for n in source]
        track.notes=[n.model_copy(deep=True) for n in source]
        emit(stage=f"已识别 {track.name}",completed=i+1,total=len(selected))
    if request.kind=="transcribe": return {"project":project.model_dump()}
    if not request.style: raise ValueError("请选择演奏风格")
    if request.end<=request.start: raise ValueError("预览结束位置必须晚于起点")
    harmonic=[n for t in project.tracks if arrangement_role(t.instrument) in ("piano","guitar") and t.instrument not in ("vocals","other") for n in (t.sourceNotes or t.notes)]
    project.chords=estimate_chords(harmonic,project.bpm,project.duration,project.key)
    if not project.leadTrackId:
        candidates=[t for t in selected if arrangement_role(t.instrument) in ("piano","guitar")]
        if candidates: project.leadTrackId=max(candidates,key=lambda t:np_mean([n.pitch for n in t.notes])).id
    for i,track in enumerate(project.tracks):
        if track.id in ids:
            project.tracks[i]=arrange_track(track,request.style,request.strength,project.bpm,
                request.seed+i,project.duration,track.id==project.leadTrackId,project.chords)
    project.history.append({"style":request.style.model_dump(),"strength":request.strength,"seed":request.seed,"tracks":list(ids)})
    project.history=project.history[-100:]
    return {"project":project.model_dump(),"preview":request.preview,"start":request.start,
            "end":min(request.end,project.duration)}

def np_mean(values): return sum(values)/max(1,len(values))

if __name__=="__main__":
    payload_path=Path(sys.argv[1])
    try:
        payload=json.loads(payload_path.read_text("utf-8"))
        result=execute(payload)
        atomic_json(payload_path.parent/"result.json",result)
        emit(stage="任务完成",done=True)
    except Exception as error:
        traceback.print_exc(file=sys.stderr)
        emit(error=str(error))
        sys.exit(1)
