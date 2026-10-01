import {createRequire} from 'node:module';
import {mkdir,copyFile,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),pw=createRequire(require.resolve('@playwright/cli/package.json'))('playwright');
const root=process.cwd(),home=path.join(root,'output/workflow-qa/userdata'),output=path.join(root,'output/workflow-qa');
for(const [dir,files] of Object.entries({assets:['GeneralUser-GS.sf2'],models:['basic-pitch.onnx','5c90dfd2-34c22ccb.th','955717e8-8726e21a.th']})){
 await mkdir(path.join(home,dir),{recursive:true});for(const file of files)await copyFile(path.join(root,'vendor',file),path.join(home,dir,file));
}
const electron=await pw._electron.launch({executablePath:require('electron'),args:['.'],cwd:root,env:{...process.env,WORKBENCH_HOME:home,WORKBENCH_TEST:'1',WORKBENCH_DISABLE_GPU_DOWNLOAD:'1'}});
const page=await electron.firstWindow(),errors=[],report={checks:[]};page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
const check=label=>{report.checks.push(label);console.log('PASS',label)};
const project=()=>page.evaluate(()=>window.workbench.api('/projects/recovery'));
async function completed(expectNew=true){if(expectNew)await page.locator('.job-panel .spin').waitFor({state:'visible',timeout:15000});await page.waitForFunction(()=>!document.querySelector('.job-panel .spin')&&document.querySelector('.job-panel strong')?.textContent==='处理完成',{},{timeout:180000});assert.equal(await page.locator('.error-banner').count(),0);await page.waitForTimeout(900)}
try{
 await page.getByRole('button',{name:'开始录制',exact:true}).waitFor({timeout:60000});await completed(false);
 await page.evaluate(()=>{
  const connect=AudioNode.prototype.connect;
  AudioNode.prototype.connect=function(destination,...args){
   const result=connect.call(this,destination,...args);
   if(destination instanceof AudioDestinationNode&&!window.__qaAnalyser){
    const analyser=this.context.createAnalyser();analyser.fftSize=2048;connect.call(this,analyser);window.__qaAnalyser=analyser;
   }return result;
  };
 });
 await electron.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]})},path.join(root,'output/fixtures/reference-mix.wav'));
 await page.locator('.import-button').click();await page.getByRole('button',{name:'分离音轨',exact:true}).waitFor();
 await page.getByRole('button',{name:'分离音轨',exact:true}).click();
 await page.waitForTimeout(1000);await page.keyboard.down('a');await page.keyboard.down('d');
 await page.waitForFunction(()=>{const analyser=window.__qaAnalyser;if(!analyser)return false;const data=new Float32Array(2048);analyser.getFloatTimeDomainData(data);return data.some(x=>Math.abs(x)>.0001)},{},{timeout:5000});
 assert.equal(await page.locator('.piano-key.pressed').count(),2);await page.keyboard.up('a');await page.keyboard.up('d');check('simultaneous live playing while inference is active');
 check('actual audio at master output while inference is active');
 await completed();const original=await project();assert.equal(original.tracks.length,6);check('import and real six-stem UI flow');
 await page.getByRole('checkbox',{name:'选择 钢琴',exact:true}).check();
 await page.getByRole('button',{name:'生成片段预览',exact:true}).click();await completed();
 assert.equal((await project()).tracks.find(t=>t.instrument==='piano').mode,'audio');check('preview leaves saved source track unchanged');
 await page.getByRole('button',{name:'试听预览',exact:true}).click();await page.waitForTimeout(200);await page.getByRole('button',{name:'停止',exact:true}).click();check('preview playback');
 const signatures=[];
 for(const name of ['中国古典器乐','日式传统器乐','苏格兰民谣','俄罗斯民谣']){
  await page.getByRole('button',{name:new RegExp(name)}).click();await page.getByRole('button',{name:'生成全曲编配',exact:true}).click();await completed();
  const changed=await project(),track=changed.tracks.find(t=>t.instrument==='piano');assert.equal(track.mode,'notes');assert(track.notes.length);
  for(const source of original.tracks.filter(t=>t.instrument!=='piano'))assert.deepEqual(changed.tracks.find(t=>t.id===source.id),source);
  assert(track.sourceNotes.every(n=>track.notes.some(m=>m.pitch===n.pitch&&m.start===n.start)));
  signatures.push([track.program,track.notes.map(n=>[n.pitch,n.start,n.duration,n.velocity])]);check(name+' single-track arrangement, melody anchors and untouched stems');
 }
 assert.equal(new Set(signatures.map(s=>JSON.stringify(s))).size,4);
 await page.getByRole('checkbox',{name:'选择 吉他',exact:true}).check();await page.getByRole('button',{name:'生成全曲编配',exact:true}).click();await completed();
 const multiple=await project();assert.equal(multiple.tracks.filter(t=>t.mode==='notes').length,2);check('multi-track arrangement');
 await page.getByRole('button',{name:'钢琴卷帘',exact:true}).click();
 const before=multiple.tracks.find(t=>t.instrument==='piano').notes.length;
 await page.getByRole('button',{name:'音符',exact:true}).click();await page.waitForTimeout(800);
 assert.equal((await project()).tracks.find(t=>t.instrument==='piano').notes.length,before+1);
 await page.getByRole('button',{name:'撤销',exact:true}).click();await page.waitForTimeout(800);
 assert.equal((await project()).tracks.find(t=>t.instrument==='piano').notes.length,before);
 await page.getByRole('button',{name:'重做',exact:true}).click();await page.getByRole('button',{name:'量化 1/16',exact:true}).click();check('piano-roll editing, undo, redo and explicit quantization');
 await page.getByRole('button',{name:'音轨时间线',exact:true}).click();
 const capture=await electron.evaluate(async({BrowserWindow})=>Array.from((await BrowserWindow.getAllWindows()[0].capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG()));
 await writeFile(path.join(output,'workbench.png'),Buffer.from(capture));assert.deepEqual(errors,[]);check('clean console');report.errors=errors;
}catch(error){report.failure=String(error);throw error}finally{await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await electron.close()}
