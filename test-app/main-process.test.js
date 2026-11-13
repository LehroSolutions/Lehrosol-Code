'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { createRequire } = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const filename = path.resolve(__dirname, '../electron/main.js');
const actualRequire = createRequire(filename);

async function mainFixture() {
  const handlers = new Map();
  const app = new EventEmitter();
  app.commandLine = { hasSwitch: () => false };
  app.whenReady = () => Promise.resolve(); app.getVersion = () => '2.4.2';
  let win, preferences, permissionRequest, permissionCheck;
  const opened = [];
  let child;
  function makeChild() {
    const c = new EventEmitter();
    c.stdout = new PassThrough(); c.stderr = new PassThrough(); c.stdin = new PassThrough();
    c.pid = 10; c.exitCode = null; c.kill = () => { c.exitCode = 1; c.emit('close', 1); };
    return c;
  }
  class BrowserWindow {
    constructor(opts) { preferences = opts.webPreferences; win = this; this.webContents = new EventEmitter(); this.webContents.mainFrame = {}; this.webContents.send = () => {}; this.webContents.setWindowOpenHandler = (f) => { this.openHandler = f; }; }
    loadFile(file) { this.webContents.mainFrame.url = require('node:url').pathToFileURL(file).href; }
    isDestroyed() { return false; }
    static getAllWindows() { return [win]; }
  }
  const confinement = actualRequire('./pathConfinement'); confinement.reset();
  const fakeRequire = (name) => {
    if (name === 'electron') return { app, BrowserWindow, net: { fetch: async () => {} }, ipcMain: { handle: (key, fn) => handlers.set(key, fn) }, dialog: {}, shell: { openExternal: async (url) => opened.push(url), openPath: async () => '' }, session: { defaultSession: { setPermissionRequestHandler: (fn) => { permissionRequest = fn; }, setPermissionCheckHandler: (fn) => { permissionCheck = fn; } } } };
    if (name === './bridge') return { info: () => ({ cli: null }), spawnCli: () => { child = makeChild(); return child; } };
    if (name === 'node:child_process') return { spawn: () => makeChild() };
    if (name === './updates') return { ...actualRequire('./updates'), checkForUpdates: async () => ({ ok: true, releaseUrl: 'https://github.com/LehroSolutions/Lehrosol-Code/releases/tag/v2.4.3' }) };
    return actualRequire(name);
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { require: fakeRequire, __dirname: path.dirname(filename), process, console, Set, Map, Promise, Buffer, TextDecoder });
  await Promise.resolve();
  const event = () => ({ sender: win.webContents, senderFrame: win.webContents.mainFrame });
  return { handlers, event, win, preferences, permissionRequest, permissionCheck, confinement, opened, child: () => child };
}
test('IPC accepts only the own top-level app frame and sandbox permissions deny', async () => {
  const f = await mainFixture();
  assert.equal(f.preferences.sandbox, true);
  assert.equal(f.handlers.get('lehro:info')(f.event()).appVersion, '2.4.2');
  assert.throws(() => f.handlers.get('lehro:info')({ sender: f.win.webContents, senderFrame: { url: 'https://evil.test' } }), /untrusted/);
  assert.throws(() => f.handlers.get('lehro:info')({ sender: {}, senderFrame: f.win.webContents.mainFrame }), /untrusted/);
  let allowed; f.permissionRequest(null, 'camera', (value) => { allowed = value; });
  assert.equal(allowed, false); assert.equal(f.permissionCheck(), false);
  let prevented = false; f.win.webContents.emit('will-navigate', { preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
});
test('async mission spawn error rejects gracefully without unhandled error', async () => {
  const f = await mainFixture();
  const result = f.handlers.get('lehro:streamStart')(f.event(), { id: 'm1', args: ['code', 'test'] });
  f.child().emit('error', new Error('ENOENT'));
  assert.equal((await result).ok, false);
});
test('active mission ids cannot replace a process and cancellation stops the child', async () => {
  const f = await mainFixture();
  const running = f.handlers.get('lehro:streamStart')(f.event(), { id: 'm1', args: [] });
  f.child().emit('spawn'); assert.equal((await running).ok, true);
  assert.equal(f.handlers.get('lehro:streamStart')(f.event(), { id: 'm1', args: [] }).ok, false);
  assert.equal(f.handlers.get('lehro:streamStop')(f.event(), { id: 'm1' }).ok, true);
});
test('optimistic save rejects external changes and preserves bytes', async () => {
  const f = await mainFixture();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-write-'));
  try {
    const file = path.join(dir, 'app.js'); fs.writeFileSync(file, 'external'); f.confinement.addRoot(dir);
    const write = f.handlers.get('project:write');
    assert.equal(write(f.event(), { file, content: 'draft', expectedContent: 'original' }).ok, false);
    assert.equal(fs.readFileSync(file, 'utf8'), 'external');
    assert.equal(write(f.event(), { file, content: 'saved', expectedContent: 'external' }).ok, true);
    assert.equal(fs.readFileSync(file, 'utf8'), 'saved');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('openRelease accepts only a URL approved by a completed update check', async () => {
  const f = await mainFixture();
  assert.equal((await f.handlers.get('app:openRelease')(f.event(), 'https://github.com/LehroSolutions/Lehrosol-Code/releases/tag/v2.4.3')).ok, false);
  await f.handlers.get('app:checkUpdates')(f.event());
  assert.equal((await f.handlers.get('app:openRelease')(f.event(), 'https://github.com/LehroSolutions/Lehrosol-Code/releases/tag/v2.4.3')).ok, true);
  assert.equal(f.opened.length, 1);
});

test('file reads bound large previews and reject binary or invalid UTF-8 content', async () => {
  const f = await mainFixture();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-preview-'));
  try {
    f.confinement.addRoot(dir);
    const read = f.handlers.get('project:read');
    const large = path.join(dir, 'large.txt'); fs.writeFileSync(large, 'x'.repeat(400100));
    const preview = read(f.event(), { file: large });
    assert.equal(preview.content.length, 400000); assert.equal(preview.truncated, true);
    const binary = path.join(dir, 'binary.dat'); fs.writeFileSync(binary, Buffer.from([0, 1, 2]));
    assert.equal(read(f.event(), { file: binary }).ok, false);
    const invalid = path.join(dir, 'invalid.txt'); fs.writeFileSync(invalid, Buffer.from([0xff, 0xfe, 0x41]));
    assert.equal(read(f.event(), { file: invalid }).ok, false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
