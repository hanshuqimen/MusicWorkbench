"""Optional, pinned GPU wheels; the packaged base runtime stays CPU-capable."""
import json, os, shutil, subprocess, sys, zipfile
from functools import lru_cache
from importlib.metadata import version
from .config import HOME, ROOT, safe_path

SITE = HOME / "gpu" / "site-packages"
MARKER = HOME / "gpu" / "ready.json"

def manifest():
    return json.loads((ROOT / "gpu-assets.json").read_text("utf-8"))

def installed():
    try:
        return json.loads(MARKER.read_text("utf-8")) == {a["id"]:a["sha256"] for a in manifest()} and (SITE / "torch" / "__init__.py").exists()
    except (OSError, ValueError): return False

@lru_cache(maxsize=1)
def needed():
    if os.environ.get("WORKBENCH_DISABLE_GPU_DOWNLOAD")=="1": return False
    if sys.platform != "win32" or "+cu128" in version("torch"): return False
    try:
        result = subprocess.run(["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"], capture_output=True, timeout=10,
                                creationflags=getattr(subprocess,"CREATE_NO_WINDOW",0))
        return result.returncode == 0 and bool(result.stdout.strip())
    except (OSError, subprocess.TimeoutExpired): return False

def install_wheel(path, package, site=SITE):
    """Extract only package files. No entrypoints or wheel-supplied installer runs."""
    site.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path) as archive:
        for info in archive.infolist():
            if info.is_dir(): continue
            first=info.filename.split("/")[0]
            if first != package and not first.startswith(package+"-"): continue
            if first != package and not first.endswith(".dist-info"): continue
            if info.filename.endswith((".lib", ".pdb", ".h", ".hpp")): continue
            target=safe_path(site, info.filename)
            target.parent.mkdir(parents=True, exist_ok=True)
            temp=target.with_suffix(target.suffix+".install")
            with archive.open(info) as inp, temp.open("wb") as out: shutil.copyfileobj(inp,out,1024*1024)
            os.replace(temp,target)

def activate(wheels, emit):
    MARKER.unlink(missing_ok=True)
    for path, package in zip(wheels, ("torch","torchaudio")):
        emit(stage="安装 GPU 运行组件："+package)
        install_wheel(path, package)
    from .storage import atomic_json
    atomic_json(MARKER,{a["id"]:a["sha256"] for a in manifest()})

def worker_environment():
    env=os.environ.copy()
    if installed(): env["PYTHONPATH"]=str(SITE)+os.pathsep+env.get("PYTHONPATH","")
    return env
