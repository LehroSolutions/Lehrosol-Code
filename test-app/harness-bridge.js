'use strict';
// Screenshot/QA harness — stubs the preload bridge with realistic live data so
// the cockpit can be rendered and exercised outside Electron. Test fixture
// only; never shipped in renderer/.
(function harness() {
  const MODELS = [
    { id: 'Jan-v3.5-4B-Q4_K_XL', size: '2.8 GB', fit: 'GREAT', role: 'daily driver' },
    { id: 'Qwopus3_5-4B-Coder-IQ4_XS', size: '2.6 GB', fit: 'GREAT', role: 'coding' },
    { id: 'gemma-4-E4B-it-qat-UD-Q2_K_XL', size: '3.0 GB', fit: 'GREAT', role: 'vision' },
    { id: 'Hy-MT2-1_8B-Q4_K_M', size: '1.1 GB', fit: 'GREAT', role: 'fast drafts' },
    { id: 'Ornith-1_0-9B-BF16-ASHQ1', size: '4.8 GB', fit: 'TIGHT', role: 'deep planning' },
  ];
  let streamCb = null;
  const ok = (v) => Promise.resolve(v);
  window.lehro = {
    info: () => ok({ platform: 'win32', cli: 'D:\\lehrosol-cli\\bin\\lehrosol.js', home: 'C:\\Users\\Home Station\\.lehro', totalGB: 15.8 }),
    setCliPath: () => ok({ ok: true }),
    pickFile: () => ok(null),
    runJson: (args) => ok({ ok: true, data: { ok: true, echo: args } }),
    snapshot: () => ok({ ok: true, data: { ok: true, vault: { models: 5, ready: 5, server: 'vault' }, engrams: 12, web: false, adapters: 21 } }),
    vault: () => ok({ ok: true, data: { ok: true, models: MODELS, roots: ['D:\\AI Models'] } }),
    addRoot: (dir) => ok({ ok: true, data: { ok: true, added: dir } }),
    serveState: () => ok({ home: 'C:\\Users\\Home Station\\.lehro', serve: { model: 'Jan-v3.5-4B-Q4_K_XL', port: 7000, pid: 4242 }, config: {} }),
    ping: () => ok({ ok: true, status: 200, ms: 14, models: ['Jan-v3.5-4B-Q4_K_XL'] }),
    nativeScan: () => ok({ scannedRoots: ['D:\\AI Models'], hitRoots: ['D:\\AI Models'], models: [], totalGB: 15.8, budgetGB: 11.1 }),
    chat: () => ok({ ok: true, text: 'const debounce = (fn, ms) => { /* … */ }', ms: 1840, tokens: 96, promptTokens: 41, tokPerSec: 52.2 }),
    streamStart: ({ id }) => {
      setTimeout(() => streamCb && streamCb('data', { id, chunk: '[architect] decomposing task into 3 steps\n' }), 150);
      setTimeout(() => streamCb && streamCb('data', { id, chunk: '[scout] scanning workspace · 12 files\n[builder] drafting patch for orchestrator\n' }), 400);
      return ok({ ok: true, pid: 999 });
    },
    streamStop: () => ok({ ok: true }),
    onStream: (cb) => { streamCb = cb; },
    termCreate: () => ok({ ok: true, shell: 'powershell.exe' }),
    termInput: () => ok({ ok: true }),
    termKill: () => ok({ ok: true }),
    onTerm: () => {},
    projectPick: () => ok(null),
    projectTree: () => ok([]),
    projectRead: () => ok({ ok: false, error: 'harness' }),
    projectWrite: () => ok({ ok: true }),
  };
})();
