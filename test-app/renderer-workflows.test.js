'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function renderer(overrides = {}, storage = {}) {
  const elements = new Map();
  const windowEvents = {};
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, {
      id, innerHTML: '', textContent: '', value: '', checked: false, disabled: false, dataset: {},
      parentElement: { scrollTop: 0, scrollHeight: 0 }, style: { setProperty() {} },
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      handlers: {}, addEventListener(name, fn) { this.handlers[name] = fn; }, focus() {},
      setAttribute(name, value) { this[name] = value; }, scrollTop: 0, scrollHeight: 0,
      setPointerCapture() {}, removeEventListener() {},
    });
    return elements.get(id);
  };
  const writes = [];
  let termCallback;
  const bridge = {
    onStream() {}, onTerm(cb) { termCallback = cb; },
    projectRead: async ({ file }) => ({ ok: true, content: `original ${file}`, truncated: false }),
    projectWrite: async (opts) => { writes.push(opts); return { ok: true }; },
    projectPick: async () => '/new-project', projectTree: async () => [],
    termCreate: async () => ({ ok: true, shell: 'test' }), termKill: async () => ({ ok: true }),
    termInput: async () => ({ ok: true }),
    suggestionPlan: async () => ({ charBudget: 10000, maxTokens: 512 }),
    chat: async () => ({ ok: true, text: '```js\nimproved\n```', finishReason: 'stop' }),
    ...overrides,
  };
  const context = vm.createContext({
    window: { lehro: bridge, confirm: () => false, addEventListener: (name, cb) => { windowEvents[name] = cb; } },
    document: { getElementById: get, querySelectorAll: () => [], querySelector: (selector) => selector === '#agentsPill .dot' ? get('engineDot') : null,
      addEventListener() {}, documentElement: get('root'), body: get('body') },
    localStorage: { getItem: (key) => storage[key] ?? null, setItem: (key, value) => { storage[key] = value; } },
    setTimeout: () => 0, clearTimeout() {}, setInterval() {}, console,
  });
  const source = fs.readFileSync(path.join(__dirname, '../renderer/app.js'), 'utf8');
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../renderer/workspace.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../renderer/workbench.js'), 'utf8'), context);
  vm.runInContext(source.replace(/boot\(\)\.catch\([^\n]+\);\s*$/, ''), context);
  const run = (code) => vm.runInContext(code, context);
  run("state.info = { cli: 'test-cli', platform: 'linux', appVersion: '2.4.2' }; state.projectDir = '/project'; state.ping = { ok: true }; state.serve = { serve: { port: 7001 } };");
  return { run, get, writes, storage, windowEvents, emitTerm: (...args) => termCallback(...args) };
}

test('same-basename files retain independent tabs and saves', async () => {
  const r = renderer();
  await r.run("openFile('/project/src/index.js')");
  await r.run("openFile('/project/test/index.js')");
  assert.equal(r.run('state.tabs.length'), 3);
  assert.equal(r.run('currentFile().path'), '/project/test/index.js');
  r.run('selectTab(1)');
  await r.run('saveCurrentFile()');
  assert.equal(r.writes[0].file, '/project/src/index.js');
  assert.equal(r.writes[0].expectedContent, 'original /project/src/index.js');
});

test('switching tabs and reopening a file preserves its unsaved editor buffer', async () => {
  const r = renderer();
  await r.run("openFile('/project/one.js')");
  r.run('state.editing = true');
  r.get('editorTextarea').value = 'unsaved one';
  await r.run("openFile('/project/two.js')");
  await r.run("openFile('/project/one.js')");
  assert.equal(r.run('currentFile().content'), 'unsaved one');
  assert.equal(r.run('isDirty(currentFile())'), true);
  assert.equal(r.run('state.editing'), false);
});

test('dirty close and project switching are canceled without discard consent', async () => {
  const r = renderer();
  await r.run("openFile('/project/file.js')");
  r.run("currentFile().content = 'dirty'; closeTab(1)");
  assert.equal(r.run('state.tabs.length'), 2);
  await r.run('pickProject()');
  assert.equal(r.run('state.projectDir'), '/project');
  assert.equal(r.run('hasUnsavedChanges()'), true);
});

test('truncated file previews cannot be saved or rewritten', async () => {
  let chats = 0;
  const r = renderer({ projectRead: async () => ({ ok: true, content: 'prefix', truncated: true }),
    chat: async () => { chats++; return { ok: true }; } });
  await r.run("openFile('/project/large.txt')");
  await r.run('saveCurrentFile()');
  await r.run('requestSuggestion()');
  assert.equal(r.writes.length, 0);
  assert.equal(chats, 0);
  assert.equal(r.get('btnEditToggle').disabled, true);
});

test('a partial-context AI rewrite never requests or applies a replacement', async () => {
  let chats = 0;
  const r = renderer({ suggestionPlan: async () => ({ charBudget: 2, truncated: true }),
    chat: async () => { chats++; return { ok: true }; } });
  await r.run("openFile('/project/file.js')");
  await r.run('requestSuggestion()');
  assert.equal(chats, 0);
  assert.equal(r.run('state.suggestion'), null);
});

test('a suggestion finishing after switching files cannot overwrite the new file', async () => {
  const response = deferred();
  const r = renderer({ chat: () => response.promise });
  await r.run("openFile('/project/one.js')");
  const pending = r.run('requestSuggestion()');
  await Promise.resolve();
  await r.run("openFile('/project/two.js')");
  response.resolve({ ok: true, text: '```js\nwrong target\n```' });
  await pending;
  await r.run('applySuggestion()');
  assert.equal(r.writes.length, 0);
  assert.equal(r.run('currentFile().content'), 'original /project/two.js');
});

test('editing after a suggestion makes it stale and prevents Apply', async () => {
  const r = renderer();
  await r.run("openFile('/project/file.js')");
  await r.run('requestSuggestion()');
  r.run("currentFile().content = 'new user edit'");
  await r.run('applySuggestion()');
  assert.equal(r.writes.length, 0);
  assert.equal(r.run('currentFile().content'), 'new user edit');
});

test('failed Apply retains the source and suggestion for retry', async () => {
  const r = renderer({ projectWrite: async () => ({ ok: false, error: 'disk changed' }) });
  await r.run("openFile('/project/file.js')");
  await r.run('requestSuggestion()');
  await r.run('applySuggestion()');
  assert.equal(r.run('currentFile().content'), 'original /project/file.js');
  assert.equal(r.run('state.suggestion.fullNew'), 'improved');
  assert.match(r.get('toast').textContent, /disk changed/);
});

test('successful Apply updates both disk baseline and editor buffer', async () => {
  const r = renderer();
  await r.run("openFile('/project/file.js')");
  await r.run('requestSuggestion()');
  await r.run('applySuggestion()');
  assert.equal(r.writes[0].content, 'improved');
  assert.equal(r.run('currentFile().savedContent'), 'improved');
  assert.equal(r.run('currentFile().content'), 'improved');
  assert.equal(r.run('isDirty(currentFile())'), false);
});

test('length-truncated model output is rejected even with a closed code fence', async () => {
  const r = renderer({ chat: async () => ({ ok: true, text: '```js\npartial\n```', finishReason: 'length' }) });
  await r.run("openFile('/project/file.js')");
  await r.run('requestSuggestion()');
  assert.equal(r.run('state.suggestion'), null);
});

test('malformed saved ask history recovers and new missions default to dry run', () => {
  const r = renderer({}, { 'lc.askHistory': '{broken' });
  assert.equal(r.run('state.askHistory.length'), 0);
  r.run('initMissionControls()');
  assert.equal(r.get('missionLive').checked, false);
  r.storage['lc.missionLive'] = '1';
  r.run('initMissionControls()');
  assert.equal(r.get('missionLive').checked, true);
  assert.equal(r.run("validPort('NaN')"), false);
  assert.equal(r.run("validPort('65536')"), false);
  assert.equal(r.run("validPort('7000')"), true);
});

test('failed terminal creation is retryable and old exits cannot disable a replacement', async () => {
  let attempts = 0;
  const r = renderer({ termCreate: async () => (++attempts === 1 ? { ok: false, error: 'missing shell' } : { ok: true, shell: 'test' }) });
  await r.run('ensureTerminal()');
  assert.equal(r.run('termReady'), false);
  await r.run('ensureTerminal()');
  assert.equal(r.run('termReady'), true);
  r.emitTerm('exit', { id: 't1', code: 1 });
  assert.equal(r.run('termReady'), true);
  r.emitTerm('exit', { id: 't2', code: 0 });
  assert.equal(r.run('termReady'), false);
});

test('a completed mission journal load cannot paint a different view', async () => {
  const response = deferred();
  const r = renderer({ runJson: () => response.promise });
  r.run("state.view = 'missions'");
  const pending = r.run('renderMissionsView()');
  r.run("state.view = 'settings'");
  r.get('journalList').textContent = 'sentinel';
  response.resolve({ ok: true, data: { missions: [] } });
  await pending;
  assert.equal(r.get('journalList').textContent, 'sentinel');
});

test('mission arguments use the tracked healthy engine port and preview writes by default', async () => {
  let stream;
  const r = renderer({ streamStart: async (opts) => { stream = opts; return { ok: true }; } });
  r.run("initMissionControls(); runMission('review my project')");
  await Promise.resolve();
  assert.equal(stream.cwd, '/project');
  assert.equal(stream.args[stream.args.indexOf('--port') + 1], '7001');
  assert.equal(stream.args.includes('--dryRun'), true);
  assert.equal(stream.args.includes('--allowRun'), false);
});

test('window closing is prevented only while an open file has unsaved changes', async () => {
  const r = renderer();
  r.run('wire()');
  await r.run("openFile('/project/file.js')");
  let prevented = 0;
  const event = { preventDefault() { prevented++; } };
  r.windowEvents.beforeunload(event);
  assert.equal(prevented, 0);
  r.run("currentFile().content = 'dirty'");
  r.windowEvents.beforeunload(event);
  assert.equal(prevented, 1);
  await r.run('saveCurrentFile()');
  r.windowEvents.beforeunload(event);
  assert.equal(prevented, 1);
});

test('live refresh updates engine health before the snapshot and shares in-flight work', async () => {
  const snapshot = deferred();
  const entered = deferred();
  let snapshots = 0;
  const r = renderer({ serveState: async () => ({ serve: { port: 7001, model: 'test-model' } }), ping: async () => ({ ok: true }), snapshot: () => { snapshots++; entered.resolve(); return snapshot.promise; } });
  r.run('buildLiveWorld = () => {}; state.ping = null');
  const first = r.run('refreshLive()');
  const second = r.run('refreshLive()');
  await entered.promise;
  assert.equal(r.run('state.ping.ok'), true);
  assert.equal(snapshots, 1);
  snapshot.resolve({ ok: true, data: { engrams: 1 } });
  await Promise.all([first, second]);
  assert.equal(r.run('state.snapshot.engrams'), 1);
});
