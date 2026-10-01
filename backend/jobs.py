import json, queue, subprocess, sys, threading, time
from uuid import uuid4
from .config import HOME, ROOT
from .storage import atomic_json, load_project
from .models import JobRequest
from .gpu_runtime import worker_environment

class JobManager:
    def __init__(self):
        self.jobs={}; self.process=None; self.active=None
        self.queue=queue.Queue(); self.closed=False
        self.thread=threading.Thread(target=self._run,daemon=True); self.thread.start()
    def submit(self,request: JobRequest):
        ident=str(uuid4())
        payload={"request":request.model_dump()}
        if request.projectId: payload["project"]=load_project(request.projectId).model_dump()
        elif request.kind not in ("initialize","selftest"): raise ValueError("请先创建工程")
        root=HOME/"jobs"/ident; root.mkdir()
        atomic_json(root/"payload.json",payload)
        self.jobs[ident]={"id":ident,"kind":request.kind,"state":"queued","stage":"等待处理","created":time.time()}
        self.queue.put(ident)
        return self.jobs[ident]
    def cancel(self,ident):
        job=self.jobs[ident]
        if job["state"] in ("succeeded","failed","cancelled"): return job
        job["state"]="cancelled"; job["stage"]="已取消"
        if self.active==ident and self.process: self._kill(self.process)
        return job
    def _kill(self,process):
        if process.poll() is not None: return
        if sys.platform=="win32":
            subprocess.run(["taskkill","/PID",str(process.pid),"/T","/F"],capture_output=True,
                creationflags=getattr(subprocess,"CREATE_NO_WINDOW",0))
        else: process.terminate()
    def shutdown(self):
        self.closed=True
        if self.process: self._kill(self.process)
        self.queue.put(None)
    def _run(self):
        while not self.closed:
            ident=self.queue.get()
            if ident is None: break
            job=self.jobs[ident]
            if job["state"]=="cancelled": continue
            job.update(state="running",stage="启动本地处理进程")
            self.active=ident; root=HOME/"jobs"/ident
            try:
                with (root/"worker.log").open("w",encoding="utf-8") as log:
                    process=subprocess.Popen([sys.executable,"-u","-m","backend.worker",str(root/"payload.json")],
                        cwd=ROOT.parent,stdout=subprocess.PIPE,stderr=log,text=True,encoding="utf-8",
                        env=worker_environment(),
                        creationflags=getattr(subprocess,"CREATE_NO_WINDOW",0))
                    self.process=process
                    for line in process.stdout:
                        try:
                            update=json.loads(line)
                            if job["state"]!="cancelled": job.update(update)
                        except ValueError: pass
                    code=process.wait()
                    if job["state"]=="cancelled": continue
                    if code or not (root/"result.json").exists():
                        job.update(state="failed",stage="处理失败",error=job.get("error","处理进程退出，请导出日志查看原因"))
                    else: job.update(state="succeeded",stage="处理完成",result=json.loads((root/"result.json").read_text("utf-8")))
            except Exception as error: job.update(state="failed",error=str(error))
            finally:
                self.process=None; self.active=None
                atomic_json(root/"status.json",job)
