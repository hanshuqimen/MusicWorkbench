// Exercise automatic capture and multi-instrument editing in the real desktop app.
// The only overrides are native file dialogs and a read-only audio analyser.
import {createRequire} from 'node:module';
import {mkdir,copyFile,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{_electron}=createRequire(require.resolve('@playwright/cli/package.json'))('playwright');
const root=process.cwd(),out=path.join(root,'output/playwright/creation-qa'),home=path.join(out,'userdata-'+Date.now());
for(const [dir,names] of Object.entries({assets:['GeneralUser-GS.sf2'],models:['basic-pitch.onnx','5c90dfd2-34c22ccb.th','955717e8-8726e21a.th']})){
 await mkdir(path.join(home,dir),{recursive:true});for(const name of names)await copyFile(path.join(root,'vendor',name),path.join(home,dir,name));
}
const executablePath=process.env.WORKBENCH_QA_EXE||require('electron'),packed=!!process.env.WORKBENCH_QA_EXE;
const options={executablePath,args:packed?[]:['.'],cwd:root,env:{...process.env,WORKBENCH_HOME:home,WORKBENCH_TEST:'1',WORKBENCH_DISABLE_GPU_DOWNLOAD:'1',...(packed?{PATH:path.join(process.env.SystemRoot,'System32')}:{})},timeout:60000};
let app,page;const errors=[],report={checks:[],executablePath};
const check=name=>{report.checks.push(name);console.log('PASS',name)};
async function launch(){app=await _electron.launch(options);page=await app.firstWindow();page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});await page.getByRole('textbox',{name:'演奏指令',exact:true}).waitFor({timeout:60000});await completed(false)}
async function completed(fresh=true){if(fresh)await page.locator('.job-panel .spin').waitFor({state:'visible',timeout:15000});await page.waitForFunction(()=>!document.querySelector('.job-panel .spin')&&document.querySelector('.job-panel strong')?.textContent==='处理完成',{},{timeout:180000});await page.waitForTimeout(850);assert.equal(await page.locator('.error-banner').count(),0)}
const project=()=>page.evaluate(()=>window.workbench.api('/projects/recovery'));
async function saved(){await page.waitForTimeout(1400);await page.waitForFunction(async()=>{const p=await window.workbench.api('/projects/recovery'),instrument=document.querySelector('select[aria-label="更多乐器"]')?.value,text=document.getElementById('sequence-command')?.value;return (p.tracks.find(t=>t.instrument===instrument)?.sequence?.text||'')===text},{},{timeout:10000});return project()}
const track=(p,instrument)=>p.tracks.find(t=>t.instrument===instrument);
const content=t=>JSON.stringify({notes:t.notes,sourceNotes:t.sourceNotes,style:t.style,program:t.program,effects:t.effects,performance:t.performance,sequence:t.sequence,arrangement:t.arrangement});
const command=()=>page.getByRole('textbox',{name:'演奏指令',exact:true});
async function choose(instrument){await page.getByRole('combobox',{name:'更多乐器'}).selectOption(instrument)}
async function playKey(key){await page.keyboard.down(key);await page.waitForTimeout(120);await page.keyboard.up(key)}
async function strength(down){const slider=page.getByRole('slider',{name:'风格强度',exact:true});await slider.focus();await page.keyboard.press('End');for(let i=0;i<down;i++)await page.keyboard.press('ArrowLeft')}
try{
 await launch();assert.equal(await command().inputValue(),'');assert(await page.getByRole('checkbox',{name:'自动记录演奏',exact:true}).isChecked());
 await page.evaluate(()=>{const connect=AudioNode.prototype.connect;AudioNode.prototype.connect=function(destination,...args){const result=connect.call(this,destination,...args);if(destination instanceof AudioDestinationNode&&!window.__qaAnalyser){window.__qaAnalyser=this.context.createAnalyser();window.__qaAnalyser.fftSize=2048;connect.call(this,window.__qaAnalyser)}return result}});
 // Typing updates one clip immediately; no manual insertion or record button.
 for(const text of ['W','WA','WASD'])await command().fill(text);
 let p=await saved(),piano=track(p,'piano');assert.equal(piano.notes.length,4);assert.deepEqual(piano.notes.map(n=>n.pitch),[61,60,62,64]);assert.deepEqual(piano.notes.map(n=>n.start),[0,.25,.5,.75]);
 assert.equal(await page.getByRole('button',{name:'写入当前音轨',exact:true}).count(),0);assert.match(await page.locator('.track-caption').first().innerText(),/4 个音符/);check('typed WASD automatically creates exactly one editable phrase');
 const beforeInvalid=content(piano);await command().fill('[AD');p=await saved();assert.deepEqual(track(p,'piano').notes,piano.notes);assert.match(await page.locator('#sequence-error').innerText(),/缺少/);assert.notEqual(content(track(p,'piano')),beforeInvalid);
 await command().fill('WASD');check('invalid partial commands retain the last valid phrase');
 // Direct keyboard and mouse notes are automatically captured with real time.
 await page.locator('.timeline canvas').focus();for(const key of ['w','a','s','d'])await playKey(key);
 const key=page.getByRole('button',{name:'C4 键盘 a',exact:true});await key.hover();await page.mouse.down();await page.waitForTimeout(150);await page.mouse.up();
 p=await saved();piano=track(p,'piano');assert.equal(piano.notes.length,9);assert.deepEqual(piano.notes.slice(4,8).map(n=>n.pitch),[61,60,62,64]);assert(piano.notes.slice(4).every(n=>n.duration>.05&&n.duration<2));check('keyboard and mouse performance records without pressing record');
 await page.getByRole('checkbox',{name:'自动记录演奏',exact:true}).uncheck();await page.locator('.timeline canvas').focus();await playKey('a');p=await saved();assert.equal(track(p,'piano').notes.length,9);await page.getByRole('checkbox',{name:'自动记录演奏',exact:true}).check();check('automatic capture can be disabled for practice');
 await command().fill('AS');p=await saved();assert.equal(track(p,'piano').notes.length,7);await command().fill('');p=await saved();assert.equal(track(p,'piano').notes.length,5);await command().fill('ASDF');p=await saved();assert.equal(track(p,'piano').notes.length,9);check('editing and clearing a command preserves separately played notes');
 await page.getByRole('button',{name:'升高八度',exact:true}).click();p=await saved();assert.equal(track(p,'piano').performance.octave,5);assert.deepEqual(track(p,'piano').notes.slice(-4).map(n=>n.pitch),[72,74,76,77]);
 await page.locator('.style-card').filter({hasText:'爵士摇摆'}).click();await strength(20);await page.getByRole('button',{name:'生成全曲编配',exact:true}).click();await completed();p=await project();assert.equal(track(p,'piano').style,'jazz');const pianoEdited=content(track(p,'piano'));check('automatically captured notes support real style arrangement');
 await choose('guitar');await page.getByRole('button',{name:'第 1 弦第 7 品',exact:true}).click();await command().fill('[AS]-DF');await page.locator('.style-card').filter({hasText:'摇滚'}).click();await strength(60);
 await page.getByRole('button',{name:'生成全曲编配',exact:true}).click();await completed();p=await project();assert.equal(track(p,'guitar').style,'rock');assert.equal(content(track(p,'piano')),pianoEdited);const guitarEdited=content(track(p,'guitar'));check('guitar editing and arrangement preserve the complete piano track');
 await choose('piano');assert.equal(await command().inputValue(),'ASDF');assert.match(await page.locator('.style-card.active').innerText(),/爵士/);assert.equal(await page.getByRole('slider',{name:'风格强度',exact:true}).inputValue(),'0.8');p=await saved();assert.equal(p.tracks.length,2);assert.equal(content(track(p,'guitar')),guitarEdited);check('returning to arranged instruments restores their track, draft and style settings');
 await choose('guitar');assert.equal(await command().inputValue(),'[AS]-DF');assert.match(await page.locator('.style-card.active').innerText(),/摇滚/);assert.equal(await page.getByRole('slider',{name:'风格强度',exact:true}).inputValue(),'0.4');p=await saved();assert.equal(track(p,'guitar').performance.frets[0],7);
 // Edit a different instrument while an actual worker processes the piano.
 await choose('piano');await page.getByRole('button',{name:'生成全曲编配',exact:true}).click();await page.locator('.job-panel .spin').waitFor({state:'visible'});await choose('guitar');await command().fill('ASDFGS');await completed(false);p=await project();assert.equal(track(p,'guitar').sequence.text,'ASDFGS');assert.equal(track(p,'guitar').notes.length,6);assert.equal(track(p,'guitar').style,null);assert.equal(track(p,'piano').style,'jazz');check('finished background jobs never roll back another instrument input');
 await choose('piano');await page.getByRole('button',{name:'生成全曲编配',exact:true}).click();await page.locator('.job-panel .spin').waitFor({state:'visible'});await command().fill('ASDFG');await completed(false);p=await project();assert.equal(track(p,'piano').sequence.text,'ASDFG');assert.equal(track(p,'piano').notes.length,10);assert.equal(track(p,'piano').style,null);check('fresh input on a processing track is preserved instead of replaced by an old result');
 // A looping command plays actual sample audio, and stopping does not duplicate notes.
 const notesBeforeLoop=JSON.stringify(track(p,'piano').notes);await page.locator('.sequence-controls input[type=checkbox]').check();await page.getByRole('button',{name:'自动弹奏',exact:true}).click();await page.waitForTimeout(300);
 const peak=await page.evaluate(async()=>{let peak=0;for(let i=0;i<80;i++){const a=window.__qaAnalyser;if(a){const values=new Float32Array(a.fftSize);a.getFloatTimeDomainData(values);peak=Math.max(peak,...values.map(Math.abs))}if(peak>.00001)break;await new Promise(r=>setTimeout(r,20))}return peak});assert(peak>.00001);report.sampledPeak=peak;
 await page.waitForTimeout(1600);assert(await page.getByRole('button',{name:'停止指令',exact:true}).isEnabled());await page.getByRole('button',{name:'停止指令',exact:true}).click();p=await saved();assert.equal(JSON.stringify(track(p,'piano').notes),notesBeforeLoop);check('saved phrase loops through the real sampler with no duplicate recording');
 await page.getByRole('button',{name:'钢琴卷帘',exact:true}).click();await page.getByRole('button',{name:'量化 1/16',exact:true}).click();p=await saved();const edited=track(p,'piano').notes;await page.getByRole('button',{name:'撤销',exact:true}).click();await page.getByRole('button',{name:'重做',exact:true}).click();p=await saved();assert.deepEqual(track(p,'piano').notes,edited);check('automatic notes remain editable with undo and redo');
 const file=path.join(out,'多乐器自动创作.mwork');await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file})},file);await page.getByRole('button',{name:'保存工程',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.notice-banner')?.textContent?.includes('工程已保存'),{},{timeout:30000});
 await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]})},file);await page.getByRole('button',{name:'打开',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.notice-banner')?.textContent==='工程已打开。');const reopened=await saved();assert.deepEqual(reopened.tracks.map(content),p.tracks.map(content));assert.equal(await command().inputValue(),'ASDFG');check('portable project save and reopen keep both instruments and their settings');
 await app.close();app=null;await launch();p=await saved();assert.deepEqual(p.tracks.map(content),reopened.tracks.map(content));assert.equal(await command().inputValue(),'ASDFG');check('app restart recovers independently edited instruments');
 for(const format of ['mid','wav','mp3']){
  const file=path.join(out,'自动创作.'+format);await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file})},file);
  await page.getByRole('button',{name:'导出',exact:true}).click();await page.getByRole('button',{name:'混音导出 · '+format.toUpperCase(),exact:true}).click();
  await page.waitForFunction(format=>{const text=document.querySelector('.notice-banner')?.textContent||'';return format==='mid'?text.includes('MIDI 已导出'):text.includes('自动创作.'+format)},format,{timeout:90000});
  await page.getByRole('dialog',{name:'正在导出',exact:true}).waitFor({state:'hidden'});assert.equal(await page.locator('.error-banner').count(),0);assert((await stat(file)).size>100);
 }
 check('automatically created multitrack music exports MIDI, WAV and MP3');
 const image=await app.evaluate(async({BrowserWindow})=>Array.from((await BrowserWindow.getAllWindows()[0].capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG()));await writeFile(path.join(out,'workbench.png'),Buffer.from(image));
 assert.deepEqual(errors,[]);check('renderer console stays clean');report.errors=errors;
}catch(error){report.failure=String(error);report.errors=errors;if(page)report.page=await page.locator('body').innerText().catch(()=>'<unavailable>');throw error}finally{report.finished=new Date().toISOString();await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));if(app)await app.close()}
