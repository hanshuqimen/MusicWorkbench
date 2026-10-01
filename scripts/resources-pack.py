import json,zipfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
target=root/'release/MusicWorkbench-resources.zip';target.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=1) as z:
    for asset in json.loads((root/'backend/assets.json').read_text('utf8')):
        z.write(root/'vendor'/asset['file'],asset['file'])
    z.write(root/'backend/assets.json','assets.json')
    for file in (root/'vendor/licenses').glob('*'):z.write(file,'licenses/'+file.name)
print(target,target.stat().st_size)
