'use strict';
// Lehrosol Code — Electron main process. Owns the window, the terminal
// shells, mission streams, and all filesystem/CLI access. The renderer runs
// with context isolation, Chromium sandboxing, and no Node integration.
// Privileged calls require the application's top-level frame and project
// paths remain inside explicitly selected folders.
const { app, BrowserWindow, ipcMain, dialog, shell, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const bridge = require('./bridge');
const confinement = require('./pathConfinement');
const updates = require('./updates');
const installation = require('./installation');
const { pathToFileURL } = require('node:url');
const APP_PAGE = pathToFileURL(path.join(__dirname, '..', 'renderer', 'index.html')).href;
if (app.commandLine.hasSwitch('user-data-dir')) app.setPath('userData', app.commandLine.getSwitchValue('user-data-dir'));

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
  if (!win || win.isDestroyed() || !event || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || event.senderFrame.url !== APP_PAGE) {
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
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(win, { type: 'question', buttons: ['Keep editing', 'Discard and close'], defaultId: 0, cancelId: 0, message: 'Close with unsaved changes?', detail: 'Changes in your open files will be discarded.' });
    if (choice === 1) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (updates.trustedUrl(url)) shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  // The app needs no camera, mic, geolocation, notifications, or MIDI.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, cb) => cb(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  createWindow();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('will-quit', () => {
  for (const child of missionStreams.values()) stopChild(child);
  for (const term of terminals.values()) stopChild(term);
});

function stopChild(child) {
  if (!child || !child.pid || child.exitCode !== null) return false;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
    killer.on('error', () => { try { child.kill(); } catch {} });
  } else { try { child.kill(); } catch {} }
  return true;
}

function startStream(map, id, child, dataChannel, endChannel) {
  return new Promise((resolve) => {
    map.set(id, child);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => send(dataChannel, { id, chunk: d.toString() }));
    child.stderr.on('data', (d) => send(dataChannel, { id, chunk: d.toString() }));
    let failed = false;
    child.once('spawn', () => resolve({ ok: true, pid: child.pid }));
    child.on('error', (err) => {
      failed = true;
      if (map.get(id) === child) map.delete(id);
      send(dataChannel, { id, chunk: `Unable to start: ${err.message}\n` });
      send(endChannel, { id, code: 1, error: err.message });
      resolve({ ok: false, error: err.message });
    });
    child.on('close', (code) => {
      if (map.get(id) === child) map.delete(id);
      if (!failed) send(endChannel, { id, code });
    });
  });
}

let updateCheck = null;
const approvedReleaseLinks = new Set();
ipcMain.handle('app:checkUpdates', async (e) => {
  guard(e);
  if (!updateCheck) updateCheck = updates.checkForUpdates(app.getVersion()).finally(() => { updateCheck = null; });
  const [release, detected] = await Promise.all([
    updateCheck,
    installation.detectInstallation({ packaged: app.isPackaged }),
  ]);
  const result = { ...release, installedNotes: updates.installedReleaseNotes(app.getVersion()), installation: detected };
  for (const url of [result.releaseUrl, result.installerUrl, result.checksumUrl]) if (url) approvedReleaseLinks.add(url);
  return result;
});
ipcMain.handle('app:openRelease', async (e, url) => {
  guard(e);
  if (typeof url !== 'string' || !approvedReleaseLinks.has(url) || (!updates.trustedUrl(url) && !updates.trustedUrl(url, 'asset'))) return { ok: false, error: 'Unverified release link' };
  try { await shell.openExternal(url); return { ok: true }; } catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('app:openHelp', async (e) => {
  guard(e);
  try {
    const dir = path.join(app.getPath('userData'), 'help', app.getVersion());
    fs.mkdirSync(dir, { recursive: true });
    for (const file of ['glossary.html', 'USER-GUIDE.md']) fs.writeFileSync(path.join(dir, file), fs.readFileSync(path.join(__dirname, '..', 'docs', file)));
    const error = await shell.openPath(path.join(dir, 'glossary.html'));
    return error ? { ok: false, error } : { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
});

// ---- CLI awareness ---------------------------------------------------------
ipcMain.handle('lehro:info', (e) => { guard(e); return { ...bridge.info(), appVersion: app.getVersion() }; });
ipcMain.handle('lehro:runJson', (e, { args, timeoutMs }) => { guard(e); return bridge.runJson((Array.isArray(args) ? args : []).map(String), timeoutMs ? Number(timeoutMs) : undefined); });
ipcMain.handle('lehro:snapshot', (e) => { guard(e); return bridge.snapshot(); });
ipcMain.handle('lehro:vault', (e) => { guard(e); return bridge.vault(); });
ipcMain.handle('lehro:addRoot', (e, { dir }) => { guard(e); return bridge.addVaultRoot(String(dir)); });
ipcMain.handle('lehro:serveState', (e) => { guard(e); return bridge.serveState(); });
ipcMain.handle('lehro:usage', (e, { days } = {}) => { guard(e); return bridge.usage(days); });
ipcMain.handle('lehro:engineDetails', (e, opts = {}) => { guard(e); return bridge.engineDetails(opts); });
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
  if (typeof cliPath === 'string' && path.isAbsolute(cliPath) && fs.existsSync(cliPath) && fs.statSync(cliPath).isFile() && /\.(?:m?js|cmd|bat|exe)$/i.test(cliPath)) {
    process.env.LEHROSOL_BIN = cliPath;
    return { ok: true, ...bridge.info(), appVersion: app.getVersion() };
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
    if (typeof id !== 'string' || !id || missionStreams.has(id)) return { ok: false, error: 'Invalid or active mission id' };
    if (cwd) { const target = confinement.resolveInside(cwd); if (!target.ok) return target; cwd = target.path; }
    const child = bridge.spawnCli((Array.isArray(args) ? args : []).map(String), { cwd: cwd || undefined });
    return startStream(missionStreams, id, child, 'lehro:streamData', 'lehro:streamEnd');
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
ipcMain.handle('lehro:streamStop', (e, { id }) => {
  guard(e);
  const child = missionStreams.get(String(id));
  if (child) stopChild(child);
  return { ok: Boolean(child) };
});

// ---- Integrated terminal (line-based shell) --------------------------------
ipcMain.handle('term:create', (e, { id, cwd }) => {
  guard(e);
  const shellBin = process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL || 'bash');
  const shellArgs = process.platform === 'win32' ? ['-NoLogo', '-NoProfile', '-Command', '-'] : ['-i'];
  try {
    if (typeof id !== 'string' || !id || terminals.has(id)) return { ok: false, error: 'Invalid or active terminal id' };
    if (cwd) { const target = confinement.resolveInside(cwd); if (!target.ok) return target; cwd = target.path; }
    const proc = spawn(shellBin, shellArgs, { cwd: cwd || undefined, env: process.env, windowsHide: true });
    proc.stdin.on('error', () => {});
    return startStream(terminals, id, proc, 'term:data', 'term:exit').then((result) => ({ ...result, shell: shellBin }));
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
ipcMain.handle('term:input', (e, { id, data }) => {
  guard(e);
  const proc = terminals.get(String(id));
  if (!proc || proc.stdin.destroyed || !proc.stdin.writable) return { ok: false, error: 'Terminal is closed; retry to start a new shell' };
  try { proc.stdin.write(String(data)); return { ok: true }; } catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('term:kill', (e, { id }) => {
  guard(e);
  const proc = terminals.get(String(id));
  if (proc) stopChild(proc);
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
    const fd = fs.openSync(target.path, 'r');
    try {
      const size = fs.fstatSync(fd).size;
      const bytes = Buffer.alloc(Math.min(size, READ_CAP * 4 + 4));
      const length = fs.readSync(fd, bytes, 0, bytes.length, 0);
      const body = bytes.subarray(0, length);
      if (body.includes(0)) return { ok: false, error: 'Binary and UTF-16 files cannot be edited in the UTF-8 editor.' };
      const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
      const text = decoder.decode(body, { stream: size > length });
      return { ok: true, content: text.slice(0, READ_CAP), truncated: text.length > READ_CAP || size > length };
    } finally { fs.closeSync(fd); }
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
ipcMain.handle('project:write', (e, { file, content, expectedContent }) => {
  guard(e);
  const target = confinement.resolveInside(file);
  if (!target.ok) return target;
  const body = String(content == null ? '' : content);
  if (Buffer.byteLength(body, 'utf8') > WRITE_CAP) {
    return { ok: false, error: `Refusing to write more than ${WRITE_CAP} bytes` };
  }
  try {
    if (expectedContent !== undefined) {
      const matches = typeof expectedContent === 'string' && (fs.existsSync(target.path) ? fs.statSync(target.path).size === Buffer.byteLength(expectedContent, 'utf8') && fs.readFileSync(target.path, 'utf8') === expectedContent : expectedContent === '');
      if (!matches) return { ok: false, error: 'The file changed on disk. Reopen it before saving to avoid overwriting external changes.' };
    }
    fs.writeFileSync(target.path, body);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
