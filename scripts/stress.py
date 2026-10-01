"""Real ten-minute input and GPU separation, with scoped process metrics."""
import json,subprocess,time,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from backend.audio import import_audio
from backend.models import JobRequest
from backend.worker import execute
from backend.storage import save_project,atomic_json
from backend.config import project_root

root=Path(__file__).resolve().parents[1]
source=root/'output/fixtures/十分钟压力.wav'
start=time.perf_counter()
subprocess.run([str(root/'vendor/ffmpeg.exe'),'-v','error','-y','-stream_loop','-1','-i',str(root/'output/fixtures/reference-mix.wav'),'-t','600','-ar','48000','-c:a','pcm_s16le',str(source)],check=True)
p=import_audio(str(source));save_project(p)
assert 599.99<=p.duration<=600
report={'inputBytes':source.stat().st_size,'duration':p.duration,'importSeconds':time.perf_counter()-start,'projectId':p.id}
print(json.dumps(report,ensure_ascii=False),flush=True)
result=execute({'request':JobRequest(kind='separate',projectId=p.id).model_dump(),'project':p.model_dump()})
report['separation']=json.loads((project_root(p.id)/'benchmark.json').read_text('utf8'))
report['stems']=len(result['project']['tracks'])
report['elapsed']=time.perf_counter()-start
atomic_json(root/'output/stress-report.json',report)
print(json.dumps(report,ensure_ascii=False,indent=2),flush=True)
