import os
from pathlib import Path
ROOT = Path(__file__).resolve().parent
HOME = Path(os.environ.get("WORKBENCH_HOME", str(ROOT.parent / ".cache" / "userdata"))).resolve()
for directory in ("projects", "assets", "jobs", "models", "logs"):
    (HOME / directory).mkdir(parents=True, exist_ok=True)

def safe_path(root: Path, relative: str) -> Path:
    path = (root / relative).resolve()
    if not path.is_relative_to(root.resolve()):
        raise ValueError("文件路径超出工程目录")
    return path

def project_root(project_id: str) -> Path:
    from uuid import UUID
    UUID(project_id)
    return HOME / "projects" / project_id

def ffmpeg_path() -> str:
    location = os.environ.get("WORKBENCH_FFMPEG")
    if location and Path(location).is_file(): return location
    bundled = ROOT.parent / "vendor" / "ffmpeg.exe"
    if bundled.is_file(): return str(bundled)
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()
