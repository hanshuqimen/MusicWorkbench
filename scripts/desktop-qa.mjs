// Electron smoke validation using the Playwright library shipped by the CLI.
// Dialogs choose deterministic local paths; all IPC, audio rendering and backend operations stay real.
import {createRequire} from 'node:module';
import {mkdir,copyFile,readFile,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),cliRequire=createRequire(require.resolve('@playwright/cli/package.json'));
const {_electron}=cliRequire('playwright');
const root=process.cwd(),packed=process.argv.includes('--packaged'),out=path.join(root,'output/desktop-qa'+(packed?'-packaged':''));
const home=path.join(out,'userdata');await mkdir(out,{recursive:true});
for(const [dir,names] of Object.entries({assets:['GeneralUser-GS.sf2'],models:['basic-pitch.onnx','5c90dfd2-34c22ccb.th','955717e8-8726e21a.th']})){
 await mkdir(path.join(home,dir),{recursive:true});for(const name of names)await copyFile(path.join(root,'vendor',name),path.join(home,dir,name));
}
const env={...process.env,WORKBENCH_TEST:'1',WORKBENCH_HOME:home,WORKBENCH_DISABLE_GPU_DOWNLOAD:'1',HTTPS_PROXY:'http://127.0.0.1:9',HTTP_PROXY:'http://127.0.0.1:9',NO_PROXY:'127.0.0.1,localhost'};
if(packed)env.PATH=path.join(process.env.SystemRoot,'System32');
const executablePath=process.env.WORKBENCH_QA_EXE||(packed?path.join(root,'release/win-unpacked/MusicWorkbench.exe'):require('electron'));
const electron=await _electron.launch({executablePath,args:packed?[]:['.'],cwd:root,env,timeout:60000});
const errors=[];const page=await electron.firstWindow();page.on('pageerror',error=>errors.push(String(error)));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
const report={packaged:packed,executablePath,externalRuntimeOnPath:!packed,started:new Date().toISOString(),checks:[]};
const check=(name)=>{report.checks.push(name);console.log('PASS',name)};
async function saveDialog(name){await electron.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file})},path.join(out,name))}
async function openDialog(file){await electron.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]})},file)}
try{
 await page.getByRole('button',{name:'开始录制',exact:true}).waitFor({timeout:60000});
 await page.waitForFunction(()=>document.querySelector('.job-panel strong')?.textContent==='处理完成',{},{timeout:60000});check('backend selftest and automatic startup');
 await page.getByRole('button',{name:'新建',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.track-caption')?.textContent?.includes('0 个音符'));
 await page.getByRole('button',{name:'开始录制',exact:true}).click();
 await page.getByRole('button',{name:'结束录制',exact:true}).waitFor({timeout:20000});
 await page.keyboard.down('Shift');await page.keyboard.down('a');await page.keyboard.down('d');await page.waitForTimeout(300);
 await page.keyboard.up('a');await page.keyboard.up('d');await page.keyboard.up('Shift');
 await page.getByRole('button',{name:'结束录制',exact:true}).click();await page.getByRole('button',{name:'停止',exact:true}).click();
 await page.waitForTimeout(800);
 const project=await page.evaluate(()=>window.workbench.api('/projects/recovery'));
 assert(project.tracks[0].notes.length>=2);assert(project.tracks[0].controls.some(c=>c.controller===64&&c.value===127));assert(project.tracks[0].controls.at(-1).value===0);
 check('two simultaneous recorded notes and sustain release');
 await saveDialog('演奏作品.mwork');await page.evaluate(p=>window.workbench.saveProject(p),project);
 await openDialog(path.join(out,'演奏作品.mwork'));const reopened=await page.evaluate(()=>window.workbench.openProject());
 assert.deepEqual(reopened.tracks[0].notes,project.tracks[0].notes);check('portable project save and reopen');
 await saveDialog('演奏.mid');await page.evaluate(p=>window.workbench.exportMidi(p),project);check('native MIDI export');
 await page.getByRole('button',{name:'播放',exact:true}).click();await page.waitForTimeout(200);await page.getByRole('button',{name:'停止',exact:true}).click();check('real sampler replay and stop');
 await page.getByRole('button',{name:'导出',exact:true}).click();await saveDialog('演奏.wav');
 await page.getByRole('button',{name:'混音导出 · WAV',exact:true}).click();
 await page.waitForFunction(()=>!!document.querySelector('.notice-banner')?.textContent?.includes('音频已导出'),{},{timeout:120000});
 assert((await stat(path.join(out,'演奏.wav'))).size>100000);check('sampler worker and shared effects WAV export');
 await page.getByRole('button',{name:'导出',exact:true}).click();await saveDialog('演奏.mp3');
 await page.getByRole('button',{name:'混音导出 · MP3',exact:true}).click();
 await page.waitForFunction(()=>!!document.querySelector('.notice-banner')?.textContent?.includes('演奏.mp3'),{},{timeout:120000});check('FFmpeg MP3 export');
 await openDialog(path.join(root,'output/fixtures/reference-mix.wav'));
 const imported=await page.evaluate(()=>window.workbench.importAudio());assert(imported.original);check('reference audio import');
 const result=await page.evaluate(async p=>{
  await window.workbench.api('/projects/'+p.id,p,'PUT');
  const job=await window.workbench.api('/jobs',{kind:'separate',projectId:p.id,device:'cpu'},'POST');
  while(true){const value=await window.workbench.api('/jobs/'+job.id);if(value.state==='failed')throw Error(value.error);if(value.state==='succeeded')return value.result;await new Promise(r=>setTimeout(r,500))}
 },imported);
 assert.equal(result.project.tracks.length,6);check((packed?'packaged ':'')+'real CPU six-stem separation');
 const capture=await electron.evaluate(async({BrowserWindow})=>{
  const image=await BrowserWindow.getAllWindows()[0].capturePage(undefined,{stayHidden:true,stayAwake:true});
  return Array.from(image.toPNG());
 });await writeFile(path.join(out,'workbench.png'),Buffer.from(capture));
 assert.deepEqual(errors,[]);check('renderer console clean');
 report.errors=errors;report.finished=new Date().toISOString();
}catch(error){report.failure=String(error);throw error}finally{await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await electron.close()}
