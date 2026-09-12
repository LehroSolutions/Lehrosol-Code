'use strict';
// Lehrosol Code preload — the only door between the sandboxed renderer and
// the machine. Exposes a narrow, promise-based API; no Node globals leak.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lehro', {
  info: () => ipcRenderer.invoke('lehro:info'),
  runJson: (args, timeoutMs) => ipcRenderer.invoke('lehro:runJson', { args, timeoutMs }),
  snapshot: () => ipcRenderer.invoke('lehro:snapshot'),
  vault: () => ipcRenderer.invoke('lehro:vault'),
  addRoot: (dir) => ipcRenderer.invoke('lehro:addRoot', { dir }),
  serveState: () => ipcRenderer.invoke('lehro:serveState'),
  ping: (opts) => ipcRenderer.invoke('lehro:ping', opts),
  nativeScan: (opts) => ipcRenderer.invoke('lehro:nativeScan', opts || {}),
  chat: (opts) => ipcRenderer.invoke('lehro:chat', opts),
  engrams: (limit) => ipcRenderer.invoke('lehro:engrams', { limit }),
  doctor: () => ipcRenderer.invoke('lehro:doctor'),
  adapters: () => ipcRenderer.invoke('lehro:adapters'),
  modes: () => ipcRenderer.invoke('lehro:modes'),
  recommend: () => ipcRenderer.invoke('lehro:recommend'),
  cliScan: (folder) => ipcRenderer.invoke('lehro:cliScan', { folder }),
  up: (opts) => ipcRenderer.invoke('lehro:up', opts || {}),
  arena: (opts) => ipcRenderer.invoke('lehro:arena', opts || {}),
  suggestionPlan: (opts) => ipcRenderer.invoke('lehro:suggestionPlan', opts || {}),
  cpuLoad: (sampleMs) => ipcRenderer.invoke('lehro:cpuLoad', { sampleMs }),
  setCliPath: (cliPath) => ipcRenderer.invoke('lehro:setCliPath', { cliPath }),
  pickFile: () => ipcRenderer.invoke('lehro:pickFile'),

  streamStart: (opts) => ipcRenderer.invoke('lehro:streamStart', opts),
  streamStop: (opts) => ipcRenderer.invoke('lehro:streamStop', opts),
  onStream: (cb) => {
    ipcRenderer.on('lehro:streamData', (_e, msg) => cb('data', msg));
    ipcRenderer.on('lehro:streamEnd', (_e, msg) => cb('end', msg));
  },

  termCreate: (opts) => ipcRenderer.invoke('term:create', opts),
  termInput: (opts) => ipcRenderer.invoke('term:input', opts),
  termKill: (opts) => ipcRenderer.invoke('term:kill', opts),
  onTerm: (cb) => {
    ipcRenderer.on('term:data', (_e, msg) => cb('data', msg));
    ipcRenderer.on('term:exit', (_e, msg) => cb('exit', msg));
  },

  projectPick: () => ipcRenderer.invoke('project:pick'),
  projectTree: (opts) => ipcRenderer.invoke('project:tree', opts),
  projectRead: (opts) => ipcRenderer.invoke('project:read', opts),
  projectWrite: (opts) => ipcRenderer.invoke('project:write', opts),
});
