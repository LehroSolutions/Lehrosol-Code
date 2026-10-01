'use strict';
// Lehrosol Code — Electron main process. Owns the window, the terminal
// shells, mission streams, and all filesystem/CLI access. The renderer runs
// with contextIsolation on, nodeIntegration off, and no remote module, and it
// has no direct filesystem access — the Chromium sandbox, however, is
// currently DISABLED (see webPreferences.sandbox). The security model
// therefore rests on the narrow invoke-only bridge in preload.js plus two
// invariants enforced here: every IPC call must come from this window's own
// webContents (guard), and every project path must land inside a folder the
// user picked in a native dialog (pathConfinement). Turning the sandbox on is
// tracked follow-up work — it needs preload.js reworked first.
const { app, BrowserWindow, ipcMain, dialog, shell, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const bridge = require('./bridge');
const confinement = require('./pathConfinement');

let win = null;
const missionStreams = new Map();
const terminals = new Map();

const READ_CAP = 400000;
const WRITE_CAP = 8 * 1024 * 1024;

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

// Any webContents that is not this window's (a <webview>, a second window, a
// navigated frame) must not reach the machine. Throwing rejects the renderer's
// invoke promise, so no handler needs its own check.
function guard(event) {
  if (!win || win.isDestroyed() || !event || event.sender !== win.webContents) {
    throw new Error('IPC rejected: untrusted sender');
  }
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
      sandbox: false, // deliberate: preload.js needs Node. See the header note.
    },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  // The app needs no camera, mic, geolocation, notifications, or MIDI.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, cb) => cb({ action: 'deny' }));
  createWindow();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('before-quit', () => {
  for (const child of missionStreams.values()) { try { child.kill(); } catch { /* gone */ } }
  for (const term of terminals.values()) { try { term.kill(); } catch { /* gone */ } }
});

// ---- CLI awareness ---------------------------------------------------------
ipcMain.handle('lehro:info', (e) => { guard(e); return bridge.info(); });
ipcMain.handle('lehro:runJson', (e, { args, timeoutMs }) => { guard(e); return bridge.runJson((Array.isArray(args) ? args : []).map(String), timeoutMs ? Number(timeoutMs) : undefined); });
ipcMain.handle('lehro:snapshot', (e) => { guard(e); return bridge.snapshot(); });
ipcMain.handle('lehro:vault', (e) => { guard(e); return bridge.vault(); });
ipcMain.handle('lehro:addRoot', (e, { dir }) => { guard(e); return bridge.addVaultRoot(String(dir)); });
ipcMain.handle('lehro:serveState', (e) => { guard(e); return bridge.serveState(); });
ipcMain.handle('lehro:ping', (e, { port, apiKey }) => { guard(e); return bridge.pingServer(Number(port), apiKey ? String(apiKey) : undefined); });
ipcMain.handle('lehro:nativeScan', (e, { extraDirs } = {}) => { guard(e); return bridge.nativeScan(Array.isArray(extraDirs) ? extraDirs.map(String) : []); });
ipcMain.handle('lehro:chat', (e, opts) => { guard(e); return bridge.chatOnce(opts || {}); });
// CLI v3.2 quick-lane surface (engrams/scan/up/arena/recommend/doctor/
// adapters/modes) — the cockpit's panels consume these directly.
ipcMain.handle('lehro:engrams', (e, { limit } = {}) => { guard(e); return bridge.engramsList(limit); });
ipcMain.handle('lehro:doctor', (e) => { guard(e); return bridge.doctor(); });
ipcMain.handle('lehro:adapters', (e) => { guard(e); return bridge.adaptersList(); });
ipcMain.handle('lehro:modes', (e) => { guard(e); return bridge.modesList(); });
ipcMain.handle('lehro:recommend', (e) => { guard(e); return bridge.recommend(); });
ipcMain.handle('lehro:cliScan', (e, { folder } = {}) => { guard(e); return bridge.cliScan(folder ? String(folder) : undefined); });
ipcMain.handle('lehro:up', (e, opts = {}) => { guard(e); return bridge.up(opts || {}); });
ipcMain.handle('lehro:arena', (e, opts = {}) => { guard(e); return bridge.arenaRun(opts || {}); });
// Local-model quality guards: context-aware suggestion budgeting and the
// background-load validity check for every tok/s reading.
ipcMain.handle('lehro:suggestionPlan', (e, opts = {}) => { guard(e); return bridge.suggestionPlan(opts || {}); });
ipcMain.handle('lehro:cpuLoad', (e, { sampleMs } = {}) => { guard(e); return bridge.cpuLoad(sampleMs); });
// Lets the user point the app at bin/lehrosol.js at runtime (persisted by the
// renderer, re-applied on boot) — no environment fiddling required.
ipcMain.handle('lehro:setCliPath', (e, { cliPath }) => {
  guard(e);
  if (cliPath && fs.existsSync(String(cliPath))) {
    process.env.LEHROSOL_BIN = String(cliPath);
    return { ok: true, ...bridge.info() };
  }
  return { ok: false, error: 'File not found', ...bridge.info() };
});
ipcMain.handle('lehro:pickFile', async (e) => {
  guard(e);
  const result = await dialog.showOpenDialog(win, { properties: ['openFile'] });
  return result.canceled ? null : result.filePaths[0];
});

// ---- Mission streams (loop runs, long CLI commands) ------------------------
ipcMain.handle('lehro:streamStart', (e, { id, args, cwd }) => {
  guard(e);
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
ipcMain.handle('lehro:streamStop', (e, { id }) => {
  guard(e);
  const child = missionStreams.get(String(id));
  if (child) { try { child.kill(); } catch { /* gone */ } }
  return { ok: Boolean(child) };
});

// ---- Integrated terminal (line-based shell) --------------------------------
ipcMain.handle('term:create', (e, { id, cwd }) => {
  guard(e);
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
ipcMain.handle('term:input', (e, { id, data }) => {
  guard(e);
  const proc = terminals.get(String(id));
  if (proc) proc.stdin.write(String(data));
  return { ok: Boolean(proc) };
});
ipcMain.handle('term:kill', (e, { id }) => {
  guard(e);
  const proc = terminals.get(String(id));
  if (proc) { try { proc.kill(); } catch { /* gone */ } }
  return { ok: Boolean(proc) };
});

// ---- Project workspace ------------------------------------------------------
// project:pick is the single writer of the allowlist: the user consents to a
// directory in a native dialog, and everything below is confined to it.
ipcMain.handle('project:pick', async (e) => {
  guard(e);
  const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  if (result.canceled) return null;
  confinement.addRoot(result.filePaths[0]);
  return result.filePaths[0];
});
ipcMain.handle('project:tree', (e, { dir }) => {
  guard(e);
  const target = confinement.resolveInside(dir);
  if (!target.ok) return target;
  return bridge.listTree(target.path);
});
ipcMain.handle('project:read', (e, { file }) => {
  guard(e);
  const target = confinement.resolveInside(file);
  if (!target.ok) return target;
  try {
    const text = fs.readFileSync(target.path, 'utf8');
    return { ok: true, content: text.slice(0, READ_CAP), truncated: text.length > READ_CAP };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
ipcMain.handle('project:write', (e, { file, content }) => {
  guard(e);
  const target = confinement.resolveInside(file);
  if (!target.ok) return target;
  const body = String(content == null ? '' : content);
  if (Buffer.byteLength(body, 'utf8') > WRITE_CAP) {
    return { ok: false, error: `Refusing to write more than ${WRITE_CAP} bytes` };
  }
  try {
    fs.writeFileSync(target.path, body);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
