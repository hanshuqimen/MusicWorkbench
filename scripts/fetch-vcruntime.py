"""Extract app-local AMD64 runtime from a SHA-pinned, Microsoft-signed redistributable."""
import json,hashlib,urllib.request,struct,subprocess,shutil,xml.etree.ElementTree as ET
from pathlib import Path
root=Path(__file__).resolve().parents[1]
asset=json.loads((root/'scripts/build-assets.json').read_text('utf8'))
tools=root/'.tools';tools.mkdir(exist_ok=True)
package=tools/'vc_redist.x64.exe'
if not package.exists():urllib.request.urlretrieve(asset['url'],package)
data=package.read_bytes()
if hashlib.sha256(data).hexdigest()!=asset['sha256']:raise ValueError('Microsoft runtime checksum mismatch')
work=tools/'vc-runtime-build';work.mkdir(exist_ok=True)
cabs=[];offset=0
while True:
    offset=data.find(b'MSCF',offset)
    if offset<0:break
    size=struct.unpack_from('<I',data,offset+8)[0]
    if size>100000 and offset+size<=len(data):
        file=work/(str(offset)+'.cab');file.write_bytes(data[offset:offset+size]);cabs.append(file)
    offset+=4
def expand(cab,directory):
    directory.mkdir(exist_ok=True)
    subprocess.run(['expand.exe',str(cab),'-F:*',str(directory)],check=True,capture_output=True,
                   creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
boot=work/'boot';payload=work/'payload';dlls=work/'dlls'
expand(cabs[0],boot);expand(cabs[1],payload)
tree=ET.parse(boot/'0');source=next(e.attrib['SourcePath'] for e in tree.iter() if e.tag.endswith('Payload') and 'vcRuntimeMinimum_amd64' in e.attrib.get('FilePath','') and e.attrib.get('FilePath','').endswith('cab1.cab'))
expand(payload/source,dlls)
target=root/'vendor/vcruntime';target.mkdir(parents=True,exist_ok=True)
for dll in dlls.glob('*.dll_amd64'):shutil.copy2(dll,target/dll.name.removesuffix('_amd64'))
licenses=root/'vendor/licenses';licenses.mkdir(exist_ok=True)
shutil.copy2(boot/'u4',licenses/'Microsoft-VC-runtime-license.rtf')
(licenses/'Microsoft-VC-runtime-source.json').write_text(json.dumps(asset,indent=2),'utf8')
print('Microsoft app-local AMD64 runtime ready:',len(list(target.glob('*.dll'))),'DLLs')
