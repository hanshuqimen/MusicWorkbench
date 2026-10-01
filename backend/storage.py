import json, os, shutil, zipfile
from pathlib import Path
from uuid import uuid4
from .config import HOME, project_root, safe_path
from .models import Project

def atomic_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + "." + str(uuid4()) + ".tmp")
    try:
        temp.write_text(json.dumps(data, ensure_ascii=False, allow_nan=False), encoding="utf-8")
        os.replace(temp, path)
    finally: temp.unlink(missing_ok=True)

def save_project(project: Project):
    root = project_root(project.id)
    root.mkdir(parents=True, exist_ok=True)
    for asset in [project.original] + [a for t in project.tracks for a in (t.asset,t.originalAsset)]:
        if asset: safe_path(root, asset)
    atomic_json(root / "project.json", project.model_dump())
    atomic_json(HOME / "recovery.json", {"id": project.id})
    return project

def load_project(project_id):
    return Project.model_validate_json((project_root(project_id) / "project.json").read_text("utf-8"))

def archive_project(project: Project, target: str):
    save_project(project)
    root = project_root(project.id)
    assets = {project.original} | {a for t in project.tracks for a in (t.asset,t.originalAsset)}
    dest = Path(target)
    temp = dest.with_suffix(dest.suffix+".tmp")
    try:
        with zipfile.ZipFile(temp, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=1) as z:
            z.writestr("project.json",project.model_dump_json())
            for asset in assets - {None}:
                source = safe_path(root,asset)
                if not source.is_file(): raise ValueError(f"工程资源缺失：{asset}")
                z.write(source,asset)
            for bank in {t.soundBank for t in project.tracks}-{ "generaluser" }:
                from uuid import UUID
                UUID(bank)
                font=HOME/"assets"/(bank+".sf2")
                if not font.exists(): raise ValueError("工程扩展音源缺失："+bank)
                z.write(font,"fonts/"+bank+".sf2")
        os.replace(temp,dest)
    finally:
        temp.unlink(missing_ok=True)
    return {"path":str(dest)}

def open_archive(source: str):
    source = Path(source)
    if source.stat().st_size > 6 * 1024**3: raise ValueError("工程包超过 6 GB")
    new_id = str(uuid4())
    root = project_root(new_id)
    try:
        with zipfile.ZipFile(source) as z:
            members = z.infolist()
            if len(members)>1000 or sum(m.file_size for m in members)>8*1024**3:
                raise ValueError("工程解压大小或文件数超出限制")
            info = z.getinfo("project.json")
            if info.file_size>64*1024**2: raise ValueError("工程描述过大")
            project = Project.model_validate_json(z.read("project.json"))
            assets = {project.original} | {a for t in project.tracks for a in (t.asset,t.originalAsset)}
            # Only extract referenced assets, never arbitrary ZIP members or symlinks.
            root.mkdir(parents=True,exist_ok=True)
            for asset in assets - {None}:
                dest = safe_path(root,asset)
                if not asset.startswith("audio/") or dest.suffix.lower() != ".wav":
                    raise ValueError("工程音频资源格式不合法")
                dest.parent.mkdir(parents=True,exist_ok=True)
                with z.open(asset) as inp, dest.open("wb") as out:
                    shutil.copyfileobj(inp,out,1024*1024)
            project.id=new_id
            for bank in {t.soundBank for t in project.tracks}-{ "generaluser" }:
                from uuid import UUID
                UUID(bank)
                info=z.getinfo("fonts/"+bank+".sf2")
                if info.file_size>512*1024**2: raise ValueError("工程音源超过 512 MB")
                data=z.read(info)
                if data[:4]!=b"RIFF" or data[8:12]!=b"sfbk": raise ValueError("工程音源格式无效")
                font=HOME/"assets"/(bank+".sf2")
                if font.exists() and font.read_bytes()!=data:
                    replacement=str(uuid4())
                    for track in project.tracks:
                        if track.soundBank==bank: track.soundBank=replacement
                    font=HOME/"assets"/(replacement+".sf2")
                font.write_bytes(data)
            return save_project(project)
    except Exception:
        shutil.rmtree(root,ignore_errors=True)
        raise
