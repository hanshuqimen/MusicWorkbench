// Validate the actual Electron UI, sampler clock, persisted notes and backend jobs.
// Only file dialogs and read-only audio observation are automated.
import {createRequire} from 'node:module';
import {mkdir,copyFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{_electron}=createRequire(require.resolve('@playwright/cli/package.json'))('playwright');
const root=process.cwd(),out=path.join(root,'output/features-qa'),home=path.join(out,'userdata-'+Date.now());
for(const [dir,names] of Object.entries({assets:['GeneralUser-GS.sf2'],models:['basic-pitch.onnx','5c90dfd2-34c22ccb.th','955717e8-8726e21a.th']})){
 await mkdir(path.join(home,dir),{recursive:true});for(const name of names)await copyFile(path.join(root,'vendor',name),path.join(home,dir,name));
}
const executablePath=process.env.WORKBENCH_QA_EXE||require('electron'),packed=!!process.env.WORKBENCH_QA_EXE;
const app=await _electron.launch({executablePath,args:packed?[]:['.'],cwd:root,env:{...process.env,WORKBENCH_HOME:home,WORKBENCH_TEST:'1',WORKBENCH_DISABLE_GPU_DOWNLOAD:'1',...(packed?{PATH:path.join(process.env.SystemRoot,'System32')}:{})},timeout:60000});
const page=await app.firstWindow(),errors=[],report={checks:[],executablePath};
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
const check=name=>{report.checks.push(name);console.log('PASS',name)};
const project=()=>page.evaluate(()=>window.workbench.api('/projects/recovery'));
async function saved(){await page.waitForTimeout(850);return project()}
async function completed(fresh=true){if(fresh)await page.locator('.job-panel .spin').waitFor({state:'visible',timeout:15000});await page.waitForFunction(()=>!document.querySelector('.job-panel .spin')&&document.querySelector('.job-panel strong')?.textContent==='处理完成',{},{timeout:180000});await page.waitForTimeout(850);assert.equal(await page.locator('.error-banner').count(),0)}
try{
 await page.getByRole('button',{name:'开始录制',exact:true}).waitFor({timeout:60000});await completed(false);
 const presets=await page.evaluate(()=>window.workbench.api('/presets'));assert(presets.every(p=>Object.keys(p.programs).length===16));
 await page.getByRole('button',{name:'用户指引',exact:true}).click();const guide=page.getByRole('dialog',{name:'用户指引'});
 await guide.getByRole('textbox',{name:'搜索指引'}).fill('指令');await guide.getByRole('button',{name:'指令自动弹奏',exact:true}).click();assert.match(await guide.innerText(),/ASDFDGS/);
 await page.keyboard.press('Escape');await guide.waitFor({state:'hidden'});check('searchable user guide and Escape dismissal');
 await page.getByRole('button',{name:'用户指引',exact:true}).click();await guide.getByRole('button',{name:'带我走一遍界面'}).click();
 for(let i=0;i<8;i++){assert.equal(await page.locator('.guide-target').count(),1);await page.getByRole('button',{name:'下一步',exact:true}).click()}
 await page.getByRole('button',{name:'完成指引',exact:true}).click();assert.equal(await page.locator('.guide-target').count(),0);check('nine-step guide highlights actual workspace sections');
 await page.evaluate(()=>{
  const connect=AudioNode.prototype.connect;
  AudioNode.prototype.connect=function(destination,...args){const result=connect.call(this,destination,...args);if(destination instanceof AudioDestinationNode&&!window.__qaAnalyser){window.__qaAnalyser=this.context.createAnalyser();window.__qaAnalyser.fftSize=2048;connect.call(this,window.__qaAnalyser)}return result};
 });
 const command=page.getByRole('textbox',{name:'演奏指令'}),play=page.getByRole('button',{name:'自动弹奏',exact:true}),stop=page.getByRole('button',{name:'停止指令',exact:true}),insert=page.getByRole('button',{name:'写入当前音轨',exact:true});
 await command.fill('ASDFDGS');await page.locator('.sequence-controls input[type=checkbox]').check();await play.click();await page.waitForFunction(()=>!document.querySelector('.sequence-actions button:nth-child(2)')?.disabled&&document.querySelector('.sequence-actions button:first-child')?.textContent==='自动弹奏',{},{timeout:15000});
 const audio=await page.evaluate(async()=>{let peak=0;for(let i=0;i<100;i++){const a=window.__qaAnalyser;if(a){const f=new Float32Array(a.fftSize);a.getFloatTimeDomainData(f);peak=Math.max(peak,...f.map(Math.abs))}if(peak>.00001)break;await new Promise(r=>setTimeout(r,20))}return peak});assert(audio>.00001);report.sampledPeak=audio;
 await stop.click();await page.locator('.sequence-controls input[type=checkbox]').uncheck();await play.click();
 await page.waitForFunction(()=>document.querySelector('.sequence-actions button:nth-child(2)')?.disabled,{},{timeout:10000});check('ASDFDGS plays real sampler audio and completes');
 await insert.click();let p=await saved();let piano=p.tracks.find(t=>t.instrument==='piano');assert.deepEqual(piano.notes.map(n=>n.pitch),[60,62,64,65,64,67,62]);assert.deepEqual(piano.notes.map(n=>n.start),[0,.25,.5,.75,1,1.25,1.5]);check('command writes editable notes with exact timing');
 await page.getByRole('button',{name:'撤销',exact:true}).click();p=await saved();assert.equal(p.tracks.find(t=>t.instrument==='piano').notes.length,0);await page.getByRole('button',{name:'重做',exact:true}).click();p=await saved();assert.equal(p.tracks.find(t=>t.instrument==='piano').notes.length,7);check('command insertion participates in undo and redo');
 await command.fill('XYZ');assert(await play.isDisabled());assert.match(await page.locator('#sequence-error').innerText(),/无法弹奏/);
 await command.fill('[AD]-F');await insert.click();p=await saved();assert.equal(p.tracks.find(t=>t.instrument==='piano').notes.length,10);check('invalid keys rejected and chords/rests persist');
 await command.fill('AS');await page.locator('.sequence-controls input[type=checkbox]').check();await play.click();await page.waitForTimeout(1200);assert(await stop.isEnabled());await stop.click();await page.waitForTimeout(120);assert(await stop.isDisabled());await page.locator('.sequence-controls input[type=checkbox]').uncheck();check('looped command is cancelable without stuck transport');
 await page.getByRole('combobox',{name:'更多乐器'}).selectOption('guitar');await command.fill('ASDFDGS');await insert.click();p=await saved();assert.deepEqual(p.tracks.find(t=>t.instrument==='guitar').notes.map(n=>n.pitch),[40,47,52,55,52,59,47]);check('guitar command uses actual six-string fret pitches');
 const programs={bass:33,drums:0,electricPiano:4,organ:19,violin:40,cello:42,flute:73,sax:65,trumpet:56,accordion:21,harp:46,koto:107,shamisen:106,bagpipe:109};
 for(const [instrument,program] of Object.entries(programs)){
  await page.getByRole('combobox',{name:'更多乐器'}).selectOption(instrument);await command.fill('A');await insert.click();p=await saved();const t=p.tracks.find(t=>t.instrument===instrument);assert(t&&t.program===program&&t.notes.length===1,instrument);
 }
 assert.equal(p.tracks.length,16);check('sixteen instruments create valid sampler tracks and editable command notes');
 await page.getByRole('combobox',{name:'更多乐器'}).selectOption('piano');await page.getByRole('checkbox',{name:'选择 钢琴',exact:true}).check();
 await page.locator('.style-panel .field select').first().selectOption(p.tracks.find(t=>t.instrument==='piano').id);
 const styles={jazz:'爵士摇摆',blues:'布鲁斯',rock:'摇滚',bossa:'波萨诺瓦',waltz:'圆舞器乐',ambient:'氛围器乐'};
 assert.equal(await page.locator('.style-card').count(),10);
 const untouched=JSON.stringify(p.tracks.filter(t=>t.instrument!=='piano'));
 for(const [id,name] of Object.entries(styles)){
  await page.locator('.style-card').filter({hasText:name}).click();await page.getByRole('button',{name:'生成全曲编配',exact:true}).click();await completed();p=await project();assert.equal(p.tracks.find(t=>t.instrument==='piano').style,id);assert.equal(JSON.stringify(p.tracks.filter(t=>t.instrument!=='piano')),untouched);
 }
 check('six new style jobs complete through UI and preserve unselected tracks');
 await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file})},path.join(out,'扩展乐器.mwork'));
 await page.getByRole('button',{name:'保存工程',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.notice-banner')?.textContent?.includes('工程已保存'),{},{timeout:30000});
 await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]})},path.join(out,'扩展乐器.mwork'));
 const reopened=await page.evaluate(()=>window.workbench.openProject());assert.equal(reopened.tracks.length,16);assert.deepEqual(reopened.tracks.map(t=>[t.instrument,t.notes]),p.tracks.map(t=>[t.instrument,t.notes]));check('new instruments and styles survive portable project save/reopen');
 if(packed){
  await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:0})});
  const canceled=await page.evaluate(()=>window.workbench.uninstall());assert.equal(canceled.started,false);check('native uninstall confirmation safely cancels');
 }
 const image=await app.evaluate(async({BrowserWindow})=>Array.from((await BrowserWindow.getAllWindows()[0].capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG()));await writeFile(path.join(out,'workbench.png'),Buffer.from(image));
 await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]})},path.join(root,'output/fixtures/reference-mix.wav'));
 await page.getByRole('button',{name:'导入音乐',exact:false}).click();await page.waitForFunction(()=>document.querySelector('.track-caption')?.textContent?.includes('其他'));
 await command.focus();await page.keyboard.down('Shift');await page.keyboard.press('a');await page.keyboard.up('Shift');p=await saved();assert.equal(p.tracks.length,1);assert.equal(p.tracks[0].instrument,'other');check('uppercase typing in command field never triggers sustain or creates a practice track');
 assert.deepEqual(errors,[]);check('renderer console clean');report.errors=errors;report.finished=new Date().toISOString();
}catch(error){report.failure=String(error);throw error}finally{await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await app.close()}
