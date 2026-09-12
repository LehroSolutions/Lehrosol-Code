'use strict';
// Lehrosol Code — bridge test suite. Exercises CLI discovery, JSON parsing,
// state-file awareness, engine pings, chat benchmarking, and the native
// zero-setup GGUF scanner, all against fakes (no real CLI or engine needed).
const test = require('node:test');
const assert = require('node:assert');
const { mkdtempSync, writeFileSync, mkdirSync, truncateSync, chmodSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const http = require('node:http');

const bridge = require('../electron/bridge');

function makeFakeCli(dir) {
  const file = join(dir, 'fake-lehrosol.js');
  writeFileSync(file, `
const args = process.argv.slice(2);
if (args[0] === 'vault' && args[1] === 'add-root') {
  console.log(JSON.stringify({ ok: true, added: args[2], roots: ['/models', args[2]] }));
} else if (args[0] === 'vault') {
  console.log(JSON.stringify({ ok: true, models: [{ id: 'alpha-7b-Q4_K_M', fit: 'great' }], roots: ['/models'] }));
} else if (args[0] === 'tui') {
  console.log(JSON.stringify({ ok: true, vault: { models: 2, ready: 2, server: 'vault' }, adapters: 21 }));
} else if (args[0] === 'noisy') {
  console.log('LehroSol CLI v3');
  console.log('booting adapters...');
  console.log(JSON.stringify({ ok: true, noisy: true }));
} else if (args[0] === 'fail') {
  console.error('something broke');
  process.exit(1);
} else if (args[0] === 'engrams') {
  console.log(JSON.stringify({ ok: true, engrams: [{ id: 'e1', project: 'proj', adapter: 'local', finalVerdict: 'stop-success', diffSummary: 'd', lesson: 'Keep reads short.', distilledAt: '2026-09-10T00:00:00Z' }], total: 1 }));
} else if (args[0] === 'doctor') {
  console.log(JSON.stringify({ ok: true, cwd: 'D:\\proj', checks: [{ name: 'node-version', ok: true, detail: 'node 22' }] }));
} else if (args[0] === 'adapters') {
  console.log(JSON.stringify({ adapters: [{ id: 'local', installed: true, kind: 'dry-run' }] }));
} else if (args[0] === 'modes') {
  console.log(JSON.stringify({ modes: [{ id: 'recon', label: 'Recon' }], preferred: null }));
} else if (args[0] === 'recommend') {
  console.log(JSON.stringify({ hardware: { totalGB: 16 }, models: [], picks: { coder: 'alpha-7b' } }));
} else if (args[0] === 'scan') {
  console.log(JSON.stringify({ ok: true, echo: args, models: [{ id: 'alpha-7b' }], roots: ['/models'] }));
} else if (args[0] === 'up') {
  console.log(JSON.stringify({ ok: true, echo: args, model: 'alpha-7b-Q4_K_M', port: 7000, baseUrl: 'http://localhost:7000/v1' }));
} else if (args[0] === 'arena') {
  console.log(JSON.stringify({ ok: true, echo: args, prompt: args.indexOf('--prompt') >= 0 ? args[args.indexOf('--prompt') + 1] : 'p', rows: [{ model: 'alpha-7b', ok: true, ms: 100, tokens: 10, tokPerSec: 100 }], winner: 'alpha-7b' }));
} else if (args[0] === '--version') {
  console.log('LehroSol CLI v9.9.9-test');
} else {
  console.log(JSON.stringify({ ok: true, echo: args }));
}
`);
  chmodSync(file, 0o755);
  return file;
}

test('spawnCli runs the CLI inside an explicit cwd (missions target the opened project)', async () => {
  // v2.1.5 spawned every mission in the GUI's own folder, so "examine this
  // codebase" examined Lehrosol Code's source instead of the opened project.
  const { realpathSync } = require('node:fs');
  const dir = mkdtempSync(join(tmpdir(), 'lc-'));
  const cliFile = join(dir, 'cwd-cli.js');
  writeFileSync(cliFile, 'console.log(JSON.stringify({ cwd: process.cwd() }));\n');
  process.env.LEHROSOL_BIN = cliFile;
  const projDir = mkdtempSync(join(tmpdir(), 'lc-proj-'));
  const child = bridge.spawnCli([], { cwd: projDir });
  const out = await new Promise((resolve) => {
    let buf = '';
    child.stdout.on('data', (d) => { buf += d; });
    child.on('close', () => resolve(buf));
  });
  assert.strictEqual(JSON.parse(out).cwd, realpathSync(projDir));
});

test('windows cmd line survives paths with spaces (Home Station bug)', () => {
  // v2.1.4 shipped spawn('cmd.exe', ['/d','/s','/c', cmd, ...args]) — cmd.exe
  // re-parsed the line and split C:\Users\Home Station\... at the space:
  // "'C:\Users\Home' is not recognized as an internal or external command".
  const line = bridge.buildWindowsCmdLine(
    'C:\\Users\\Home Station\\AppData\\Roaming\\npm\\lehrosol.cmd',
    ['vault', '--json', '--path', 'D:\\AI Models\\llamacpp'],
  );
  assert.strictEqual(
    line,
    '""C:\\Users\\Home Station\\AppData\\Roaming\\npm\\lehrosol.cmd" vault --json --path "D:\\AI Models\\llamacpp""',
  );
  // Simple parts stay unquoted; risky characters force quoting; embedded
  // quotes are doubled, never dropped.
  assert.strictEqual(bridge.winCmdQuote('--json'), '--json');
  assert.strictEqual(bridge.winCmdQuote('two words'), '"two words"');
  assert.strictEqual(bridge.winCmdQuote('say "hi"'), '"say ""hi"""');
});

test('findLehrosol honours LEHROSOL_BIN and flags .js for node execution', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lc-'));
  const fake = makeFakeCli(dir);
  process.env.LEHROSOL_BIN = fake;
  const found = bridge.findLehrosol();
  assert.strictEqual(found.cmd, fake);
  assert.strictEqual(found.viaNode, true);
});

test('runJson parses vault and tui payloads from the CLI', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lc-'));
  process.env.LEHROSOL_BIN = makeFakeCli(dir);
  const vaultRes = await bridge.runJson(['vault', '--json']);
  assert.strictEqual(vaultRes.ok, true);
  assert.strictEqual(vaultRes.data.models[0].id, 'alpha-7b-Q4_K_M');
  const tuiRes = await bridge.runJson(['tui', '--json']);
  assert.strictEqual(tuiRes.data.vault.ready, 2);
});

test('runJson tolerates banner noise and reports failures', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lc-'));
  process.env.LEHROSOL_BIN = makeFakeCli(dir);
  const noisy = await bridge.runJson(['noisy']);
  assert.strictEqual(noisy.data.noisy, true);
  const fail = await bridge.runJson(['fail']);
  assert.strictEqual(fail.ok, false);
  assert.match(fail.raw, /something broke/);
});

test('parseJsonLoose extracts embedded JSON and rejects junk', () => {
  assert.deepStrictEqual(bridge.parseJsonLoose('x {"a":1} y'), { a: 1 });
  assert.strictEqual(bridge.parseJsonLoose('no json here'), null);
});

test('addVaultRoot registers a folder through the CLI', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lc-'));
  process.env.LEHROSOL_BIN = makeFakeCli(dir);
  const res = await bridge.addVaultRoot('/tmp/found-models');
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.data.added, '/tmp/found-models');
});

test('serveState reads the CLI state files from LEHRO_HOME', () => {
  const home = mkdtempSync(join(tmpdir(), 'lc-home-'));
  writeFileSync(join(home, 'serve.json'), JSON.stringify({ port: 7000, model: 'alpha' }));
  writeFileSync(join(home, 'config.json'), JSON.stringify({ adapters: { llamacpp: { baseUrl: 'http://127.0.0.1:7000/v1' } } }));
  process.env.LEHRO_HOME = home;
  const st = bridge.serveState();
  assert.strictEqual(st.serve.port, 7000);
  assert.match(st.config.adapters.llamacpp.baseUrl, /7000/);
  delete process.env.LEHRO_HOME;
});

test('serveState survives a missing home directory', () => {
  process.env.LEHRO_HOME = join(tmpdir(), 'does-not-exist-lc');
  const st = bridge.serveState();
  assert.strictEqual(st.serve, null);
  assert.strictEqual(st.config, null);
  delete process.env.LEHRO_HOME;
});

test('pingServer reports live engines and dead ports', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: [{ id: 'alpha' }] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const up = await bridge.pingServer(port, 'k');
  assert.strictEqual(up.ok, true);
  assert.deepStrictEqual(up.models, ['alpha']);
  assert.ok(up.ms >= 0);
  server.close();
  const down = await bridge.pingServer(1);
  assert.strictEqual(down.ok, false);
});

test('chatOnce measures a completion round-trip with tokens/sec', async () => {
  let sawAuth = null;
  const server = http.createServer((req, res) => {
    sawAuth = req.headers.authorization;
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      const parsed = JSON.parse(body);
      assert.strictEqual(parsed.messages[parsed.messages.length - 1].role, 'user');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'hello from local model' } }], usage: { completion_tokens: 12, prompt_tokens: 5 } }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const res = await bridge.chatOnce({ port, apiKey: 'k', prompt: 'hi', maxTokens: 64 });
  server.close();
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.text, 'hello from local model');
  assert.strictEqual(res.tokens, 12);
  assert.ok(typeof res.tokPerSec === 'number');
  assert.strictEqual(sawAuth, 'Bearer k');
});

test('chatOnce reports unreachable engines cleanly', async () => {
  const res = await bridge.chatOnce({ port: 1, prompt: 'hi', timeoutMs: 2000 });
  assert.strictEqual(res.ok, false);
  assert.ok(res.error);
});

test('nativeScan finds GGUF models, rates fit, and pairs projectors', () => {
  const root = mkdtempSync(join(tmpdir(), 'lc-models-'));
  const alphaDir = join(root, 'alpha-7b');
  mkdirSync(alphaDir);
  writeFileSync(join(alphaDir, 'alpha-7b-Q4_K_M.gguf'), 'x');
  truncateSync(join(alphaDir, 'alpha-7b-Q4_K_M.gguf'), 300 * 1024 * 1024);
  writeFileSync(join(alphaDir, 'mmproj-alpha.gguf'), 'x');
  truncateSync(join(alphaDir, 'mmproj-alpha.gguf'), 50 * 1024 * 1024);
  writeFileSync(join(root, 'beta-1b-IQ4_XS.gguf'), 'x');
  truncateSync(join(root, 'beta-1b-IQ4_XS.gguf'), 200 * 1024 * 1024);
  const scan = bridge.nativeScan([root]);
  const ids = scan.models.map((m) => m.id);
  assert.ok(ids.includes('alpha-7b'), `expected alpha-7b in ${ids}`);
  const alpha = scan.models.find((m) => m.id === 'alpha-7b');
  assert.match(alpha.mmproj, /mmproj/);
  assert.strictEqual(alpha.quant, 'Q4_K_M');
  assert.ok(scan.models.every((m) => !/mmproj/i.test(m.id)));
  assert.ok(scan.hitRoots.some((r) => r.toLowerCase() === root.toLowerCase()));
  assert.ok(scan.totalGB > 0 && scan.budgetGB > 0);
});

test('rateFit gives sensible ratings for a 11GB budget', () => {
  assert.strictEqual(bridge.rateFit(2.8e9, 11.1).fit, 'GREAT');
  assert.strictEqual(bridge.rateFit(9e9, 11.1).fit, 'TIGHT');
  assert.strictEqual(bridge.rateFit(15e9, 11.1).fit, 'NO FIT');
});

test('listTree skips node_modules and respects the entry budget', () => {
  const root = mkdtempSync(join(tmpdir(), 'lc-tree-'));
  mkdirSync(join(root, 'src'));
  mkdirSync(join(root, 'node_modules'));
  writeFileSync(join(root, 'src', 'a.ts'), 'x');
  writeFileSync(join(root, 'node_modules', 'b.js'), 'x');
  const tree = bridge.listTree(root);
  const names = tree.map((e) => e.name);
  assert.ok(names.includes('src'));
  assert.ok(!names.includes('node_modules'));
  const tiny = bridge.listTree(root, 4, { n: 1 });
  assert.ok(tiny.length <= 1);
});

/* ---------------- CLI v3.2 quick-lane integration (v2.4) ---------------- */

test('cliVersion handshakes with the CLI --version banner', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lc-'));
  makeFakeCli(dir);
  process.env.LEHROSOL_BIN = join(dir, 'fake-lehrosol.js');
  assert.strictEqual(bridge.cliVersion(), '9.9.9-test');
});

test('engramsList fetches the distilled memory book (v3.2 rename)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lc-'));
  makeFakeCli(dir);
  process.env.LEHROSOL_BIN = join(dir, 'fake-lehrosol.js');
  const res = await bridge.engramsList(5);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.data.total, 1);
  assert.deepStrictEqual(res.data.engrams.map((e) => e.id), ['e1']);
});

test('doctor, adapters, and modes round-trip machine-readable payloads', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lc-'));
  makeFakeCli(dir);
  process.env.LEHROSOL_BIN = join(dir, 'fake-lehrosol.js');
  const doc = await bridge.doctor();
  assert.strictEqual(doc.data.checks[0].name, 'node-version');
  const adapters = await bridge.adaptersList();
  assert.strictEqual(adapters.data.adapters[0].id, 'local');
  const modes = await bridge.modesList();
  assert.strictEqual(modes.data.modes[0].id, 'recon');
  const rec = await bridge.recommend();
  assert.strictEqual(rec.data.picks.coder, 'alpha-7b');
});

test('cliScan registers a folder into the CLI vault in one command', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lc-'));
  makeFakeCli(dir);
  process.env.LEHROSOL_BIN = join(dir, 'fake-lehrosol.js');
  const bare = await bridge.cliScan();
  assert.strictEqual(bare.data.ok, true);
  assert.ok(!bare.data.echo.includes('--path'), bare.data.echo);
  const withPath = await bridge.cliScan('D:\\AI Models\\llamacpp');
  assert.ok(withPath.data.echo.includes('--path'), withPath.data.echo);
  assert.ok(withPath.data.echo.includes('D:\\AI Models\\llamacpp'));
});

test('up serves the best-fit model with the cockpit port/key/profile flags', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lc-'));
  makeFakeCli(dir);
  process.env.LEHROSOL_BIN = join(dir, 'fake-lehrosol.js');
  const res = await bridge.up({ port: 7010, apiKey: 'k', resourceProfile: 'eco' });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.data.model, 'alpha-7b-Q4_K_M');
  assert.strictEqual(res.data.port, 7000);
  assert.deepStrictEqual(res.data.echo, ['up', '--json', '--port', '7010', '--apiKey', 'k', '--resourceProfile', 'eco']);
});

test('arenaRun races top models on one prompt with the tok/s scoreboard', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lc-'));
  makeFakeCli(dir);
  process.env.LEHROSOL_BIN = join(dir, 'fake-lehrosol.js');
  const res = await bridge.arenaRun({ prompt: 'race prompt', count: 2, maxTokens: 128 });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.data.winner, 'alpha-7b');
  assert.strictEqual(res.data.rows[0].tokPerSec, 100);
  assert.strictEqual(res.data.prompt, 'race prompt');
});

/* ---------------- local-model quality guards (v2.4) ---------------- */

test('suggestionPlan caps tokens/chars per resource profile and flags truncation', () => {
  const eco = bridge.suggestionPlan({ resourceProfile: 'eco', fileChars: 9000 });
  assert.strictEqual(eco.maxTokens, 896);
  assert.strictEqual(eco.charBudget, 4000);
  assert.strictEqual(eco.truncated, true);
  assert.strictEqual(eco.temperature, 0.2);
  assert.match(eco.system, /TRUNCATED/);
  assert.match(eco.system, /FULL improved file/);
  const small = bridge.suggestionPlan({ resourceProfile: 'balanced', fileChars: 1000 });
  assert.strictEqual(small.truncated, false);
  assert.doesNotMatch(small.system, /TRUNCATED/);
  assert.strictEqual(small.maxTokens, 1024);
  const unknown = bridge.suggestionPlan({ resourceProfile: 'turbo', fileChars: 0 });
  assert.strictEqual(unknown.maxTokens, 1024, 'unknown profiles fall back to balanced');
});

test('cpuLoad reports a 0-100 busy percentage', async () => {
  const load = await bridge.cpuLoad(120);
  assert.ok(typeof load === 'number' && load >= 0 && load <= 100, `got ${load}`);
});

test('chatOnce forwards temperature and the system contract to the engine', async () => {
  let sawBody = null;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      sawBody = JSON.parse(body);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }], usage: { completion_tokens: 1 } }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const plan = bridge.suggestionPlan({ resourceProfile: 'balanced', fileChars: 10 });
  const res = await bridge.chatOnce({ port, prompt: 'file content', system: plan.system, maxTokens: plan.maxTokens, temperature: plan.temperature });
  server.close();
  assert.strictEqual(res.ok, true);
  assert.strictEqual(sawBody.temperature, 0.2, 'engine default ~0.7 makes small models ramble — suggestions must pin low');
  assert.strictEqual(sawBody.max_tokens, 1024);
  assert.strictEqual(sawBody.messages[0].role, 'system');
  assert.match(sawBody.messages[0].content, /FULL improved file/);
});
