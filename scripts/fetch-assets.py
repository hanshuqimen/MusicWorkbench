"""Build-time resource lock. Downloads only official published assets."""
import hashlib,json,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
dest=ROOT/"vendor"
dest.mkdir(exist_ok=True)
sources=[
 ("generaluser","GeneralUser-GS.sf2","https://raw.githubusercontent.com/mrbumpy409/GeneralUser-GS/main/GeneralUser-GS.sf2","GeneralUser GS license"),
 ("basicpitch","basic-pitch.onnx","https://raw.githubusercontent.com/spotify/basic-pitch/main/basic_pitch/saved_models/icassp_2022/nmp.onnx","Apache-2.0"),
 ("demucs6","5c90dfd2-34c22ccb.th","https://dl.fbaipublicfiles.com/demucs/hybrid_transformer/5c90dfd2-34c22ccb.th","MIT"),
 ("demucs4","955717e8-8726e21a.th","https://dl.fbaipublicfiles.com/demucs/hybrid_transformer/955717e8-8726e21a.th","MIT"),
]
assets=[]
for ident,name,url,license in sources:
 path=dest/name
 if not path.exists():
  print("Downloading",name,flush=True)
  with urllib.request.urlopen(url,timeout=120) as inp,path.open("wb") as out:
   while chunk:=inp.read(1024*1024): out.write(chunk)
 digest=hashlib.sha256(path.read_bytes()).hexdigest()
 if name.endswith(".th") and not digest.startswith(name.split("-")[1].split(".")[0]):
  raise ValueError("Official Demucs checksum mismatch")
 assets.append(dict(id=ident,file=name,url=url,sha256=digest,size=path.stat().st_size,license=license))
 print(name,path.stat().st_size,digest,flush=True)
(ROOT/"backend"/"assets.json").write_text(json.dumps(assets,indent=2),encoding="utf-8")
