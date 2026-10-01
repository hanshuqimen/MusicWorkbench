import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import './copy-worklet.mjs';
const require=createRequire(import.meta.url);
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js'],{stdio:'inherit'});
let desktop;
for(let i=0;i<100;i++){
  try{if((await fetch('http://127.0.0.1:5173')).ok)break;}catch{}
  await new Promise(r=>setTimeout(r,100));
}
desktop=spawn(require('electron'),['.'],{stdio:'inherit',env:{...process.env,WORKBENCH_DEV_URL:'http://127.0.0.1:5173'}});
desktop.on('exit',()=>{vite.kill();process.exit();});
process.on('SIGINT',()=>{desktop.kill();vite.kill();});
