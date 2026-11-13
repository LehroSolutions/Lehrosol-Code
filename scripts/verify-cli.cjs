'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const cliIndex = process.argv.indexOf('--cli');
if (cliIndex < 0 || !process.argv[cliIndex + 1]) throw new Error('Pass --cli <absolute path to bin/lehrosol.js>');
const cli = path.resolve(process.argv[cliIndex + 1]);
if (!fs.existsSync(cli)) throw new Error('CLI entry does not exist');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lehrosol-cli-contract-'));
const project = path.join(temp, 'project with spaces');
fs.mkdirSync(project); fs.mkdirSync(path.join(temp, 'home'));
fs.writeFileSync(path.join(project, 'app.js'), 'const preserved = true;\n');
process.env.LEHRO_HOME = path.join(temp, 'home');
process.env.LEHROSOL_BIN = cli;
const bridge = require('../electron/bridge');
const results = [];
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/v1/models') { res.end(JSON.stringify({ data: [{ id: 'contract-engine' }] })); return; }
  req.resume();
  req.on('end', () => res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ action: 'done', summary: 'Inspected the disposable project; the CLI completed a scoped preview without changing files.' }) }, finish_reason: 'stop' }], usage: { completion_tokens: 24, prompt_tokens: 12 } })));
});
async function check(name, fn) { const result = await fn(); assert.equal(result.ok, true, `${name}: ${JSON.stringify(result).slice(0, 1200)}`); results.push({ name, ok: true }); console.log(`PASS ${name}`); return result; }
(async () => {
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const port = server.address().port;
  const info = bridge.info(); assert.ok(info.cliVersion);
  for (const [name, fn] of [['vault', bridge.vault], ['tui snapshot', bridge.snapshot], ['adapters', bridge.adaptersList], ['modes', bridge.modesList], ['engrams', () => bridge.engramsList(5)]]) await check(name, fn);
  const diagnostics = await bridge.doctor();
  assert.equal(diagnostics.exitCode, 0); assert.ok(Array.isArray(diagnostics.data?.checks));
  results.push({ name: 'doctor diagnostic contract', ok: true, healthy: diagnostics.data.ok, warnings: diagnostics.data.checks.filter((c) => !c.ok).map((c) => c.name) });
  console.log('PASS doctor diagnostic contract');
  const args = ['code', 'Inspect this disposable project', '--port', String(port), '--apiKey', 'contract-key', '--dryRun', '--contextMode', 'compact', '--maxSteps', '1', '--maxExtensions', '0', '--json'];
  const child = bridge.spawnCli(args, { cwd: project });
  let output = ''; let stderr = '';
  child.stdout.on('data', (data) => { output += data; }); child.stderr.on('data', (data) => { stderr += data; });
  const timer = setTimeout(() => child.kill(), 60000);
  const code = await new Promise((done, reject) => { child.on('error', reject); child.on('close', done); }); clearTimeout(timer);
  const mission = bridge.parseJsonLoose(output);
  assert.equal(code, 0, stderr);
  assert.equal(mission.ok, true, output);
  assert.deepEqual(mission.changedFiles, []);
  assert.equal(fs.readFileSync(path.join(project, 'app.js'), 'utf8'), 'const preserved = true;\n');
  results.push({ name: 'real CLI preview mission with synthetic engine', ok: true });
  fs.mkdirSync(path.join(root, 'dist', 'qa'), { recursive: true });
  const pkgPath = path.resolve(path.dirname(cli), '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  fs.writeFileSync(path.join(root, 'dist', 'qa', 'cli-contract.json'), JSON.stringify({ cli: pkg.name, version: info.cliVersion, entrySha256: createHash('sha256').update(fs.readFileSync(cli)).digest('hex'), checks: results, mission: { ok: mission.ok, steps: mission.steps, changedFiles: mission.changedFiles }, engine: 'synthetic loopback; actual GGUF quality/startup unverified', at: new Date().toISOString() }, null, 2));
  console.log(`Verified ${pkg.name}@${info.cliVersion}: ${results.length} contracts.`);
})().catch((err) => { console.error(err); process.exitCode = 1; }).finally(async () => {
  await new Promise((done) => server.close(done));
  if (!path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(temp).startsWith('lehrosol-cli-contract-')) throw new Error('Refusing unsafe cleanup path');
  fs.rmSync(temp, { recursive: true, force: true });
});
