import {cp, readdir, stat, rm, mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=process.cwd(),source=path.join(root,'.venv/Lib/site-packages'),target=path.join(root,'.package-site');
await mkdir(target,{recursive:true});
if(!existsSync(path.join(target,'torch/__init__.py'))){
 const uv=process.env.UV_EXE||path.join(process.env.USERPROFILE,'.local/bin/uv.exe');
 const result=spawnSync(uv,['pip','install','--python','.venv/Scripts/python.exe','--target',target,'--no-deps','torch==2.7.1','torchaudio==2.7.1','--index-url','https://download.pytorch.org/whl/cpu'],{stdio:'inherit',env:{...process.env,UV_CACHE_DIR:path.join(root,'.cache/uv')}});
 if(result.status)throw new Error('CPU 打包运行环境安装失败');
}
const exclude=(file)=> !/(^|[/\\])(__pycache__|tests|test|include|bin|\.agents|\.codex|\.git)([/\\]|$)/.test(path.relative(source,file))&&!file.endsWith('.lib')&&!file.endsWith('.pdb');
for(const entry of await readdir(source)){
 if(/^(torch|torchaudio)(-|$)/.test(entry)||/^(pytest|_pytest|pip|imageio_ffmpeg|httpx|httpcore|uvicorn-.*\.data)/.test(entry))continue;
 await cp(path.join(source,entry),path.join(target,entry),{recursive:true,filter:exclude});
}
async function prune(dir){for(const entry of await readdir(dir,{withFileTypes:true})){
 const absolute=path.join(dir,entry.name);
 if(!absolute.startsWith(target+path.sep))throw new Error('Invalid staging path');
 if(['__pycache__','include','tests','.agents','.codex','.git'].includes(entry.name)||/\.(lib|pdb)$/.test(entry.name))await rm(absolute,{recursive:true,force:true});
 else if(entry.isDirectory())await prune(absolute);
}}
await prune(target);
console.log('Standalone CPU runtime staged. CUDA is downloaded as a verified optional component.');
