'use strict';
// Lehrosol Code bridge — everything the GUI knows about the machine flows
// through here. Deep integration with the LehroSol CLI happens two ways:
//   1. Spawning `lehrosol … --json` for actions (vault, serve, loop, tui snapshot)
//   2. Reading the CLI's own state files (~/.lehro/serve.json, config.json)
//      so the GUI is aware of servers/adapters even when no command is running.
// It also has a native GGUF scanner so local models show up with ZERO setup,
// even before the CLI vault has any roots — discovered folders are then
// registered into the CLI vault (`vault add-root`) so GUI and CLI share one
// model brain.
// Pure Node — no Electron imports — so it is fully unit-testable.
const { spawn, spawnSync } = require('node:child_process');
const { existsSync, readFileSync, readdirSync, statSync } = require('node:fs');
const { join, delimiter, basename, dirname, resolve } = require('node:path');
const { homedir, totalmem, cpus } = require('node:os');
const http = require('node:http');
const telemetry = require('./telemetry');

const IS_WIN = process.platform === 'win32';

function lehroHome() {
  return process.env.LEHRO_HOME || join(homedir(), '.lehro');
}

// Locate the LehroSol CLI: pinned env var → PATH → known install folders.
function findLehrosol() {
  const pinned = process.env.LEHROSOL_BIN;
  if (pinned && existsSync(pinned)) return resolveCliCommand(pinned);
  const probe = spawnSync(IS_WIN ? 'where' : 'which', ['lehrosol'], { encoding: 'utf8', windowsHide: true });
  if (probe.status === 0 && probe.stdout) {
    const lines = probe.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const preferred = IS_WIN ? (lines.find((l) => /\.cmd$/i.test(l)) || lines[0]) : lines[0];
    if (preferred) return resolveCliCommand(preferred);
  }
  const guesses = [
    'D:\\lehrosol-cli\\bin\\lehrosol.js',
    join(homedir(), 'lehrosol-cli', 'bin', 'lehrosol.js'),
  ];
  for (const g of guesses) if (existsSync(g)) return { cmd: g, viaNode: true };
  return null;
}

function resolveCliCommand(cmd) {
  if (IS_WIN && /\.(cmd|bat)$/i.test(cmd)) {
    try {
      const shim = readFileSync(cmd, 'utf8');
      const entry = shim.match(/"%dp0%[\\/]((?:node_modules[\\/])?(?:@lehrosolutions[\\/]cli|lehrosol-cli)[\\/]bin[\\/]lehrosol\.m?js)"\s+%\*/i);
      if (entry) {
        const file = resolve(dirname(cmd), entry[1].replace(/[\\/]/g, require('node:path').sep));
        if (statSync(file).isFile()) return { cmd: file, viaNode: true };
      }
    } catch { /* Custom shell wrappers are handled below. */ }
  }
  return { cmd, viaNode: /\.m?js$/i.test(cmd) };
}

function cliEnv() {
  // ELECTRON_RUN_AS_NODE lets Electron's own binary execute the CLI's plain
  // Node entrypoint; it is harmless when the host process is real Node.
  return { ...process.env, NO_COLOR: '1', CI: '1', ELECTRON_RUN_AS_NODE: '1' };
}

// cmd.exe re-parses the /c command line with its OWN rules, not CreateProcess
// argv rules — so Node's automatic per-argument quoting does not survive the
// round trip, and a shim path like C:\Users\Home Station\...\lehrosol.cmd gets
// split at the space ("'C:\Users\Home' is not recognized…"). Build the line
// ourselves: quote every part that needs it, wrap the WHOLE line in one outer
// pair of quotes (which /s strips back off), and pass it verbatim. This is the
// same technique cross-spawn uses.
function winCmdQuote(part) {
  const s = String(part);
  if (s !== '' && !/[\s"&()^%!<>|;,=]/.test(s)) return s;
  return '"' + s.replace(/"/g, '""') + '"';
}

function buildWindowsCmdLine(cmd, args) {
  return '"' + [winCmdQuote(cmd), ...args.map(winCmdQuote)].join(' ') + '"';
}

// opts.cwd lets callers run the CLI inside a specific folder (e.g. missions
// against the user's opened project instead of wherever the GUI launched).
function spawnCli(args, opts = {}) {
  const found = findLehrosol();
  if (!found) {
    const err = new Error('LehroSol CLI not found. Run npm install -g @lehrosolutions/cli@beta or set LEHROSOL_BIN to bin/lehrosol.js');
    err.code = 'ENOCLI';
    throw err;
  }
  const cwd = opts.cwd || undefined;
  if (found.viaNode) return spawn(cliNodeExecutable(), [found.cmd, ...args], { env: cliEnv(), windowsHide: true, cwd });
  if (IS_WIN && /\.(cmd|bat)$/i.test(found.cmd)) {
    if ([found.cmd, ...args].some((part) => /["%!\r\n]/.test(String(part)))) {
      throw new Error('This custom Windows CLI wrapper cannot safely pass quotes, environment expansions, or multiline arguments. Locate bin/lehrosol.js in Settings instead.');
    }
    return spawn('cmd.exe', ['/d', '/s', '/c', buildWindowsCmdLine(found.cmd, args)], {
      env: cliEnv(),
      windowsHide: true,
      windowsVerbatimArguments: true,
      cwd,
    });
  }
  return spawn(found.cmd, args, { env: cliEnv(), windowsHide: true, cwd });
}

function cliNodeExecutable() {
  return process.versions.electron ? 'node' : process.execPath;
}

// Tolerant JSON extraction: some commands print human lines around the JSON.
function parseJsonLoose(text) {
  const raw = String(text || '');
  try { return JSON.parse(raw); } catch { /* fall through */ }
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(raw.slice(start, end + 1)); } catch { /* fall through */ }
  }
  return null;
}

// Default timeout is generous: serving a 3 GB GGUF or running a mission on a
// CPU-only laptop legitimately takes minutes. (v2.0.0 shipped 45s — audited
// and fixed.)
function runJson(args, timeoutMs = 600000) {
  return new Promise((resolve) => {
    let child;
    try { child = spawnCli(args); } catch (err) { resolve({ ok: false, error: err.message, code: err.code }); return; }
    let out = '';
    let errOut = '';
    let bytes = 0;
    let failure = null;
    let settled = false;
    let fallback = null;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(fallback);
      resolve(result);
    };
    const stop = (error, code) => {
      if (failure) return;
      failure = { error, code };
      terminateChild(child);
      fallback = setTimeout(() => {
        child.stdout.destroy();
        child.stderr.destroy();
        finish({ ok: false, ...failure, raw: `${out}\n${errOut}`.trim().slice(-4000) });
      }, 5000);
    };
    const duration = Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0 ? Number(timeoutMs) : 600000;
    const timer = setTimeout(() => stop(`CLI command timed out after ${duration} ms`, 'ETIMEDOUT'), duration);
    const capture = (data, stderr) => {
      if (failure || settled) return;
      bytes += Buffer.byteLength(data, 'utf8');
      if (bytes > 8 * 1024 * 1024) { stop('CLI command exceeded the 8 MiB output limit', 'EOUTPUTLIMIT'); return; }
      if (stderr) errOut += data.toString();
      else out += data.toString();
    };
    child.stdout.on('data', (d) => capture(d, false));
    child.stderr.on('data', (d) => capture(d, true));
    child.on('error', (err) => finish({ ok: false, error: err.message, code: err.code }));
    child.on('close', (code) => {
      const parsed = parseJsonLoose(out);
      const raw = `${out}\n${errOut}`.trim().slice(-4000);
      if (failure) { finish({ ok: false, exitCode: code, ...failure, ...(parsed ? { data: parsed } : {}), raw }); return; }
      if (parsed && typeof parsed === 'object') {
        const ok = code === 0 && parsed.ok !== false;
        finish({ ok, exitCode: code, data: parsed, ...(!ok ? { error: parsed.error || parsed.reason || errOut.trim().slice(-4000) || (code === 0 ? 'CLI reported a diagnostic or operation failure; inspect the returned details' : `CLI command exited with code ${code}`) } : {}) });
        return;
      }
      finish({ ok: code === 0, exitCode: code, raw, ...(code !== 0 ? { error: errOut.trim().slice(-4000) || `CLI command exited with code ${code}` } : {}) });
    });
  });
}

function terminateChild(child) {
  if (IS_WIN && Number.isInteger(child.pid)) {
    try {
      const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
      const timer = setTimeout(() => { killer.kill(); try { child.kill(); } catch { /* exited */ } }, 3000);
      killer.once('error', () => { clearTimeout(timer); try { child.kill(); } catch { /* exited */ } });
      killer.once('close', (code) => { clearTimeout(timer); if (code !== 0) { try { child.kill(); } catch { /* exited */ } } });
      return;
    } catch { /* Fall through to direct termination. */ }
  }
  try { child.kill('SIGKILL'); } catch { /* exited */ }
}

// The CLI's full world-state in one call (health, vault, engrams, web plane…).
function snapshot() { return runJson(['tui', '--json'], 90000); }
function vault() { return runJson(['vault', '--json'], 60000); }
function addVaultRoot(dir) { return runJson(['vault', 'add-root', '--path', String(dir), '--json'], 30000); }

function readJsonFile(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

// Passive awareness — the CLI's own state files, no subprocess needed.
function serveState() {
  const home = lehroHome();
  return {
    home,
    serve: readJsonFile(join(home, 'serve.json')),
    config: readJsonFile(join(home, 'config.json')),
  };
}

// Live latency probe against a llama-server / Jan endpoint.
function pingServer(port, apiKey) {
  return new Promise((resolve) => {
    const started = Date.now();
    const req = http.get({
      host: '127.0.0.1',
      port,
      path: '/v1/models',
      headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
      timeout: 2500,
    }, (res) => {
      let body = '';
      let bytes = 0;
      res.setEncoding('utf8');
      res.on('data', (d) => { bytes += Buffer.byteLength(d, 'utf8'); if (bytes > 512 * 1024) req.destroy(new Error('Engine model list exceeded the 512 KiB limit')); else body += d; });
      res.on('error', (err) => resolve({ ok: false, error: err.message, ms: Date.now() - started }));
      res.on('end', () => {
        const parsed = parseJsonLoose(body);
        const valid = parsed && Array.isArray(parsed.data);
        const modelDetails = valid ? parsed.data.filter((m) => m && typeof m.id === 'string' && m.id) : [];
        const models = modelDetails.map((m) => m.id);
        resolve({ ok: res.statusCode === 200 && Boolean(valid), status: res.statusCode, ms: Date.now() - started, models, modelDetails, ...(!valid ? { error: 'Engine returned an invalid model list' } : {}) });
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout', ms: Date.now() - started }); });
    req.on('error', (err) => resolve({ ok: false, error: err.code || err.message, ms: Date.now() - started }));
  });
}

/* ---------------- native model discovery (zero-setup) ---------------- */
// Where local models usually live: LehroSol roots, plus the folders used by
// Jan, LM Studio, HuggingFace cache, and plain "models" dirs on any drive.
function candidateModelRoots(extraDirs = []) {
  const home = homedir();
  const roots = [...extraDirs];
  roots.push(...String(process.env.LEHRO_MODELS_DIR || '').split(delimiter).filter(Boolean));
  const commonNames = ['AI Models', 'ai-models', 'models', 'Models', 'llm', 'LLM', 'gguf'];
  if (IS_WIN) {
    for (const drive of ['C:', 'D:', 'E:', 'F:', 'G:']) {
      for (const name of commonNames) roots.push(`${drive}\\${name}`);
    }
    roots.push(join(home, 'AppData', 'Roaming', 'Jan', 'data', 'models'));
    roots.push(join(home, '.lmstudio', 'models'));
  }
  for (const name of commonNames) roots.push(join(home, name));
  roots.push(
    join(home, '.cache', 'lm-studio', 'models'),
    join(home, '.lmstudio', 'models'),
    join(home, 'jan', 'models'),
    join(home, '.jan', 'models'),
    join(home, '.cache', 'huggingface', 'hub'),
    join(home, 'Downloads', 'models'),
  );
  const seen = new Set();
  return roots.filter((r) => {
    const key = r.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    try { return statSync(r).isDirectory(); } catch { return false; }
  });
}

const MIN_MODEL_BYTES = 100 * 1024 * 1024; // below this a .gguf is a projector/helper

function walkForGguf(dir, depth, out, budget) {
  if (depth <= 0 || budget.entries <= 0 || Date.now() > budget.deadline) return;
  let names = [];
  try { names = readdirSync(dir); } catch { return; }
  for (const name of names) {
    if (budget.entries-- <= 0 || Date.now() > budget.deadline) return;
    if (name.startsWith('.') || name === 'node_modules') continue;
    const full = join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) { walkForGguf(full, depth - 1, out, budget); continue; }
    if (!/\.gguf$/i.test(name)) continue;
    out.push({ file: full, name, sizeBytes: st.size, dir });
  }
}

function parseQuantFromName(name) {
  const m = name.match(/\b(I?Q\d[_A-Z0-9]*|BF16|F16|F32)\b/i);
  return m ? m[1].toUpperCase() : null;
}

function rateFit(sizeBytes, budgetGB) {
  const requiredGB = (sizeBytes / 1e9) * 1.1 + 0.9; // weights + ctx/overhead
  if (requiredGB <= budgetGB * 0.72) return { fit: 'GREAT', requiredGB };
  if (requiredGB <= budgetGB) return { fit: 'TIGHT', requiredGB };
  return { fit: 'NO FIT', requiredGB };
}

// Scan the machine for GGUF models without any CLI or config. Returns models
// grouped with fit ratings against real RAM, plus the roots that contained
// them (so they can be added to the CLI vault).
function nativeScan(extraDirs = []) {
  const roots = candidateModelRoots(extraDirs);
  const budget = { entries: 6000, deadline: Date.now() + 8000 };
  const files = [];
  for (const root of roots) walkForGguf(root, 5, files, budget);
  const totalGB = totalmem() / 1e9;
  const budgetGB = totalGB * 0.7;
  const big = files.filter((f) => f.sizeBytes >= MIN_MODEL_BYTES && !/mmproj/i.test(f.name));
  const helpers = files.filter((f) => f.sizeBytes < MIN_MODEL_BYTES || /mmproj/i.test(f.name));
  const models = big.map((f) => {
    const folder = basename(f.dir);
    const id = /models?$/i.test(folder) ? f.name.replace(/\.gguf$/i, '') : folder;
    const mm = helpers.find((h) => h.dir === f.dir);
    const { fit, requiredGB } = rateFit(f.sizeBytes, budgetGB);
    return {
      id,
      file: f.file,
      sizeBytes: f.sizeBytes,
      sizeGB: Math.round(f.sizeBytes / 1e8) / 10,
      quant: parseQuantFromName(f.name),
      mmproj: mm ? mm.file : null,
      fit,
      requiredGB: Math.round(requiredGB * 10) / 10,
    };
  }).sort((a, b) => a.sizeBytes - b.sizeBytes);
  // Roots that actually contain models — the ones worth adding to the vault.
  const hitRoots = [...new Set(models.map((m) => {
    for (const root of roots) if (m.file.toLowerCase().startsWith(root.toLowerCase())) return root;
    return dirname(m.file);
  }))];
  return { scannedRoots: roots, hitRoots, models, totalGB: Math.round(totalGB * 10) / 10, budgetGB: Math.round(budgetGB * 10) / 10 };
}

/* ---------------- direct chat (model test bench) ---------------- */
// One prompt → one completion against the running engine, with timing and
// tokens/sec — the GUI Test Bench uses this to benchmark models head-to-head.
function chatOnce({ port, apiKey, prompt, system, model, source, maxTokens = 512, timeoutMs = 300000, temperature }) {
  return new Promise((resolve) => {
    const started = Date.now();
    const messages = [];
    if (system) messages.push({ role: 'system', content: String(system) });
    messages.push({ role: 'user', content: String(prompt) });
    const body = JSON.stringify({ model: 'local', messages, max_tokens: maxTokens, temperature: temperature == null ? 0.7 : Number(temperature), stream: false });
    const req = http.request({
      host: '127.0.0.1',
      port: Number(port),
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      timeout: Number(timeoutMs),
    }, (res) => {
      let raw = '';
      let bytes = 0;
      res.setEncoding('utf8');
      res.on('data', (d) => { bytes += Buffer.byteLength(d, 'utf8'); if (bytes > 8 * 1024 * 1024) req.destroy(new Error('Engine completion exceeded the 8 MiB limit')); else raw += d; });
      res.on('error', (err) => resolve({ ok: false, error: err.message, ms: Date.now() - started }));
      res.on('end', () => {
        const ms = Date.now() - started;
        const parsed = parseJsonLoose(raw);
        if (!parsed || res.statusCode !== 200) { resolve({ ok: false, status: res.statusCode, ms, error: (parsed && parsed.error && parsed.error.message) || raw.slice(0, 300) }); return; }
        const choice = parsed.choices && parsed.choices[0];
        const text = choice && choice.message ? choice.message.content : '';
        if (typeof text !== 'string') { resolve({ ok: false, ms, error: 'Engine returned non-text completion content' }); return; }
        const finishReason = choice && typeof choice.finish_reason === 'string' ? choice.finish_reason : null;
        const tokens = parsed.usage ? parsed.usage.completion_tokens : null;
        const promptTokens = parsed.usage ? parsed.usage.prompt_tokens : null;
        const tracked = serveState().serve;
        const modelName = model || (tracked && Number(tracked.port) === Number(port) && tracked.model) || parsed.model || 'local';
        const usageRecord = telemetry.record(lehroHome(), modelName, parsed.usage, ms, source || 'desktop-chat');
        resolve({ ok: true, text, finishReason, ms, tokens, promptTokens, usage: parsed.usage || null, usageRecord, tokPerSec: tokens && ms ? Math.round((tokens / (ms / 1000)) * 10) / 10 : null });
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout', ms: Date.now() - started }); });
    req.on('error', (err) => resolve({ ok: false, error: err.code || err.message, ms: Date.now() - started }));
    req.write(body);
    req.end();
  });
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'out', '.playwright-mcp']);

function listTree(dir, depth = 4, budget = { n: 600 }) {
  const entries = [];
  let names = [];
  try { names = readdirSync(dir); } catch { return entries; }
  names.sort((a, b) => a.localeCompare(b));
  for (const name of names) {
    if (budget.n <= 0) break;
    if (name.startsWith('.') && name !== '.env') continue;
    const full = join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      budget.n -= 1;
      entries.push({ name, path: full, dir: true, children: depth > 1 ? listTree(full, depth - 1, budget) : [] });
    } else {
      budget.n -= 1;
      entries.push({ name, path: full, dir: false, size: st.size });
    }
  }
  return entries;
}

function info() {
  const found = findLehrosol();
  const codeEvents = Boolean(found && found.viaNode && existsSync(join(dirname(found.cmd), '..', 'src', 'core', 'usage.js')));
  return { platform: process.platform, cli: found ? found.cmd : null, cliVersion: cliVersion(found), codeEvents, home: lehroHome(), totalGB: Math.round(totalmem() / 1e8) / 10 };
}

function usage(days) { return telemetry.read(lehroHome(), days); }

function engineDetails({ port, apiKey } = {}) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: Number(port), path: '/props', headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {}, timeout: 2500 }, (res) => {
      let raw = ''; let bytes = 0;
      res.on('data', (chunk) => { bytes += chunk.length; if (bytes > 512 * 1024) { req.destroy(); resolve({ ok: false, error: 'Engine metadata exceeded limit' }); } else raw += chunk.toString(); });
      res.on('end', () => {
        const data = parseJsonLoose(raw);
        if (res.statusCode !== 200 || !data) { resolve({ ok: false, error: 'Engine does not expose properties' }); return; }
        const n = Number(data.default_generation_settings?.n_ctx || data.n_ctx);
        resolve({ ok: true, contextWindow: Number.isSafeInteger(n) && n > 0 ? n : null, slots: Number(data.total_slots) || null });
      });
      res.on('error', () => resolve({ ok: false, error: 'Engine metadata connection closed' }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'Engine metadata timed out' }); });
    req.on('error', () => resolve({ ok: false, error: 'Engine metadata unavailable' }));
  });
}

/* ---------------- CLI v3.2 quick-lane integration ----------------
 * The cockpit consumes the quick lane the CLI grew since v2.3 was
 * written: `engrams` (renamed from `engram`), `scan`, `up` (one-word
 * zero-to-serving), `arena`, `recommend`, `doctor`, `adapters`, and
 * `modes`. Every call is `--json` first and degrades to a raw string
 * result when the connected CLI predates the flag. */

let cliVersionCache = null;
function cliVersion(found = findLehrosol()) {
  if (!found) { cliVersionCache = null; return null; }
  let key = found.cmd;
  try {
    const st = statSync(found.cmd);
    key = `${found.cmd}:${st.size}:${st.mtimeMs}`;
  } catch { cliVersionCache = null; return null; }
  if (cliVersionCache && cliVersionCache.key === key) return cliVersionCache.version;
  cliVersionCache = null;
  const args = ['--version'];
  let res = null;
  try {
    if (found.viaNode) res = spawnSync(cliNodeExecutable(), [found.cmd, ...args], { encoding: 'utf8', windowsHide: true, env: cliEnv(), timeout: 15000 });
    else if (IS_WIN && /\.(cmd|bat)$/i.test(found.cmd)) res = spawnSync('cmd.exe', ['/d', '/s', '/c', buildWindowsCmdLine(found.cmd, args)], { encoding: 'utf8', windowsHide: true, env: cliEnv(), timeout: 15000 });
    else res = spawnSync(found.cmd, args, { encoding: 'utf8', windowsHide: true, env: cliEnv(), timeout: 15000 });
  } catch { return null; }
  const m = res && res.status === 0 && res.stdout ? String(res.stdout).match(/(\d+\.\d+\.\d+[^\s"]*)/) : null;
  if (!m) return null;
  cliVersionCache = { key, version: m[1] };
  return m[1];
}

// Distilled long-term memory (the CLI command is `engrams` since v3.0 —
// `engram list` stopped existing and the GUI's memory panel went dark).
function engramsList(limit) {
  return runJson(['engrams', '--json', '--limit', String(Math.max(1, Number(limit) || 15))], 30000);
}

function doctor() { return runJson(['doctor', '--json'], 60000); }
function adaptersList() { return runJson(['adapters', '--json'], 60000); }
function modesList() { return runJson(['modes', 'list', '--json'], 30000); }
function recommend() { return runJson(['recommend', '--json'], 120000); }

// CLI-native GGUF discovery: with a folder it also registers the root in
// the CLI vault, so the GUI's scan results become shared vault roots in
// one command instead of add-root loops.
function cliScan(folder) {
  const args = ['scan'];
  if (folder) args.push('--path', String(folder));
  args.push('--json');
  return runJson(args, 300000);
}

// One-word zero-to-serving: the CLI scans, rates every model against real
// RAM, picks the best fit, hosts it, and wires the loop. The cockpit uses
// it for the one-click engine button and engine-less auto-start fallback.
function up(opts = {}) {
  const args = ['up', '--json'];
  if (opts.port) args.push('--port', String(opts.port));
  if (opts.apiKey) args.push('--apiKey', String(opts.apiKey));
  if (opts.resourceProfile) args.push('--resourceProfile', String(opts.resourceProfile));
  return runJson(args, 600000);
}

// Same prompt raced across top models on one tok/s scoreboard. Long timeout:
// each contender's model load on a CPU-only laptop can take minutes.
function arenaRun(opts = {}) {
  const args = ['arena', '--json', '--prompt', String(opts.prompt || 'Write a JavaScript function that returns the nth Fibonacci number, then explain it in one sentence.')];
  if (opts.count) args.push('--count', String(opts.count));
  if (opts.maxTokens) args.push('--maxTokens', String(opts.maxTokens));
  return runJson(args, 1800000);
}

/* ---------------- getting the best out of local models ----------------
 * Three lessons learned the hard way in the CLI (see its AGENTS.md) that the
 * cockpit must honor everywhere it talks to the engine directly:
 *   1. llama.cpp RESERVES max_tokens inside the context window — a 2048-token
 *      completion ask on the 2048-context servers this suite defaults to
 *      overflows before the prompt fits. Budget requests accordingly.
 *   2. Small models need an explicit output contract and low temperature or
 *      they spend the budget on reasoning prose instead of code.
 *   3. Background CPU load silently skews tok/s (the benchmark killer) —
 *      surface it next to every reading. */

// Context load budget for the AI Suggestion lane, mirroring the CLI code
// lane's adaptive context modes (256/384/512 per turn) with headroom for a
// whole-file rewrite. Returns the request plan: char window, token cap, the
// hardened system contract, and whether the file had to be truncated.
const SUGGESTION_BUDGETS = {
  eco: { charBudget: 4000, maxTokens: 896 },
  balanced: { charBudget: 6000, maxTokens: 1024 },
  performance: { charBudget: 8000, maxTokens: 1152 },
};
function suggestionPlan({ resourceProfile, fileChars, reasoning = 'standard' } = {}) {
  const budget = SUGGESTION_BUDGETS[String(resourceProfile || 'balanced').toLowerCase()] || SUGGESTION_BUDGETS.balanced;
  const truncated = Number(fileChars) > budget.charBudget;
  const system = [
    'You are a precise code editor. You receive one source file and reply with exactly one fenced code block containing the FULL improved file — no prose, no explanations outside the block.',
    'Improvements: real correctness or clarity wins only. Never remove existing code, comments, or exports you were not asked to touch. Never truncate or summarize the file.',
    truncated
      ? `The file below was TRUNCATED to fit your context window (${Math.max(0, Number(fileChars) - budget.charBudget)} chars not shown). Improve only what is shown and reproduce every shown line you keep unchanged verbatim — the missing tail cannot be recovered by anyone.`
      : '',
    reasoning === 'deep'
      ? 'Think before writing, but the visible answer is ONLY the code block.'
      : 'Be direct: spend tokens on the code, not on reasoning prose.',
  ].filter(Boolean).join('\n');
  return { ...budget, truncated, system, temperature: 0.2 };
}

// Busy-percentage sample (0-100) over a short window. Not an uptime metric —
// a validity guard for every tok/s number this cockpit shows: the same 3B
// model can read 6x slower under a runaway background process.
function cpuLoad(sampleMs = 250) {
  const snap = () => cpus().reduce((a, c) => {
    const t = c.times;
    return { idle: a.idle + t.idle, total: a.total + t.idle + t.user + t.nice + t.sys + t.irq };
  }, { idle: 0, total: 0 });
  const before = snap();
  return new Promise((resolve) => {
    setTimeout(() => {
      const after = snap();
      const dt = after.total - before.total;
      const idle = after.idle - before.idle;
      resolve(dt > 0 ? Math.max(0, Math.min(100, Math.round((1 - idle / dt) * 100))) : 0);
    }, Math.max(50, Number(sampleMs) || 250));
  });
}

module.exports = {
  findLehrosol,
  winCmdQuote,
  buildWindowsCmdLine,
  spawnCli,
  runJson,
  parseJsonLoose,
  snapshot,
  vault,
  addVaultRoot,
  serveState,
  pingServer,
  chatOnce,
  candidateModelRoots,
  nativeScan,
  rateFit,
  listTree,
  info,
  lehroHome,
  cliVersion,
  engramsList,
  doctor,
  adaptersList,
  modesList,
  recommend,
  cliScan,
  up,
  arenaRun,
  suggestionPlan,
  cpuLoad,
  usage,
  engineDetails,
};
