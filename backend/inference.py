import contextlib, json, sys, time
from pathlib import Path
from uuid import uuid4
import numpy as np
import soundfile as sf
from .resources import get_asset
from .config import project_root, HOME
from .audio import fingerprint
from .models import NoteEvent, Track, TempoPoint
from .storage import atomic_json

def load_demucs(model_name):
    import torch
    from demucs.states import load_model
    path=get_asset("demucs6" if model_name=="htdemucs_6s" else "demucs4")
    # Only the SHA-256 pinned official checkpoint may use legacy pickle loading.
    package=torch.load(str(path),map_location="cpu",weights_only=False)
    model=load_model(package)
    model.eval()
    return model

def gpu_selftest(emit):
    import torch
    device="cpu"; detail=""
    if torch.cuda.is_available():
        try:
            # Run actual tensor operations, not just a driver visibility check.
            x=torch.randn(128,128,device="cuda")
            (x@x).sum().item()
            torch.cuda.synchronize()
            device="cuda"; detail=torch.cuda.get_device_name(0)
        except Exception as error: detail="GPU 自检失败，使用 CPU："+str(error)[:300]
    else: detail="CPU 模式（未发现可用 CUDA）"
    emit(stage=detail,device=device)
    return device,detail

def inference_selftest(emit,preferred="auto"):
    import torch
    from demucs.apply import apply_model
    device,detail=gpu_selftest(emit) if preferred=="auto" else ("cpu","CPU 模式")
    try: model=load_demucs("htdemucs_6s")
    except ValueError:
        return {"device":device,"detail":detail+" · 模型未就绪，仅完成设备检查"}
    for used in ([device,"cpu"] if device=="cuda" else ["cpu"]):
        try:
            emit(stage="实际模型推理自检 · "+used.upper(),device=used)
            model.to(used)
            with torch.no_grad():
                result=apply_model(model,torch.zeros(1,2,44100),device=used,split=True,segment=3,shifts=0,progress=False)
                if not torch.isfinite(result).all(): raise RuntimeError("推理自检产生无效音频")
            return {"device":used,"detail":(detail if used=="cuda" else "CPU")+" · 模型推理自检通过"}
        except RuntimeError as error:
            if used=="cpu": raise
            emit(stage="GPU 推理自检失败，切换 CPU",warning=str(error)[:300],device="cpu")
            model.cpu();torch.cuda.empty_cache()

def separate(project,request,emit):
    import torch
    from demucs.apply import apply_model
    root=project_root(project.id)
    source=root/project.original
    cache=root/f"separation-{request.model}-{request.seed}-v2.json"
    if cache.exists():
        try: result=json.loads(cache.read_text("utf-8"))
        except (ValueError,OSError): result={"fingerprint":None}
        if result["fingerprint"]==fingerprint(source) and all((root/t["asset"]).is_file() for t in result["tracks"]):
            emit(stage="复用已分离音轨")
            return [Track.model_validate(t) for t in result["tracks"]],result["device"]
    emit(stage="校验并加载分离模型")
    model=load_demucs(request.model)
    device,detail=gpu_selftest(emit) if request.device=="auto" else ("cpu","CPU 模式")
    audio,sr=sf.read(source,dtype="float32",always_2d=True)
    wav=torch.from_numpy(audio.T.copy())
    ref=wav.mean(0)
    mean=ref.mean(); std=ref.std().clamp(min=1e-8)
    normalized=(wav-mean)/std
    attempts=[(device,6),(device,3),("cpu",3)] if device=="cuda" else [("cpu",6)]
    last_error=None
    for used,segment in attempts:
        try:
            model.to(used)
            torch.manual_seed(request.seed)
            if used=="cuda": torch.cuda.reset_peak_memory_stats()
            emit(stage=f"分离音轨 · {used.upper()} · {segment} 秒分段",device=used)
            start=time.perf_counter()
            with torch.no_grad():
                stems=apply_model(model,normalized[None],device=used,split=True,segment=segment,
                                  overlap=.25,shifts=1,progress=False,num_workers=0)[0].cpu()*std+mean
            metrics={"device":used,"elapsed":time.perf_counter()-start,
                     "segment":segment,
                     "peakVRAM":torch.cuda.max_memory_allocated() if used=="cuda" else 0,
                     "duration":project.duration,"model":request.model}
            (root/"benchmark.json").write_text(json.dumps(metrics,indent=2),"utf-8")
            last_error=None; device=used; break
        except (torch.cuda.OutOfMemoryError,RuntimeError) as error:
            last_error=error
            if used=="cpu": raise
            emit(stage="GPU 处理失败，降低显存占用或切换 CPU",warning=str(error)[:250])
            model.cpu(); torch.cuda.empty_cache()
    if last_error: raise last_error
    names={"piano":"钢琴","guitar":"吉他","bass":"贝斯","drums":"鼓","vocals":"人声","other":"其他"}
    colors={"piano":"#baa6ff","guitar":"#f2bc79","bass":"#74b3f5","drums":"#ef8b9d","vocals":"#72d7c2","other":"#a7b3d0"}
    programs={"piano":0,"guitar":24,"bass":33,"drums":0,"vocals":53,"other":0}
    tracks=[]
    for index,instrument in enumerate(model.sources):
        relative=f"audio/{request.model}-{request.seed}-{instrument}.wav"
        sf.write(root/relative,stems[index].T.numpy(),sr,subtype="FLOAT")
        tracks.append(Track(name=names[instrument],instrument=instrument,mode="audio",asset=relative,
                            originalAsset=relative,program=programs[instrument],estimated=True,
                            color=colors[instrument],gain=1))
        emit(stage=f"保存 {names[instrument]} 音轨",completed=index+1,total=len(model.sources))
    atomic_json(cache,{"fingerprint":fingerprint(source),"tracks":[t.model_dump() for t in tracks],"device":device})
    return tracks,device

def analyze_audio(path,emit):
    import librosa
    emit(stage="分析速度、节拍与调性")
    y,sr=librosa.load(path,sr=22050,mono=True)
    if len(y)==0: return 120,[], "C"
    tempo,frames=librosa.beat.beat_track(y=y,sr=sr,trim=False)
    bpm=float(np.asarray(tempo).reshape(-1)[0])
    if bpm<20 or bpm>300 or not np.isfinite(bpm): bpm=120
    beat_times=librosa.frames_to_time(frames,sr=sr).tolist()
    chroma=librosa.feature.chroma_stft(y=y,sr=sr).mean(axis=1)
    major=np.array([6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88])
    minor=np.array([6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17])
    choices=[(float(np.dot(chroma,np.roll(profile,i))),i,suffix) for i in range(12) for profile,suffix in [(major,""),(minor,"m")]]
    _,root,suffix=max(choices)
    return bpm,beat_times,["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"][root]+suffix

def transcribe_track(track,project,emit):
    if track.sourceNotes: return track.sourceNotes
    if track.mode=="notes": return track.notes
    source=project_root(project.id)/(track.originalAsset or track.asset)
    digest=fingerprint(source)
    cache=HOME/"models"/f"notes-{digest}-{track.instrument}-v1.json"
    if cache.exists():
        try: return [NoteEvent.model_validate(n) for n in json.loads(cache.read_text("utf-8"))]
        except (ValueError,OSError): pass
    emit(stage=f"识别 {track.name} 的音符" if track.instrument!="drums" else "分析鼓击起点与频段")
    if track.instrument=="drums":
        import librosa
        y,sr=librosa.load(source,sr=22050)
        onset=librosa.onset.onset_detect(y=y,sr=sr,units="samples",backtrack=False)
        notes=[]
        for sample in onset:
            segment=y[sample:sample+int(sr*.05)]
            if len(segment)<64: continue
            spectrum=np.abs(np.fft.rfft(segment*np.hanning(len(segment))))
            freq=np.fft.rfftfreq(len(segment),1/sr)
            low=spectrum[freq<180].sum()
            high=spectrum[freq>4500].sum()
            mid=spectrum[(freq>=180)&(freq<=4500)].sum()
            pitch=36 if low>mid*.6 else (42 if high>mid*.45 else 38)
            notes.append(NoteEvent(pitch=pitch,start=float(sample/sr),duration=.09,
                                   velocity=int(np.clip(np.max(np.abs(segment))*220,35,127))))
    else:
        # Basic Pitch is deliberately installed without its TensorFlow dependency;
        # its published inference API loads the explicitly provided ONNX artifact.
        from basic_pitch.inference import predict, Model
        with contextlib.redirect_stdout(sys.stderr):
            _,_,events=predict(source,model_or_model_path=Model(get_asset("basicpitch")),
                               minimum_frequency=30 if track.instrument=="bass" else None)
        notes=[NoteEvent(pitch=int(pitch),start=max(0,float(start)),
                        duration=max(.01,min(float(end),project.duration)-max(0,float(start))),
                        velocity=int(np.clip(round(float(amplitude)*127),1,127)))
               for start,end,pitch,amplitude,_ in events if start<project.duration]
    atomic_json(cache,[n.model_dump() for n in notes])
    return notes
