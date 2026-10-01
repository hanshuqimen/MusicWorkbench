import hashlib, json, subprocess
from pathlib import Path
import numpy as np
import soundfile as sf
from .config import ffmpeg_path, project_root
from .models import Project, Track

CREATE_FLAGS = getattr(subprocess,"CREATE_NO_WINDOW",0)
def ffmpeg(args, timeout=180):
    result = subprocess.run([ffmpeg_path(),"-hide_banner","-loglevel","error","-nostdin",*args],
        capture_output=True,timeout=timeout,creationflags=CREATE_FLAGS)
    if result.returncode: raise ValueError("音频处理失败："+result.stderr.decode("utf-8","replace")[-1000:])
    return result

def import_audio(source: str):
    path=Path(source)
    if not path.is_file() or path.suffix.lower() not in (".wav",".mp3",".flac",".m4a"):
        raise ValueError("请选择 WAV、MP3、FLAC 或 M4A 文件")
    if path.stat().st_size>500*1024**2: raise ValueError("文件不能超过 500 MB")
    project=Project(name=path.stem[:160])
    root=project_root(project.id)
    (root/"audio").mkdir(parents=True,exist_ok=True)
    target=root/"audio"/"original.wav"
    ffmpeg(["-y","-i",str(path),"-t","601","-ar","44100","-ac","2","-c:a","pcm_f32le",str(target)])
    info=sf.info(target)
    if info.duration>600 or info.duration<=0:
        target.unlink(missing_ok=True)
        raise ValueError("音频时长必须大于 0 且不超过 10 分钟")
    project.duration=info.duration
    project.original="audio/original.wav"
    project.tracks=[Track(name="原始混音 · 分离后可选乐器",instrument="other",mode="audio",asset=project.original, gain=1,color="#a7b3d0")]
    return project

def fingerprint(path: Path):
    h=hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda:f.read(1024*1024),b""): h.update(block)
    return h.hexdigest()

def peaks(path: Path, count=1500):
    bins=[]
    with sf.SoundFile(path) as f:
        block=max(1,int(np.ceil(len(f)/count)))
        for data in f.blocks(blocksize=block):
            bins.append(float(np.max(np.abs(data))) if data.size else 0)
    return bins
