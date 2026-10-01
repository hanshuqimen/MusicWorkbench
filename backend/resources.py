import json, os, shutil, time
from pathlib import Path
import requests
from .config import HOME, ROOT
from .audio import fingerprint

def manifest():
    return json.loads((ROOT/"assets.json").read_text("utf-8"))

def asset_path(asset):
    return HOME / ("assets" if asset["id"]=="generaluser" else "models") / asset["file"]

def status():
    result=[{**a,"ready":asset_path(a).is_file() and asset_path(a).stat().st_size==a["size"]} for a in manifest()]
    from . import gpu_runtime
    if gpu_runtime.needed(): result += [{**a,"ready":gpu_runtime.installed()} for a in gpu_runtime.manifest()]
    return result

def initialize(emit,enable_gpu=True):
    for asset in manifest():
        download_asset(asset,asset_path(asset),emit)
    from . import gpu_runtime
    if enable_gpu and gpu_runtime.needed() and not gpu_runtime.installed():
        wheels=[]
        for asset in gpu_runtime.manifest():
            path=HOME/"models"/asset["file"]
            download_asset(asset,path,emit);wheels.append(path)
        gpu_runtime.activate(wheels,emit)
    return {"assets":status()}

def download_asset(asset,path,emit):
        if path.exists() and fingerprint(path)==asset["sha256"]:
            emit(stage=f'{asset["file"]} 已校验',downloaded=asset["size"],total=asset["size"])
            return
        bundled=ROOT.parent/"vendor"/asset["file"]
        if bundled.exists() and fingerprint(bundled)==asset["sha256"]:
            shutil.copy2(bundled,path)
            emit(stage=f'{asset["file"]} 已安装',downloaded=asset["size"],total=asset["size"])
            return
        part=path.with_suffix(path.suffix+".part")
        offset=part.stat().st_size if part.exists() else 0
        if offset>=asset["size"]: part.unlink(); offset=0
        emit(stage=f'下载 {asset["file"]}',downloaded=offset,total=asset["size"])
        with requests.get(asset["url"],headers={"Range":f"bytes={offset}-"} if offset else {},
                          stream=True,timeout=(20,90)) as response:
            response.raise_for_status()
            if offset and response.status_code!=206: offset=0
            mode="ab" if offset else "wb"
            last=0
            with part.open(mode) as out:
                for chunk in response.iter_content(1024*256):
                    out.write(chunk); offset+=len(chunk)
                    if time.monotonic()-last>.2:
                        emit(stage=f'下载 {asset["file"]}',downloaded=offset,total=asset["size"])
                        last=time.monotonic()
        if part.stat().st_size!=asset["size"] or fingerprint(part)!=asset["sha256"]:
            part.unlink(missing_ok=True)
            raise ValueError(f'{asset["file"]} 校验失败，请重试或导入离线资源')
        os.replace(part,path)

def get_asset(ident):
    asset=next(a for a in manifest() if a["id"]==ident)
    path=asset_path(asset)
    if not path.exists(): raise ValueError(f'{asset["file"]} 尚未初始化，请完成资源下载')
    if fingerprint(path)!=asset["sha256"]: raise ValueError(f'{asset["file"]} 校验失败，请重新初始化')
    return path

def import_pack(source):
    import zipfile
    from .config import safe_path
    with zipfile.ZipFile(source) as z:
        for asset in manifest():
            info=z.getinfo(asset["file"])
            if info.file_size!=asset["size"]: raise ValueError("离线资源大小不匹配")
            path=asset_path(asset)
            temp=path.with_suffix(path.suffix+".part")
            with z.open(info) as inp,temp.open("wb") as out: shutil.copyfileobj(inp,out,1024*1024)
            if fingerprint(temp)!=asset["sha256"]:
                temp.unlink(missing_ok=True)
                raise ValueError("离线资源校验失败")
            os.replace(temp,path)
        from . import gpu_runtime
        gpu_assets=gpu_runtime.manifest()
        if all(a["file"] in z.namelist() for a in gpu_assets):
            wheels=[]
            for asset in gpu_assets:
                info=z.getinfo(asset["file"])
                if info.file_size!=asset["size"]: raise ValueError("GPU 离线资源大小不匹配")
                path=HOME/"models"/asset["file"]
                with z.open(info) as inp,path.open("wb") as out: shutil.copyfileobj(inp,out,1024*1024)
                if fingerprint(path)!=asset["sha256"]: path.unlink();raise ValueError("GPU 离线资源校验失败")
                wheels.append(path)
            gpu_runtime.activate(wheels,lambda **kw:None)
    return status()
