import hashlib,json,zipfile
from uuid import uuid4
import pytest
from backend.resources import download_asset
from backend.gpu_runtime import install_wheel
from backend.models import Project,Track
from backend.config import HOME
from backend.storage import archive_project,open_archive

def test_resumable_download_and_checksum(tmp_path,monkeypatch):
    data=b"actual-resource-payload";path=tmp_path/"test-resource.bin"
    path.with_suffix('.bin.part').write_bytes(data[:7])
    asset={"file":path.name,"size":len(data),"sha256":hashlib.sha256(data).hexdigest(),"url":"https://official.invalid/resource"}
    class Response:
        status_code=206
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def raise_for_status(self):pass
        def iter_content(self,size):yield data[7:]
    def get(url,**kwargs):
        assert kwargs['headers']['Range']=='bytes=7-'
        return Response()
    monkeypatch.setattr('backend.resources.requests.get',get)
    updates=[];download_asset(asset,path,lambda **x:updates.append(x))
    assert path.read_bytes()==data
    assert updates[0]['downloaded']==7
    assert not path.with_suffix('.bin.part').exists()

def test_wheel_extraction_restricts_members(tmp_path):
    path=tmp_path/'wheel.zip';site=tmp_path/'site'
    with zipfile.ZipFile(path,'w') as z:
        z.writestr('torch/__init__.py','ready')
        z.writestr('torch/lib/runtime.dll',b'library')
        z.writestr('torch/lib/large.lib',b'exclude')
        z.writestr('scripts/untrusted.exe',b'exclude')
    install_wheel(path,'torch',site)
    assert (site/'torch/lib/runtime.dll').read_bytes()==b'library'
    assert not (site/'scripts').exists()
    assert not (site/'torch/lib/large.lib').exists()
    with zipfile.ZipFile(path,'w') as z:z.writestr('torch/../../escape',b'evil')
    with pytest.raises(ValueError):install_wheel(path,'torch',site)

def test_custom_soundfont_is_portable(tmp_path):
    bank=str(uuid4());font=HOME/'assets'/(bank+'.sf2')
    data=b'RIFF'+(4).to_bytes(4,'little')+b'sfbk'
    font.write_bytes(data)
    project=Project(tracks=[Track(name='扩展音源',instrument='piano',soundBank=bank)])
    archive=tmp_path/'含音源.mwork';archive_project(project,str(archive))
    font.unlink()
    opened=open_archive(str(archive))
    assert (HOME/'assets'/(opened.tracks[0].soundBank+'.sf2')).read_bytes()==data

def test_explicit_cpu_initialization_skips_gpu(monkeypatch):
    monkeypatch.setattr('backend.resources.manifest',lambda:[])
    monkeypatch.setattr('backend.gpu_runtime.needed',lambda:True)
    monkeypatch.setattr('backend.gpu_runtime.installed',lambda:False)
    downloads=[]
    monkeypatch.setattr('backend.resources.download_asset',lambda *args:downloads.append(args))
    from backend.resources import initialize
    initialize(lambda **kw:None,enable_gpu=False)
    assert downloads==[]
