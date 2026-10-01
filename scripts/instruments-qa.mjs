import {createRequire} from 'node:module';
import {mkdir,copyFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{_electron}=createRequire(require.resolve('@playwright/cli/package.json'))('playwright');
const root=process.cwd(),out=path.join(root,'output/instruments-qa'),home=path.join(out,'userdata');
for(const [dir,files] of Object.entries({assets:['GeneralUser-GS.sf2'],models:['basic-pitch.onnx','5c90dfd2-34c22ccb.th','955717e8-8726e21a.th']})){
 await mkdir(path.join(home,dir),{recursive:true});for(const file of files)await copyFile(path.join(root,'vendor',file),path.join(home,dir,file));
}
const electron=await _electron.launch({executablePath:require('electron'),args:['.'],cwd:root,env:{...process.env,WORKBENCH_HOME:home,WORKBENCH_TEST:'1',WORKBENCH_DISABLE_GPU_DOWNLOAD:'1'}});
const page=await electron.firstWindow(),report={checks:[]},errors=[];page.on('pageerror',e=>errors.push(String(e)));
const check=label=>{report.checks.push(label);console.log('PASS',label)};
async function begin(){await page.getByRole('button',{name:'开始录制',exact:true}).click();await page.getByRole('button',{name:'结束录制',exact:true}).waitFor({timeout:15000})}
async function end(){await page.getByRole('button',{name:'结束录制',exact:true}).click();await page.getByRole('button',{name:'停止',exact:true}).click();await page.waitForTimeout(800)}
try{
 await page.getByRole('button',{name:'开始录制',exact:true}).waitFor({timeout:60000});await page.waitForFunction(()=>document.querySelector('.job-panel strong')?.textContent==='处理完成',{},{timeout:60000});
 await page.getByRole('button',{name:'新建',exact:true}).click();
 await page.getByRole('button',{name:'设置与资源',exact:true}).click();await page.getByLabel('工程时长（秒）',{exact:true}).fill('60');await page.getByRole('button',{name:'关闭设置',exact:true}).click();
 await page.getByRole('button',{name:'吉他',exact:true}).click();await begin();
 await page.getByRole('button',{name:'拨动第 1 弦',exact:true}).click();await page.waitForTimeout(750);
 assert.equal(await page.locator('.pluck-zone .pressed').count(),0);check('single guitar pluck releases its voice');
 const box=await page.locator('.pluck-zone').boundingBox();assert(box);
 await page.mouse.move(box.x+20,box.y+3);await page.mouse.down();await page.mouse.move(box.x+20,box.y+box.height-3,{steps:18});await page.mouse.up();await page.waitForTimeout(800);
 assert.equal(await page.locator('.pluck-zone .pressed').count(),0);await end();
 let p=await page.evaluate(()=>window.workbench.api('/projects/recovery'));
 assert(p.tracks.find(t=>t.instrument==='guitar').notes.length>=7);check('six-string sweep records separate, released notes');
 await page.getByRole('button',{name:'贝斯',exact:true}).click();await begin();await page.keyboard.down('a');await page.keyboard.down('s');await page.waitForTimeout(200);await page.keyboard.up('a');await page.keyboard.up('s');await end();
 p=await page.evaluate(()=>window.workbench.api('/projects/recovery'));assert.equal(p.tracks.find(t=>t.instrument==='bass').notes.length,2);check('four-string bass keyboard recording');
 await page.getByRole('button',{name:'鼓',exact:true}).click();await begin();await page.keyboard.down('a');await page.keyboard.down('s');await page.waitForTimeout(100);await page.keyboard.up('a');await page.keyboard.up('s');await end();
 p=await page.evaluate(()=>window.workbench.api('/projects/recovery'));assert.equal(p.tracks.find(t=>t.instrument==='drums').notes.length,2);check('drum-pad keyboard recording');
 assert.deepEqual(errors,[]);report.errors=errors;
}catch(error){report.failure=String(error);throw error}finally{await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await electron.close()}
