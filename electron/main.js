'use strict';
// Lehrosol Code — Electron main process. Owns the window, the terminal
// shells, mission streams, and all filesystem/CLI access. The renderer is
// fully sandboxed (contextIsolation on, nodeIntegration off) and only reaches
// the machine through the vetted IPC surface below.
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const bridge = require('./bridge');

let win = null;
const missionStreams = new Map();
const terminals = new Map();

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1080,
    minHeight: 680,
    backgroundColor: '#070b09',
    title: 'Lehrosol Code',
    icon: path.join(__dirname, '..', 'renderer', 'assets', 'logo.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('before-quit', () => {
  for (const child of missionStreams.values()) { try { child.kill(); } catch { /* gone */ } }
  for (const term of terminals.values()) { try { term.kill(); } catch { /* gone */ } }
});

// ---- CLI awareness ---------------------------------------------------------
ipcMain.handle('lehro:info', () => bridge.info());
ipcMain.handle('lehro:runJson', (_e, { args, timeoutMs }) => bridge.runJson((Array.isArray(args) ? args : []).map(String), timeoutMs ? Number(timeoutMs) : undefined));
ipcMain.handle('lehro:snapshot', () => bridge.snapshot());
ipcMain.handle('lehro:vault', () => bridge.vault());
ipcMain.handle('lehro:addRoot', (_e, { dir }) => bridge.addVaultRoot(String(dir)));
ipcMain.handle('lehro:serveState', () => bridge.serveState());
ipcMain.handle('lehro:ping', (_e, { port, apiKey }) => bridge.pingServer(Number(port), apiKey ? String(apiKey) : undefined));
ipcMain.handle('lehro:nativeScan', (_e, { extraDirs } = {}) => bridge.nativeScan(Array.isArray(extraDirs) ? extraDirs.map(String) : []));
ipcMain.handle('lehro:chat', (_e, opts) => bridge.chatOnce(opts || {}));
// CLI v3.2 quick-lane surface (engrams/scan/up/arena/recommend/doctor/
// adapters/modes) — the cockpit's panels consume these directly.
ipcMain.handle('lehro:engrams', (_e, { limit } = {}) => bridge.engramsList(limit));
ipcMain.handle('lehro:doctor', () => bridge.doctor());
ipcMain.handle('lehro:adapters', () => bridge.adaptersList());
ipcMain.handle('lehro:modes', () => bridge.modesList());
ipcMain.handle('lehro:recommend', () => bridge.recommend());
ipcMain.handle('lehro:cliScan', (_e, { folder } = {}) => bridge.cliScan(folder ? String(folder) : undefined));
ipcMain.handle('lehro:up', (_e, opts = {}) => bridge.up(opts || {}));
ipcMain.handle('lehro:arena', (_e, opts = {}) => bridge.arenaRun(opts || {}));
// Local-model quality guards: context-aware suggestion budgeting and the
// background-load validity check for every tok/s reading.
ipcMain.handle('lehro:suggestionPlan', (_e, opts = {}) => bridge.suggestionPlan(opts || {}));
ipcMain.handle('lehro:cpuLoad', (_e, { sampleMs } = {}) => bridge.cpuLoad(sampleMs));
// Lets the user point the app at bin/lehrosol.js at runtime (persisted by the
// renderer, re-applied on boot) — no environment fiddling required.
ipcMain.handle('lehro:setCliPath', (_e, { cliPath }) => {
  if (cliPath && fs.existsSync(String(cliPath))) {
    process.env.LEHROSOL_BIN = String(cliPath);
    return { ok: true, ...bridge.info() };
  }
  return { ok: false, error: 'File not found', ...bridge.info() };
});
ipcMain.handle('lehro:pickFile', async () => {
  const result = await dialog.showOpenDialog(win, { properties: ['openFile'] });
  return result.canceled ? null : result.filePaths[0];
});

// ---- Mission streams (loop runs, long CLI commands) ------------------------
ipcMain.handle('lehro:streamStart', (_e, { id, args, cwd }) => {
  try {
    const child = bridge.spawnCli((Array.isArray(args) ? args : []).map(String), { cwd: cwd || undefined });
    missionStreams.set(String(id), child);
    child.stdout.on('data', (d) => send('lehro:streamData', { id, chunk: d.toString() }));
    child.stderr.on('data', (d) => send('lehro:streamData', { id, chunk: d.toString() }));
    child.on('close', (code) => { missionStreams.delete(String(id)); send('lehro:streamEnd', { id, code }); });
    return { ok: true, pid: child.pid };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
ipcMain.handle('lehro:streamStop', (_e, { id }) => {
  const child = missionStreams.get(String(id));
  if (child) { try { child.kill(); } catch { /* gone */ } }
  return { ok: Boolean(child) };
});

// ---- Integrated terminal (line-based shell) --------------------------------
ipcMain.handle('term:create', (_e, { id, cwd }) => {
  const shellBin = process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL || 'bash');
  const shellArgs = process.platform === 'win32' ? ['-NoLogo'] : ['-i'];
  try {
    const proc = spawn(shellBin, shellArgs, { cwd: cwd || undefined, env: process.env, windowsHide: true });
    terminals.set(String(id), proc);
    proc.stdout.on('data', (d) => send('term:data', { id, chunk: d.toString() }));
    proc.stderr.on('data', (d) => send('term:data', { id, chunk: d.toString() }));
    proc.on('close', (code) => { terminals.delete(String(id)); send('term:exit', { id, code }); });
    return { ok: true, shell: shellBin };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
ipcMain.handle('term:input', (_e, { id, data }) => {
  const proc = terminals.get(String(id));
  if (proc) proc.stdin.write(String(data));
  return { ok: Boolean(proc) };
});
ipcMain.handle('term:kill', (_e, { id }) => {
  const proc = terminals.get(String(id));
  if (proc) { try { proc.kill(); } catch { /* gone */ } }
  return { ok: Boolean(proc) };
});

// ---- Project workspace ------------------------------------------------------
ipcMain.handle('project:pick', async () => {
  const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('project:tree', (_e, { dir }) => bridge.listTree(String(dir)));
ipcMain.handle('project:read', (_e, { file }) => {
  try {
    const text = fs.readFileSync(String(file), 'utf8');
    return { ok: true, content: text.slice(0, 400000), truncated: text.length > 400000 };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
ipcMain.handle('project:write', (_e, { file, content }) => {
  try {
    fs.writeFileSync(String(file), String(content));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
