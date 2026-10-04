import contextlib, json, os, secrets, socket, sys, zipfile
from pathlib import Path
from uuid import uuid4
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware
from pydantic import Field
from .config import HOME, ROOT, safe_path, project_root
from .models import Model, Project, JobRequest
from .storage import save_project, load_project, archive_project, open_archive, atomic_json
from .audio import import_audio, peaks, ffmpeg
from .resources import status, get_asset, import_pack
from .presets import PRESETS
from .midi import export_midi
from .jobs import JobManager

TOKEN=os.environ.get("WORKBENCH_TOKEN") or secrets.token_urlsafe(32)
manager=JobManager()

@contextlib.asynccontextmanager
async def lifespan(app):
    yield
    manager.shutdown()

app=FastAPI(docs_url=None,redoc_url=None,openapi_url=None,lifespan=lifespan)
app.add_middleware(TrustedHostMiddleware,allowed_hosts=["127.0.0.1","localhost","testserver"])

@app.middleware("http")
async def authenticate(request: Request,call_next):
    if not secrets.compare_digest(request.headers.get("x-workbench-token",""),TOKEN):
        return JSONResponse({"detail":"本机服务访问未授权"},status_code=401)
    if int(request.headers.get("content-length","0"))>64*1024**2:
        return JSONResponse({"detail":"请求过大"},status_code=413)
    try: return await call_next(request)
    except (ValueError,FileNotFoundError,KeyError) as error:
        return JSONResponse({"detail":str(error)},status_code=400)

class FileInput(Model):
    path: str = Field(min_length=1,max_length=32760)
class SaveInput(FileInput):
    project: Project
class MidiInput(SaveInput):
    trackIds: list[str] | None = None
class EncodeInput(FileInput):
    source: str
    format: str = Field(pattern="^(wav|mp3)$")

@app.get("/health")
def health():
    return {"status":"ok","version":"0.3.0","assets":status(),"recovery":(HOME/"recovery.json").exists()}

@app.get("/presets")
def presets(): return PRESETS

@app.post("/projects/new")
def new_project(): return save_project(Project())

@app.get("/projects/recovery")
def recovery():
    try: return load_project(json.loads((HOME/"recovery.json").read_text("utf-8"))["id"])
    except (ValueError,KeyError,FileNotFoundError): return None

@app.get("/projects/{ident}")
def get_project(ident: str): return load_project(ident)

@app.put("/projects/{ident}")
def update_project(ident: str,project: Project):
    if ident!=project.id: raise ValueError("工程编号不匹配")
    return save_project(project)

@app.post("/files/import")
def do_import(body: FileInput): return save_project(import_audio(body.path))

@app.post("/files/open")
def do_open(body: FileInput): return open_archive(body.path)

@app.post("/files/save")
def do_save(body: SaveInput): return archive_project(body.project,body.path)

@app.post("/files/midi")
def do_midi(body: MidiInput): return export_midi(body.project,body.path,body.trackIds)

@app.post("/files/encode")
def do_encode(body: EncodeInput):
    source=safe_path(HOME/"exports",body.source)
    if not source.is_file() or source.suffix!=".wav": raise ValueError("导出临时音频不存在")
    target=Path(body.path)
    tmp=target.with_name(target.stem+".workbench-part"+target.suffix)
    try:
        codec=["-c:a","pcm_s24le"] if body.format=="wav" else ["-c:a","libmp3lame","-b:a","320k"]
        ffmpeg(["-y","-i",str(source),"-af","alimiter=limit=0.89125:level=false:latency=true",*codec,str(tmp)],timeout=300)
        os.replace(tmp,target)
    finally:
        tmp.unlink(missing_ok=True)
        source.unlink(missing_ok=True)
    return {"path":str(target)}

@app.post("/files/pack")
def do_pack(body: FileInput): return import_pack(body.path)

@app.post("/files/soundfont")
def do_font(body: FileInput):
    import shutil
    path=Path(body.path)
    if path.suffix.lower()!=".sf2" or not path.is_file() or path.stat().st_size>512*1024**2:
        raise ValueError("请选择不超过 512 MB 的 SF2 文件")
    with path.open("rb") as f:
        header=f.read(12)
        if header[:4]!=b"RIFF" or header[8:12]!=b"sfbk": raise ValueError("不是有效的 SF2 文件")
    ident=str(uuid4())
    shutil.copy2(path,HOME/"assets"/f"{ident}.sf2")
    fonts_file=HOME/"fonts.json"
    fonts=json.loads(fonts_file.read_text("utf-8")) if fonts_file.exists() else []
    fonts.append({"id":ident,"name":path.stem})
    atomic_json(fonts_file,fonts)
    return fonts[-1]

@app.get("/fonts")
def fonts():
    file=HOME/"fonts.json"
    return json.loads(file.read_text("utf-8")) if file.exists() else []

@app.get("/fonts/{ident}")
def font(ident: str):
    if ident=="generaluser": path=get_asset("generaluser")
    else:
        from uuid import UUID
        UUID(ident); path=HOME/"assets"/f"{ident}.sf2"
    if not path.is_file(): raise HTTPException(404,"音源资源不存在")
    return FileResponse(path,media_type="application/octet-stream")

@app.get("/audio/{ident}/{asset:path}")
def audio_file(ident: str,asset: str):
    path=safe_path(project_root(ident),asset)
    if not asset.startswith("audio/") or path.suffix!=".wav": raise ValueError("音频资源路径无效")
    if not path.is_file(): raise HTTPException(404,"音频资源不存在")
    return FileResponse(path,media_type="audio/wav")

@app.get("/peaks/{ident}/{asset:path}")
def waveform(ident: str,asset: str):
    path=safe_path(project_root(ident),asset)
    if not asset.startswith("audio/") or path.suffix!=".wav": raise ValueError("音频资源路径无效")
    return peaks(path)

@app.post("/jobs")
def submit(body: JobRequest): return manager.submit(body)

@app.get("/jobs/{ident}")
def job(ident: str):
    if ident not in manager.jobs: raise HTTPException(404,"任务不存在")
    return manager.jobs[ident]

@app.post("/jobs/{ident}/cancel")
def cancel(ident: str): return manager.cancel(ident)

@app.post("/files/logs")
def logs(body: FileInput):
    with zipfile.ZipFile(body.path,"w",zipfile.ZIP_DEFLATED) as z:
        for root in (HOME/"jobs",HOME/"logs"):
            for file in root.rglob("*.log"): z.write(file,str(file.relative_to(HOME)))
        for root in (HOME/"projects",):
            for file in root.rglob("benchmark.json"): z.write(file,f"benchmarks/{file.parent.name}.json")
        z.writestr("system.json",json.dumps({"platform":sys.platform,"python":sys.version,"version":"0.1.0"}))
    return {"path":body.path}

def main():
    import uvicorn
    sock=socket.socket(socket.AF_INET,socket.SOCK_STREAM)
    sock.bind(("127.0.0.1",0)); sock.listen(128)
    print("WORKBENCH_READY "+json.dumps({"port":sock.getsockname()[1]}),flush=True)
    uvicorn.Server(uvicorn.Config(app,log_level="warning",access_log=False)).run(sockets=[sock])

if __name__=="__main__": main()
