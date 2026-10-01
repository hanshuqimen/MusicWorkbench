"""Real local model workflow. Never substitutes mock audio or mock model output."""
import json,time,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import numpy as np
import soundfile as sf
from backend.audio import import_audio,fingerprint
from backend.models import JobRequest,Project
from backend.storage import save_project,atomic_json
from backend.worker import execute
from backend.presets import PRESETS
from backend.config import project_root

def main():
 start=time.perf_counter()
 p=import_audio("output/fixtures/reference-mix.wav");save_project(p)
 result=execute({"request":JobRequest(kind="separate",projectId=p.id).model_dump(),"project":p.model_dump()})
 p=Project.model_validate(result["project"])
 assert {t.instrument for t in p.tracks}=={"piano","guitar","bass","drums","vocals","other"}
 root=project_root(p.id)
 metrics=json.loads((root/"benchmark.json").read_text("utf-8"))
 references={}
 for t in p.tracks:
  a,_=sf.read(root/t.asset,always_2d=True)
  assert np.isfinite(a).all() and len(a)==round(p.duration*44100)
  assert np.mean(a*a)>1e-12
  path=Path("output/fixtures")/(t.instrument+".wav")
  if path.exists():
   target,_=sf.read(path,always_2d=True)
   score=10*np.log10((np.sum(target**2)+1e-12)/(np.sum((a-target)**2)+1e-12))
   references[t.instrument]={"referenceSNRdB":float(score),"rms":float(np.sqrt(np.mean(a*a)))}
 save_project(p)
 selected=[t.id for t in p.tracks if t.instrument in ("piano","guitar","bass","drums")]
 request=JobRequest(kind="transcribe",projectId=p.id,trackIds=selected)
 transcription=execute({"request":request.model_dump(),"project":p.model_dump()})
 p=Project.model_validate(transcription["project"]);save_project(p)
 assert any(t.notes for t in p.tracks if t.instrument=="piano")
 p.leadTrackId=next(t.id for t in p.tracks if t.instrument=="piano")
 untouched={t.id:fingerprint(root/t.asset) for t in p.tracks if t.id not in selected}
 signatures=[]
 for preset in PRESETS:
  request=JobRequest(kind="arrange",projectId=p.id,trackIds=selected,style=preset,strength=.8)
  changed=Project.model_validate(execute({"request":request.model_dump(),"project":p.model_dump()})["project"])
  assert all(fingerprint(root/t.asset)==untouched[t.id] for t in changed.tracks if t.id in untouched)
  assert all(t.mode=="notes" for t in changed.tracks if t.id in selected)
  signatures.append([(t.program,len(t.notes)) for t in changed.tracks if t.id in selected])
  atomic_json(Path("output")/(preset.id+"-integration.json"),changed.model_dump())
 assert len({str(s) for s in signatures})==4
 report={"elapsed":time.perf_counter()-start,"device":result["device"],"separation":metrics,
         "referenceMetrics":references,"notes":{t.instrument:len(t.notes) for t in p.tracks},
         "styles":signatures,"projectId":p.id,"limitations":"人工采样混音仅用于功能与参考分轨检查，不代表真实歌曲的模型质量。"}
 atomic_json(Path("output/integration-report.json"),report)
 print(json.dumps(report,ensure_ascii=False,indent=2),flush=True)
if __name__=="__main__":main()
