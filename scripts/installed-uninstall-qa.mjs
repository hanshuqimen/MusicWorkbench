// Real installation/runtime teardown in updater mode, which preserves real user data.
// Full data removal is covered separately by uninstall-qa.ps1 in isolated folders.
import {createRequire} from 'node:module';
import {mkdir,copyFile,writeFile,stat} from 'node:fs/promises';
import {spawn,execFileSync} from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{_electron}=createRequire(require.resolve('@playwright/cli/package.json'))('playwright');
const root=process.cwd(),out=path.join(root,'output/installed-uninstall-qa'),install=path.join(out,'installed'),home=path.join(out,'userdata'),ps=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
assert(install.startsWith(path.join(root,'output')+path.sep));await mkdir(out,{recursive:true});
const report={checks:[],install,mode:'--updated preserves existing user data; full data deletion tested only in isolated folders'},check=name=>{report.checks.push(name);console.log('PASS',name)};
const run=(exe,args)=>new Promise((resolve,reject)=>{const child=spawn(exe,args,{windowsHide:true,stdio:'ignore'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('Installer exit '+code)))});
const exists=async file=>{try{await stat(file);return true}catch{return false}};
const owned=()=>JSON.parse(execFileSync(ps,['-NoProfile','-NonInteractive','-Command',`@((Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith('${install.replaceAll("'","''")}\', [System.StringComparison]::OrdinalIgnoreCase) }) | Select-Object ProcessId,Name) | ConvertTo-Json -Compress`],{windowsHide:true,encoding:'utf8'}).trim()||'[]');
let app;
try{
 await run(path.join(root,'release/MusicWorkbench Setup 0.2.0.exe'),['/S','/D='+install]);assert(await exists(path.join(install,'MusicWorkbench.exe')));check('actual 0.2.0 per-user silent installation');
 const env={...process.env,PATH:path.join(process.env.SystemRoot,'System32'),WORKBENCH_HOME:home,WORKBENCH_TEST:'1',WORKBENCH_DISABLE_GPU_DOWNLOAD:'1',HTTP_PROXY:'http://127.0.0.1:9',HTTPS_PROXY:'http://127.0.0.1:9',NO_PROXY:'127.0.0.1,localhost'};
 app=await _electron.launch({executablePath:path.join(install,'MusicWorkbench.exe'),cwd:root,env,timeout:60000});
 assert.equal(await app.evaluate(({app})=>app.getPath('userData')),home);report.home=home;
 const page=await app.firstWindow();await page.getByRole('button',{name:'开始录制',exact:true}).waitFor({timeout:60000});
 await mkdir(path.join(home,'models'),{recursive:true});for(const file of ['basic-pitch.onnx','5c90dfd2-34c22ccb.th','955717e8-8726e21a.th'])await copyFile(path.join(root,'vendor',file),path.join(home,'models',file));
 await mkdir(path.join(home,'gpu/site-packages'),{recursive:true});await writeFile(path.join(home,'gpu/site-packages/disposable-test.txt'),'test GPU runtime footprint');
 await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]})},path.join(root,'output/fixtures/reference-mix.wav'));
 const imported=await page.evaluate(()=>window.workbench.importAudio());
 await page.evaluate(async p=>{
  await window.workbench.api('/projects/'+p.id,p,'PUT');
  const job=await window.workbench.api('/jobs',{kind:'separate',projectId:p.id,device:'cpu'},'POST');
  for(let i=0;i<900;i++){const state=await window.workbench.api('/jobs/'+job.id);if(state.state==='running')return;if(state.state==='failed')throw Error(state.error);await new Promise(r=>setTimeout(r,100))}throw Error('worker did not start');
 },imported);
 const before=owned();assert(before.length>=3);report.runningBefore=before;check('bundled backend and inference worker run without external Node/Python');
 await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:0})});assert.equal((await page.evaluate(()=>window.workbench.uninstall())).started,false);check('application uninstall confirmation can cancel without deleting files');
 let closed=false;app.on('close',()=>{closed=true});
 await run(path.join(install,'Uninstall MusicWorkbench.exe'),['/S','--updated']);
 // NSIS relaunches a temporary uninstaller; its initial process can exit first.
 for(let i=0;i<90;i++){if(!await exists(install)&&owned().length===0)break;await new Promise(r=>setTimeout(r,1000))}
 report.connectionClosed=closed;assert.equal(owned().length,0);check('uninstaller terminates application, backend and active inference worker');
 assert.equal(await exists(install),false);
 assert(await exists(home));assert(await exists(path.join(home,'models/5c90dfd2-34c22ccb.th')));
 const entries=execFileSync(ps,['-NoProfile','-NonInteractive','-Command',"@(Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -eq 'MusicWorkbench' }).Count"],{windowsHide:true,encoding:'utf8'}).trim();assert.equal(entries,'0');
 check('installation, Python dependencies and uninstall registry removed; updater mode preserves user data');
 report.finished=new Date().toISOString();
}catch(error){report.failure=String(error);throw error}finally{await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));if(app)await app.close().catch(()=>{})}
