"""Cancellation/retry and actual inference fallback; injected OOM is reported explicitly."""
import json,sys,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from backend.models import JobRequest
from backend.audio import import_audio
from backend.storage import save_project,atomic_json
from backend.config import project_root
from backend.jobs import JobManager
from backend.inference import separate

def main():
    p=import_audio('output/fixtures/reference-mix.wav');save_project(p)
    manager=JobManager();request=JobRequest(kind='separate',projectId=p.id,model='htdemucs')
    first=manager.submit(request)
    until=time.monotonic()+20
    while first['state']!='running' and time.monotonic()<until:time.sleep(.05)
    time.sleep(1);manager.cancel(first['id']);assert first['state']=='cancelled'
    second=manager.submit(request);until=time.monotonic()+180
    while second['state'] in ('queued','running') and time.monotonic()<until:time.sleep(.3)
    manager.shutdown();assert second['state']=='succeeded',second
    assert {t['instrument'] for t in second['result']['project']['tracks']}=={'drums','bass','vocals','other'}
    print('PASS actual four-stem queue cancellation and retry',flush=True)
    import demucs.apply,torch
    original=demucs.apply.apply_model
    report={'cancelled':first['state'],'retry':second['state'],'fourTrackSources':[t['instrument'] for t in second['result']['project']['tracks']]}
    if torch.cuda.is_available():
        for mode in ('shorter-segment','cpu-fallback'):
            calls=[];updates=[]
            def with_fault(*args,**kwargs):
                calls.append([str(kwargs.get('device')),kwargs.get('segment')])
                if kwargs.get('device')=='cuda' and (mode=='cpu-fallback' or kwargs.get('segment')==6):
                    raise torch.cuda.OutOfMemoryError('Explicit acceptance-test injected OOM')
                return original(*args,**kwargs)
            demucs.apply.apply_model=with_fault
            try:
                q=import_audio('output/fixtures/reference-mix.wav');save_project(q)
                tracks,device=separate(q,JobRequest(kind='separate',projectId=q.id),lambda **x:updates.append(x))
                assert len(tracks)==6
                assert device==('cuda' if mode=='shorter-segment' else 'cpu')
                report[mode]={'injectedOOM':True,'calls':calls,'actualDevice':device,'metrics':json.loads((project_root(q.id)/'benchmark.json').read_text('utf8'))}
                print('PASS',mode,device,flush=True)
            finally:demucs.apply.apply_model=original
    atomic_json(Path('output/acceptance-report.json'),report)
    print(json.dumps(report,indent=2),flush=True)
if __name__=='__main__':main()
