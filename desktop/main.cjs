const { app, BrowserWindow, ipcMain, dialog, protocol, net, screen } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { randomBytes, randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');

protocol.registerSchemesAsPrivileged([{scheme:'workbench',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
const root = app.isPackaged ? process.resourcesPath : path.resolve(__dirname,'..');
const uiRoot = app.isPackaged ? path.join(app.getAppPath(),'dist') : path.join(root,'dist');
const devURL = process.env.WORKBENCH_DEV_URL;
const userHome = process.env.WORKBENCH_HOME || app.getPath('userData');
if(process.env.WORKBENCH_HOME) app.setPath('userData',userHome);
const token = randomBytes(32).toString('hex');
let backend, backendURL, window, quitting=false, starting;
const logDir = path.join(userHome,'logs');
fs.mkdirSync(logDir,{recursive:true});
const log = fs.createWriteStream(path.join(logDir,'desktop.log'),{flags:'a'});

function pythonPath() {
  if(!app.isPackaged) return path.join(root,'.venv','Scripts','python.exe');
  const dirs=fs.readdirSync(path.join(root,'python'));
  const python=dirs.find(x=>x.startsWith('cpython-'));
  if(!python) throw new Error('独立 Python 运行环境缺失，请重新安装。');
  return path.join(root,'python',python,'python.exe');
}
function startBackend() {
  if(starting) return starting;
  starting=new Promise((resolve,reject)=>{
    let ready=false;
    try {
      backend=spawn(pythonPath(),['-u','-m','backend.server'],{
        cwd:root,windowsHide:true,env:{...process.env,WORKBENCH_HOME:userHome,
        WORKBENCH_TOKEN:token,WORKBENCH_FFMPEG:path.join(root,'vendor','ffmpeg.exe'),
        PYTHONPATH:[root,app.isPackaged ? path.join(root,'python','site-packages') : ''].filter(Boolean).join(path.delimiter),
        PYTHONUTF8:'1',OMP_NUM_THREADS:'2',OPENBLAS_NUM_THREADS:'2',NUMBA_NUM_THREADS:'2'}
      });
      const child=backend;
      let buffer='';
      backend.stdout.on('data',chunk=>{
        buffer+=chunk.toString();
        let end;
        while((end=buffer.indexOf('\n'))>=0){
          const line=buffer.slice(0,end).trim(); buffer=buffer.slice(end+1);
          if(line.startsWith('WORKBENCH_READY ')){
            backendURL='http://127.0.0.1:'+JSON.parse(line.slice(16)).port;
            fetch(backendURL+'/health',{headers:{'x-workbench-token':token}}).then(async response=>{
              if(!response.ok || (await response.json()).status!=='ok')throw new Error('后端健康检查失败');
              if(backend!==child)return;
              ready=true;clearTimeout(timeout);resolve();
            }).catch(error=>{clearTimeout(timeout);killBackend();reject(error)});
          } else log.write(line+'\n');
        }
      });
      backend.stderr.on('data',chunk=>log.write(chunk));
      backend.on('error',e=>{clearTimeout(timeout);reject(e);});
      backend.on('exit',code=>{
        if(backend!==child)return;
        backendURL=undefined;starting=undefined;
        if(!ready) reject(new Error('后端启动失败：'+code+'，请导出日志。'));
        if(window&&!quitting) window.webContents.send('backend-exit',code);
      });
      const timeout=setTimeout(()=>{killBackend();reject(new Error('后端启动超时，请重试。'))},45000);
    } catch(e){reject(e);}
  }).catch(e=>{starting=undefined;throw e;});
  return starting;
}
function killBackend(){
  if(backend && backend.exitCode===null) spawn('taskkill',['/PID',String(backend.pid),'/T','/F'],{windowsHide:true});
}
async function request(route,body,method='GET',binary=false){
  await startBackend();
  const response=await fetch(backendURL+route,{method,headers:{'x-workbench-token':token,'Content-Type':'application/json'},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(!response.ok){
    const err=await response.json().catch(()=>({detail:response.statusText}));
    throw new Error(typeof err.detail==='string'?err.detail:JSON.stringify(err.detail));
  }
  return binary ? new Uint8Array(await response.arrayBuffer()) : response.json();
}
function trusted(event){
  if(!window || event.sender!==window.webContents) throw new Error('无效的桌面调用来源');
  const url=event.senderFrame?.url || '';
  if(!(url.startsWith('workbench://app/') || (devURL&&url.startsWith(devURL+'/')))) throw new Error('无效的页面来源');
}
function handle(name,fn){
  ipcMain.handle(name,async(e,...args)=>{trusted(e);return fn(...args);});
}
function installIPC(){
  handle('api',async(route,body,method='GET')=>{
    if(typeof route!=='string'||!/^\/(health|presets|fonts|projects(?:\/(?:new|recovery|[a-f0-9-]{36}))?|jobs(?:\/[a-f0-9-]{36}(?:\/cancel)?)?|peaks\/[a-f0-9-]{36}\/audio\/[\w.-]+\.wav)$/.test(route))
      throw new Error('接口不允许访问');
    if(!['GET','POST','PUT'].includes(method)) throw new Error('请求方法不允许');
    return request(route,body,method);
  });
  handle('read-audio',(id,asset)=>{
    if(!/^[a-f0-9-]{36}$/.test(id)||!/^audio\/[\w.-]+\.wav$/.test(asset)) throw new Error('音频路径无效');
    return request('/audio/'+id+'/'+asset,undefined,'GET',true);
  });
  handle('read-font',ident=>{
    if(ident!=='generaluser'&&!/^[a-f0-9-]{36}$/.test(ident)) throw new Error('音源编号无效');
    return request('/fonts/'+ident,undefined,'GET',true);
  });
  handle('import-audio',async(dropPath)=>{
    let source=dropPath;
    if(!source){
      const r=await dialog.showOpenDialog(window,{title:'导入音乐',filters:[{name:'音频',extensions:['wav','mp3','flac','m4a']}],properties:['openFile']});
      if(r.canceled)return null; source=r.filePaths[0];
    }
    if(typeof source!=='string'||!['.wav','.mp3','.flac','.m4a'].includes(path.extname(source).toLowerCase())) throw new Error('请选择支持的音频文件');
    return request('/files/import',{path:source},'POST');
  });
  handle('open-project',async()=>{
    const r=await dialog.showOpenDialog(window,{filters:[{name:'MusicWorkbench 工程',extensions:['mwork']}],properties:['openFile']});
    return r.canceled?null:request('/files/open',{path:r.filePaths[0]},'POST');
  });
  handle('save-project',async(project)=>{
    const r=await dialog.showSaveDialog(window,{defaultPath:project.name+'.mwork',filters:[{name:'音乐工程',extensions:['mwork']}]});
    return r.canceled?null:request('/files/save',{path:r.filePath,project},'POST');
  });
  handle('export-midi',async(project,trackIds)=>{
    const r=await dialog.showSaveDialog(window,{defaultPath:project.name+'.mid',filters:[{name:'MIDI',extensions:['mid']}]});
    return r.canceled?null:request('/files/midi',{path:r.filePath,project,trackIds},'POST');
  });
  handle('export-audio',async(data,format,name)=>{
    if(!(data instanceof Uint8Array)||data.byteLength>240*1024*1024||!['wav','mp3'].includes(format)) throw new Error('导出音频无效');
    const r=await dialog.showSaveDialog(window,{defaultPath:name+'.'+format,filters:[{name:format.toUpperCase(),extensions:[format]}]});
    if(r.canceled)return null;
    const exports=path.join(userHome,'exports'); await fsp.mkdir(exports,{recursive:true});
    const file=randomUUID()+'.wav'; await fsp.writeFile(path.join(exports,file),data);
    return request('/files/encode',{source:file,path:r.filePath,format},'POST');
  });
  handle('import-pack',async()=>{
    const r=await dialog.showOpenDialog(window,{filters:[{name:'离线资源包',extensions:['zip']}],properties:['openFile']});
    return r.canceled?null:request('/files/pack',{path:r.filePaths[0]},'POST');
  });
  handle('import-font',async()=>{
    const r=await dialog.showOpenDialog(window,{filters:[{name:'SoundFont',extensions:['sf2']}],properties:['openFile']});
    return r.canceled?null:request('/files/soundfont',{path:r.filePaths[0]},'POST');
  });
  handle('logs',async()=>{
    const r=await dialog.showSaveDialog(window,{defaultPath:'MusicWorkbench-logs.zip',filters:[{name:'诊断日志',extensions:['zip']}]});
    if(r.canceled)return null;
    if(!backendURL){
      await fsp.copyFile(path.join(logDir,'desktop.log'),r.filePath.replace(/\.zip$/i,'.log'));
      return {path:r.filePath.replace(/\.zip$/i,'.log')};
    }
    return request('/files/logs',{path:r.filePath},'POST');
  });
  handle('restart',async()=>{killBackend();await new Promise(r=>setTimeout(r,1000));starting=undefined;await startBackend();return true;});
}
if(!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance',()=>{window?.show();window?.focus();});
  app.whenReady().then(async()=>{
    protocol.handle('workbench',req=>{
      const url=new URL(req.url);
      const relative=decodeURIComponent(url.pathname).replace(/^\//,'') || 'index.html';
      const file=path.resolve(uiRoot,relative);
      if(!file.startsWith(uiRoot+path.sep)) return new Response('Forbidden',{status:403});
      return net.fetch(pathToFileURL(file).toString());
    });
    installIPC();
    const area=screen.getPrimaryDisplay().workAreaSize;
    window=new BrowserWindow({width:Math.min(1440,area.width),height:Math.min(960,area.height),minWidth:1080,minHeight:680,show:process.env.WORKBENCH_TEST!=='1',backgroundColor:'#10151e',
      title:'MusicWorkbench · 音乐工作台',icon:path.join(__dirname,'icon.ico'),autoHideMenuBar:true,
      webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
    window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    window.webContents.on('will-navigate',(event,url)=>{if(url!==window.webContents.getURL())event.preventDefault();});
    window.webContents.session.webRequest.onHeadersReceived((details,callback)=>{
      callback({responseHeaders:{...details.responseHeaders,'Content-Security-Policy':[
        "default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self' "+(devURL?'ws://127.0.0.1:5173 http://127.0.0.1:5173':'')+"; object-src 'none'; base-uri 'none'; frame-src 'none'"]}});
    });
    await window.loadURL(devURL||'workbench://app/index.html');
  });
}
app.on('before-quit',()=>{quitting=true;killBackend();log.end();});
app.on('window-all-closed',()=>app.quit());
