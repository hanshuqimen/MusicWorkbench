import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
const runtimeFiles=['vendor/ffmpeg.exe','backend/assets.json','.venv/Lib/site-packages/torch','vendor/GeneralUser-GS.sf2','vendor/vcruntime/msvcp140.dll'];
for(const file of runtimeFiles) if(!existsSync(file))throw new Error('打包资源缺失：'+file+'；请先运行 setup.ps1');
for(const args of [['scripts/stage-runtime.mjs'],['scripts/copy-worklet.mjs'],['node_modules/typescript/bin/tsc','--noEmit'],['node_modules/vite/bin/vite.js','build'],['scripts/copy-worklet.mjs'],['node_modules/electron-builder/cli.js','--win','--x64']]){
 const r=spawnSync(process.execPath,args,{stdio:'inherit',env:{...process.env,CSC_IDENTITY_AUTO_DISCOVERY:'false',ELECTRON_BUILDER_CACHE:process.cwd()+'/.cache/builder'}});
 if(r.status)process.exit(r.status);
}
