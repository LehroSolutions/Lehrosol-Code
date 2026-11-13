'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const workspace = require('../renderer/workspace');
const telemetry = require('../electron/telemetry');
const fs = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

test('test requests use an isolated Lehro home', () => {
  const { resolve, sep, basename } = require('node:path');
  assert.ok(resolve(process.env.LEHRO_HOME).startsWith(resolve(tmpdir()) + sep));
  assert.ok(basename(process.env.LEHRO_HOME).startsWith('lehrosol-code-test-'));
});

test('imported workspace preferences discard unknown fields and clamp display values', () => {
  const layout = workspace.normalize({ primary: 'untrusted', agents: false, pins: ['engine', 'script', 'engine'], apiKey: 'secret' });
  assert.equal(layout.primary, 'output'); assert.equal(layout.agents, false);
  assert.deepEqual(layout.pins, ['engine']); assert.equal(layout.apiKey, undefined);
  assert.deepEqual(workspace.appearance({ theme: 'css injection', accent: '#abcdef;background:red', editorFont: 200, outputFont: -1, density: 'compact' }), { theme: 'dark', accent: '', editorFont: 20, outputFont: 12, density: 'compact' });
});

test('structured mission streams survive arbitrary chunk boundaries and flush unterminated results', () => {
  const m = {};
  const text = JSON.stringify({ version: 1, type: 'start', model: 'model α', missionId: 'j1', dryRun: true }) + '\n' + JSON.stringify({ version: 1, type: 'result', ok: true, summary: 'Complete answer', changedFiles: ['src/a.js'] });
  for (let i = 0; i < text.length; i += 7) workspace.feed(m, text.slice(i, i + 7));
  workspace.feed(m, '', true);
  assert.equal(m.model, 'model α'); assert.equal(m.summary, 'Complete answer');
  assert.equal(m.journalId, 'j1'); assert.deepEqual(m.changedFiles, ['src/a.js']);
});

test('corrupt saved layouts do not break customization or retain private fields', () => {
  assert.deepEqual(workspace.savedLayouts({ name: 'wrong container' }), []);
  const saved = workspace.savedLayouts([null, 1, {}, { name: 'invalid', layout: null }, { name: '  Review  ', layout: { primary: 'code', apiKey: 'secret' }, apiKey: 'secret' }]);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].name, 'Review');
  assert.equal(saved[0].layout.primary, 'code');
  assert.equal(JSON.stringify(saved).includes('secret'), false);
});

test('old CLI text remains readable and long streams keep bounded history', () => {
  const m = {};
  workspace.feed(m, '[builder] inspecting a file\nplain answer\n');
  assert.equal(m.tail[1], 'plain answer');
  for (let i = 0; i < 500; i++) workspace.feed(m, ('log ' + i).repeat(300) + '\n');
  assert.equal(m.activity.length, 300); assert.ok(m.raw.length <= 256000); assert.equal(m.truncated, true);
});

test('model-produced HTML, scripts, and code fences render as escaped text', () => {
  const html = workspace.markdown('# Result\n<script>alert(1)</script>\n![x](javascript:alert(1))\n```html\n<img src=x onerror=alert(1)>\n```');
  assert.equal(/<script|<img|onerror="|href="javascript:/.test(html), false);
  assert.match(html, /&lt;script&gt;/); assert.match(html, /<h2>Result<\/h2>/);
  assert.match(html, /<pre><code>/);
});

test('context pressure uses the last request and preserves unknown counts', () => {
  assert.equal(workspace.contextUsage(null, 10, 4096), null);
  assert.equal(workspace.contextUsage(10, 10, 0), null);
  assert.equal(workspace.contextUsage(3000, 72, 4096).percent, 75);
  assert.equal(workspace.contextUsage(5000, 0, 4096).percent, 122);
});

test('desktop telemetry consumes the shared CLI contract without prompts or invented counts', (t) => {
  const dir = fs.mkdtempSync(join(tmpdir(), 'lc-telemetry-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  telemetry.record(dir, 'alpha', { prompt_tokens: 0, completion_tokens: 12 }, 30);
  telemetry.record(dir, 'alpha', null, 20);
  const row = telemetry.read(dir).models[0];
  assert.equal(row.requests, 2); assert.equal(row.completionTokens, 12); assert.equal(row.unmeasuredRequests, 1);
  assert.equal(row.last.promptTokens, null);
  const file = join(dir, 'usage', new Date().toISOString().slice(0, 10) + '.jsonl');
  fs.appendFileSync(file, '{incomplete\n');
  assert.equal(telemetry.read(dir).invalidRows, 1);
  assert.equal(fs.readFileSync(file, 'utf8').includes('prompt"'), false);
});

test('a null telemetry row does not discard later valid requests', (t) => {
  const dir = fs.mkdtempSync(join(tmpdir(), 'lc-telemetry-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const first = telemetry.record(dir, 'alpha', { prompt_tokens: 2, completion_tokens: 3 }, 10);
  fs.appendFileSync(join(dir, 'usage', first.at.slice(0, 10) + '.jsonl'), 'null\n');
  telemetry.record(dir, 'alpha', { prompt_tokens: 5, completion_tokens: 7 }, 10);
  const result = telemetry.read(dir);
  assert.equal(result.invalidRows, 1);
  assert.equal(result.models[0].requests, 2);
  assert.equal(result.models[0].promptTokens, 7);
  assert.equal(result.models[0].completionTokens, 10);
});
