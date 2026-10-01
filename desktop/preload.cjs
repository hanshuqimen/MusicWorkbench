const {contextBridge,ipcRenderer,webUtils}=require('electron');
contextBridge.exposeInMainWorld('workbench',{
  api:(route,body,method)=>ipcRenderer.invoke('api',route,body,method),
  readAudio:(id,asset)=>ipcRenderer.invoke('read-audio',id,asset),
  readFont:id=>ipcRenderer.invoke('read-font',id),
  importAudio:file=>ipcRenderer.invoke('import-audio',file?webUtils.getPathForFile(file):undefined),
  openProject:()=>ipcRenderer.invoke('open-project'),
  saveProject:project=>ipcRenderer.invoke('save-project',project),
  exportMidi:(project,ids)=>ipcRenderer.invoke('export-midi',project,ids),
  exportAudio:(data,format,name)=>ipcRenderer.invoke('export-audio',data,format,name),
  importPack:()=>ipcRenderer.invoke('import-pack'),
  importFont:()=>ipcRenderer.invoke('import-font'),
  logs:()=>ipcRenderer.invoke('logs'),
  restart:()=>ipcRenderer.invoke('restart'),
  uninstall:()=>ipcRenderer.invoke('uninstall'),
  onBackendExit:fn=>{const listener=(_,code)=>fn(code);ipcRenderer.on('backend-exit',listener);return()=>ipcRenderer.removeListener('backend-exit',listener);}
});
