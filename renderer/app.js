'use strict';
// Lehrosol Code — renderer (v2.4). Real data only: everything on screen comes
// from the LehroSol CLI, the CLI's state files, the engine's HTTP API, or a
// native drive scan. There is no demo content. v2.4 syncs the cockpit to the
// CLI v3.2 surface: `engrams` (renamed), `up`, `arena`, `scan`, `recommend`,
// `adapters`, `modes`, and a CLI version handshake.

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const bridge = window.lehro || null;
let APP_VERSION = 'unknown';
const attr = (s) => esc(s).replace(/"/g, '&quot;');

function loadAskHistory() {
  try {
    const value = JSON.parse(localStorage.getItem('lc.askHistory') || '[]');
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string').slice(0, 25) : [];
  } catch { return []; }
}

function validPort(value) {
  return /^\d+$/.test(String(value)) && Number(value) >= 1 && Number(value) <= 65535;
}

const WELCOME = [
  'Welcome to Lehrosol Code — the agentic IDE for the models on YOUR drive.',
  '',
  'Everything here is live. Nothing is simulated.',
  '',
  '  1. Models   Your GGUFs are discovered automatically (vault + drive scan).',
  '              Check the Vault view (▣) — they should already be there.',
  '  2. Engine   Click "+ New Agent" or press ⌘K → "Serve a model".',
  '              One click starts llama-server with tuned threads.',
  '  3. Missions Type in the ask bar below (⌘ /). Each prompt becomes a',
  '              HELIX loop (architect → scout → builder → reviewer → scribe)',
  '              and appears as a live card in the Agent Stream.',
  '  4. Test     Open the Test Bench (⚖) to benchmark each model:',
  '              latency, tokens/sec, and side-by-side output quality.',
  '  5. Code     Open a project folder, edit files, and use AI Suggestion',
  '              to have your local model rewrite the open file.',
  '',
  'Missions start in dry-run mode. Enable live writes to allow changes in the project you opened.',
  '',
  'New (v2.4): CLI version handshake, one-click engine via the CLI\u2019s \u201cup\u201d lane, arena model racing, CLI-native scan that registers folders straight into the shared vault, and the Memory panel back online (the CLI renamed it to \u201cengrams\u201d).',
].join('\n');

const state = {
  view: 'code',
  theme: localStorage.getItem('lc.theme') || 'dark',
  askHistory: loadAskHistory(),
  askHistIdx: -1,
  info: null,
  snapshot: null,
  serve: null,
  ping: null,
  models: [],            // normalized: {id, sizeLabel, fit, file, source}
  modelsSource: null,    // 'vault' | 'scan' | null
  scan: null,            // last nativeScan result
  missions: [],          // {id, prompt, status, phase, startedAt, ms, tail}
  timeline: [],
  events: [],
  bench: [],             // {model, label, ms, tokens, tokPerSec, text, ok}
  benchBusy: false,
  tabs: [{ name: 'Welcome', ico: '\u2b21' }],
  activeTab: 0,
  openFiles: {},
  projectDir: null,
  tree: [],
  polling: true,
  editing: false,
  suggestion: null,
  missionSeq: 0,
  notifications: [],
  autoResumeTried: false,
  reasoning: localStorage.getItem('lc.reasoning') || 'standard',
  resourceProfile: localStorage.getItem('lc.resourceProfile') || 'balanced',
  profileNeedsRestart: false,
  settings: {
    port: localStorage.getItem('lc.port') || '7000',
    apiKey: localStorage.getItem('lc.apiKey') || 'lehro-local',
    autoServe: localStorage.getItem('lc.autoServe') !== '0',
    cliPath: localStorage.getItem('lc.cliPath') || '',
  },
};

const BENCH_PRESETS = {
  code: 'Write a TypeScript function `debounce(fn, ms)` with full type annotations and a short usage example. Reply with a single fenced code block.',
  reasoning: 'A farmer has 17 sheep. All but 9 run away. How many sheep are left? Explain your reasoning in two short lines, then state the final answer.',
  summary: 'Summarize the following in exactly 3 bullet points: Local LLMs let developers run language models on their own hardware. Quantized GGUF files trade a little quality for a large reduction in memory. Tools like llama.cpp make CPU-only inference practical on ordinary laptops, and an agent harness can chain multiple calls into useful autonomous work.',
  creative: 'Write a 4-line poem about running large language models on an old laptop. Make it rhyme.',
};

/* ---------------- syntax highlighter ---------------- */
const KW = new Set(('export,import,from,async,await,function,const,let,var,return,if,else,for,of,in,while,try,catch,finally,throw,new,class,extends,super,this,typeof,instanceof,switch,case,break,continue,default,do,yield,static,get,set,delete,void,interface,type,enum,implements,public,private,protected,readonly,as,is,keyof,namespace,declare,def,lambda,pass,elif,except,raise,with,None,True,False,and,or,not,null,undefined,true,false').split(','));
function highlight(line) {
  let out = '';
  let i = 0;
  const n = line.length;
  while (i < n) {
    const ch = line[i];
    if (ch === '/' && line[i + 1] === '/') { out += `<span class="tok-com">${esc(line.slice(i))}</span>`; break; }
    if (ch === '#' && !line.slice(0, i).trim()) { out += `<span class="tok-com">${esc(line.slice(i))}</span>`; break; }
    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      while (j < n && line[j] !== ch) j += line[j] === '\\' ? 2 : 1;
      out += `<span class="tok-str">${esc(line.slice(i, j + 1))}</span>`;
      i = j + 1; continue;
    }
    if (/[0-9]/.test(ch) && !/[\w$]/.test(line[i - 1] || '')) {
      let j = i; while (j < n && /[\d._x]/i.test(line[j])) j += 1;
      out += `<span class="tok-num">${esc(line.slice(i, j))}</span>`; i = j; continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i; while (j < n && /[\w$]/.test(line[j])) j += 1;
      const word = line.slice(i, j);
      if (KW.has(word)) out += `<span class="tok-kw">${esc(word)}</span>`;
      else if (line[j] === '(') out += `<span class="tok-fn">${esc(word)}</span>`;
      else if (/^[A-Z]/.test(word)) out += `<span class="tok-type">${esc(word)}</span>`;
      else out += esc(word);
      i = j; continue;
    }
    out += esc(ch); i += 1;
  }
  return out;
}

/* ---------------- UI helpers ---------------- */
let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3400);
}
function notify(msg) {
  state.notifications.unshift({ msg, at: new Date().toLocaleTimeString() });
  state.notifications = state.notifications.slice(0, 30);
  $('bellBadge').classList.remove('hidden');
}
function logEvent(msg) {
  state.events.unshift(`${new Date().toLocaleTimeString()}  ${msg}`);
  state.events = state.events.slice(0, 200);
  $('problemsOut').textContent = state.events.join('\n');
  $('problemsCount').textContent = state.events.length;
}
function appendPane(id, text) {
  const el = $(id);
  const follow = el.parentElement.scrollHeight - el.parentElement.scrollTop - (el.parentElement.clientHeight || 0) < 80;
  el.textContent = (el.textContent + text).slice(-256000);
  if (follow) el.parentElement.scrollTop = el.parentElement.scrollHeight;
}
function openModal(html) { $('modalBox').innerHTML = html; $('modal').classList.remove('hidden'); }
function closeModal() { $('modal').classList.add('hidden'); }
function timelinePush(name, ms, ok) {
  state.timeline.unshift({ name, ms, ok });
  state.timeline = state.timeline.slice(0, 60);
  renderTimeline();
}

/* ---------------- engine / model helpers ---------------- */
function servedModel() {
  return (state.serve && state.serve.serve && state.serve.serve.model) || null;
}
function enginePort() {
  return (state.serve && state.serve.serve && state.serve.serve.port) || Number(state.settings.port);
}
function engineUp() { return Boolean(state.ping && state.ping.ok); }

function normalizeVaultModels(data) {
  const list = (data && (data.models || data.vault)) || [];
  if (!Array.isArray(list)) return [];
  return list.map((m) => ({
    id: m.id || m.name || 'unknown',
    sizeLabel: m.size || (m.sizeGB ? `${m.sizeGB} GB` : ''),
    fit: String(m.fit || m.rating || '').toUpperCase() || null,
    file: m.path || m.file || null,
    role: m.role || m.hint || '',
    contextWindow: Number(m.contextWindow) > 0 ? Number(m.contextWindow) : null,
    source: 'vault',
  }));
}

// Zero-setup discovery: vault first (shared brain with the CLI); if the vault
// is empty or the CLI is missing, fall back to a native drive scan.
async function loadModels() {
  if (state.info && state.info.cli) {
    const res = await bridge.vault();
    if (!res.ok) logEvent(`vault query failed: ${(res.error || res.raw || 'unknown').toString().slice(0, 140)}`);
    const models = normalizeVaultModels(res.data);
    if (models.length) {
      state.models = models;
      state.modelsSource = 'vault';
      return;
    }
  }
  state.scan = await bridge.nativeScan();
  state.models = (state.scan.models || []).map((m) => ({
    id: m.id,
    sizeLabel: `${m.sizeGB} GB`,
    fit: m.fit,
    file: m.file,
    role: m.quant ? `quant ${m.quant}` : '',
    source: 'scan',
  }));
  state.modelsSource = 'scan';
  if (state.models.length) logEvent(`drive scan found ${state.models.length} GGUF model(s) in ${state.scan.hitRoots.length} folder(s)`);
}

// Register scan-discovered folders into the CLI vault so both tools share one
// model library from then on.
async function adoptScanRoots() {
  if (!state.scan || !state.scan.hitRoots.length) { toast('Nothing to add — run a scan first'); return; }
  if (!(state.info && state.info.cli)) { toast('Connect the LehroSol CLI first (Settings)'); return; }
  for (const root of state.scan.hitRoots) {
    const res = await bridge.addRoot(root);
    logEvent(`vault add-root ${root} → ${res.ok ? 'ok' : (res.error || 'failed')}`);
  }
  await loadModels();
  toast(`Vault now tracks ${state.models.length} model(s)`);
  if (state.view === 'vault') renderVaultView();
}

/* ---------------- renderers ---------------- */
function renderTopbar() {
  $('projectName').textContent = 'Local';
  $('projectRepo').textContent = state.projectDir ? state.projectDir.split(/[\\/]/).pop() : 'open a project';
  const model = servedModel();
  $('engineName').textContent = model ? String(model).slice(0, 26) : 'no engine';
  $('enginePort').textContent = model ? ` :${enginePort()}` : '';
  const up = engineUp();
  const running = state.missions.filter((m) => m.status === 'running').length;
  $('agentsPillText').textContent = up ? 'Engine Online' : 'Engine Offline';
  $('agentsPillCount').textContent = running ? `${running} running` : `${state.models.length} models`;
  const dot = document.querySelector('#agentsPill .dot');
  dot.className = `dot ${up ? 'dot-green' : 'dot-gray'}`;
  $('stAiDot').className = `dot ${up ? 'dot-green' : 'dot-gray'}`;
  $('stAiText').textContent = up ? `AI · ${String(model || '').slice(0, 22)}` : 'AI offline';
  renderFooter();
}

function renderMissionPanel() {
  const up = engineUp();
  const model = servedModel();
  const filter = ($('agentFilterInput').value || '').toLowerCase();
  const engineCard = `
    <div class="engine-card ${up ? 'up' : ''}">
      <div class="engine-row"><span class="dot ${up ? 'dot-green' : 'dot-red'}"></span><span class="flex1">${up ? 'Engine online' : 'Engine offline'}</span>
        <button class="btn-ghost" id="btnEngineAction">${up ? 'Stop' : 'Start'}</button></div>
      <div class="engine-meta">${up ? `${esc(String(model || ''))} · :${enginePort()} · ${state.ping.ms}ms` : (model ? `last: ${esc(String(model))}` : 'no model served yet')}</div>
      <button class="btn-ghost" id="btnEngineDetails">Engine &amp; context →</button>
    </div>`;
  const missions = state.missions.filter((m) => !filter || m.prompt.toLowerCase().includes(filter));
  const cards = missions.map((m) => `
    <div class="mission-card ${m.status}" data-mid="${m.id}">
      <div class="mission-top">
        <span class="phase-badge">${m.status === 'running' ? (m.step ? `step ${m.step}/${m.total}` : esc(m.phase || 'starting')) : (m.status === 'done' ? '\u2713 done' : '\u2717 ' + m.status)}</span>
        <span class="mission-prompt" title="${attr(m.prompt)}">${esc(m.prompt)}</span>
      </div>
      <div class="mission-tail">${esc(m.tail.slice(-3).join('\n'))}</div>
      ${(m.changedFiles && m.changedFiles.length) ? `<div class="mission-files">${m.changedFiles.slice(0, 4).map((f) => `<button class="file-chip" data-openfile="${attr(f)}">${esc(f.split(/[\\/]/).pop())}</button>`).join('')}</div>` : ''}
      <div class="mission-foot">
        <span>${m.ms != null ? `${(m.ms / 1000).toFixed(1)}s` : `started ${new Date(m.startedAt).toLocaleTimeString()}`}</span>
        <button class="btn-ghost" data-mission-output="${attr(m.id)}">Open output ↗</button>
        ${m.status === 'running' ? `<button class="mission-cancel" data-cancel="${m.id}">cancel</button>` : ''}
        ${m.status === 'failed' ? `<button class="mission-cancel" data-retry="${m.id}">retry compact</button>` : ''}
      </div>
    </div>`).join('');
  $('agentList').innerHTML = engineCard + (cards || '<div class="alt-sub" style="padding:6px 4px">No missions yet. Type in the ask bar below — each prompt becomes a live agent mission.</div>');
  const btn = $('btnEngineAction');
  if (btn) btn.addEventListener('click', () => { if (engineUp()) stopEngine(); else quickStart(); });
  $('btnEngineDetails').addEventListener('click', () => switchView('engine'));
  document.querySelectorAll('[data-mission-output]').forEach((el) => el.addEventListener('click', () => showMissionOutput(el.dataset.missionOutput)));
  document.querySelectorAll('[data-cancel]').forEach((el) => el.addEventListener('click', () => cancelMission(el.dataset.cancel)));
  // One-click recovery: re-run a failed mission with the smallest context.
  document.querySelectorAll('[data-retry]').forEach((el) => el.addEventListener('click', () => {
    const m = state.missions.find((x) => x.id === el.dataset.retry);
    if (!m) return;
    $('missionContext').value = 'compact';
    localStorage.setItem('lc.contextMode', 'compact');
    toast('Retrying with compact context');
    runMission(m.prompt);
  }));
  document.querySelectorAll('[data-openfile]').forEach((el) => el.addEventListener('click', () => openFile(el.dataset.openfile)));
  renderStatusMission();
}

function renderTabs() {
  $('tabsBar').innerHTML = state.tabs.map((t, i) => `
    <button class="tab ${i === state.activeTab ? 'active' : ''}" data-tab="${i}">
      <span class="tab-ico">${esc(t.ico)}</span>${esc(t.name)}${isDirty(state.openFiles[t.path]) ? ' •' : ''}${state.tabs.length > 1 ? `<span class="tab-x" data-close="${i}">×</span>` : ''}
    </button>`).join('') + '<button class="tab" id="tabPlus">+</button>';
  document.querySelectorAll('#tabsBar .tab[data-tab]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.dataset.close !== undefined) { closeTab(Number(e.target.dataset.close)); return; }
      selectTab(Number(el.dataset.tab));
    });
  });
  const plus = $('tabPlus');
  if (plus) plus.addEventListener('click', () => switchView('files'));
}

function closeTab(i) {
  syncEditorDraft();
  const t = state.tabs[i];
  if (t && isDirty(state.openFiles[t.path]) && !window.confirm(`Discard unsaved changes to ${t.name}?`)) return;
  if (t) delete state.openFiles[t.path];
  state.editing = false;
  state.tabs.splice(i, 1);
  if (!state.tabs.length) state.tabs = [{ name: 'Welcome', ico: '\u2b21' }];
  if (i < state.activeTab) state.activeTab -= 1;
  state.activeTab = Math.max(0, Math.min(state.activeTab, state.tabs.length - 1));
  renderTabs(); renderEditor(); renderSuggestion(null);
}

function currentFile() {
  const t = state.tabs[state.activeTab];
  return t ? state.openFiles[t.path] : null;
}

function isDirty(file) { return Boolean(file && file.content !== file.savedContent); }

function syncEditorDraft() {
  const file = currentFile();
  if (state.editing && file && !file.truncated) file.content = $('editorTextarea').value;
}

function selectTab(index) {
  syncEditorDraft();
  state.editing = false;
  state.activeTab = index;
  renderTabs(); renderEditor(); renderSuggestion(null);
}

function hasUnsavedChanges() {
  syncEditorDraft();
  return Object.values(state.openFiles).some(isDirty);
}

function renderEditor() {
  const t = state.tabs[state.activeTab];
  const file = currentFile();
  const crumbs = file && file.path ? file.path.split(/[\\/]/).slice(-3) : ['Lehrosol Code', t ? t.name : ''];
  $('crumbs').innerHTML = crumbs.map((c) => esc(c)).join(' <span class="dim">/</span> ');
  const text = file ? file.content : WELCOME;
  $('editorTextarea').classList.toggle('hidden', !state.editing || !file || file.truncated);
  $('editorPre').classList.toggle('hidden', state.editing && Boolean(file) && !file.truncated);
  if (state.editing && file) $('editorTextarea').value = file.content;
  $('btnEditToggle').disabled = !file || Boolean(file.truncated);
  $('btnSaveFile').disabled = !file || Boolean(file.truncated);
  $('btnAISuggest').disabled = !file || Boolean(file.truncated);
  $('btnSaveFile').title = file && file.truncated ? 'Large file preview is read-only' : 'Save (Ctrl+S)';
  const lines = text.split('\n');
  $('editorCode').innerHTML = lines.map((line, i) => `<div class="cl"><span class="ln">${i + 1}</span><span>${(file ? highlight(line) : esc(line)) || '&nbsp;'}</span></div>`).join('');
  $('stLine').textContent = `Ln ${lines.length}, Col 1`;
  $('stLang').textContent = file
    ? (/\.py$/.test(file.path) ? 'Python' : /\.(md|txt)$/.test(file.path) ? 'Markdown' : /\.json$/.test(file.path) ? 'JSON' : /\.css$/.test(file.path) ? 'CSS' : /\.html?$/.test(file.path) ? 'HTML' : /\.jsx?$/.test(file.path) ? 'JavaScript' : /\.tsx?$/.test(file.path) ? 'TypeScript' : 'Plain text')
    : 'Welcome';
}

function renderSuggestion(sug) {
  state.suggestion = sug;
  if (!sug) { $('suggestCard').classList.add('hidden'); return; }
  $('suggestRange').textContent = ` · ${sug.range}`;
  $('suggestTag').textContent = sug.tag;
  $('suggestDiff').innerHTML =
    sug.minus.map((l) => `<div class="dl dl-minus">- ${esc(l)}</div>`).join('') +
    sug.plus.map((l) => `<div class="dl dl-plus">+ ${esc(l)}</div>`).join('');
  $('suggestCard').classList.remove('hidden');
}

let lastGraphData = null;
function renderGraph(graph) {
  lastGraphData = graph;
  const nodesEl = $('graphNodes');
  nodesEl.innerHTML = graph.nodes.map((nd) => `
    <div class="gnode ${nd.hl ? 'hl' : ''} ${nd.state === 'warn' ? 'warn' : ''} ${nd.state === 'err' ? 'err' : ''}" style="left:${nd.x}%;top:${nd.y}%" data-node="${attr(nd.id)}">
      <div class="gname"><span class="dim">${nd.ico}</span>${esc(nd.name)}</div>
      <div class="gmeta">${esc(nd.meta)}</div>
    </div>`).join('');
  const svg = $('graphSvg');
  const w = svg.clientWidth || 280;
  const h = svg.clientHeight || 260;
  const pos = Object.fromEntries(graph.nodes.map((nd) => [nd.id, [nd.x * w / 100, nd.y * h / 100]]));
  svg.innerHTML = graph.edges.map(([a, b]) => {
    const [x1, y1] = pos[a] || [0, 0];
    const [x2, y2] = pos[b] || [0, 0];
    const mx = (x1 + x2) / 2;
    return `<path d="M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}"/>`;
  }).join('');
  document.querySelectorAll('.gnode').forEach((el) => {
    el.addEventListener('click', () => nodeAction(el.dataset.node));
  });
}

function renderTimeline() {
  $('timelineList').innerHTML = state.timeline.map((t) => `
    <div class="trow"><span class="${t.ok ? 't-ok' : 't-warn'}">${t.ok ? '\u2713' : '\u26a0'}</span><span class="t-name">${esc(t.name)}</span><span class="t-ms">${esc(t.ms)}</span></div>`).join('') || '<div class="alt-sub" style="padding:0 6px">Events appear here: serves, pings, missions, benchmarks.</div>';
}

/* ---------------- live world ---------------- */
let refreshPromise = null;
function refreshLive() {
  if (!bridge) return Promise.resolve();
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    state.serve = await bridge.serveState();
    state.ping = await bridge.ping({ port: enginePort(), apiKey: state.settings.apiKey });
    buildLiveWorld();
    await refreshMetrics();
    if (state.info && state.info.cli) {
      const snapRes = await bridge.snapshot();
      if (snapRes.ok && snapRes.data) state.snapshot = snapRes.data;
      buildLiveWorld();
    }
  })().catch((err) => logEvent(`Refresh failed: ${err.message}`)).finally(() => { refreshPromise = null; });
  return refreshPromise;
}

function buildLiveWorld() {
  const snap = state.snapshot || {};
  const vaultInfo = snap.vault || {};
  const up = engineUp();
  const model = servedModel();
  const ms = state.ping ? `${state.ping.ms}ms` : '\u2014';
  renderGraph({
    nodes: [
      { id: 'vault', name: 'Model Vault', meta: `${vaultInfo.models ?? state.models.length} GGUF · ${vaultInfo.ready ?? '?'} ready`, x: 52, y: 12, ico: '\u25a3' },
      { id: 'engine', name: 'llama-server', meta: up ? `:${enginePort()} · ${ms}` : 'offline', x: 30, y: 36, ico: '\u26bf', state: up ? undefined : 'err', hl: up },
      { id: 'adapter', name: 'Adapter', meta: model ? String(model).slice(0, 18) : 'none', x: 74, y: 36, ico: '\u2699\ufe0e', state: model ? undefined : 'warn' },
      { id: 'loop', name: 'Agent Loop', meta: `HELIX · ${state.missions.filter((m) => m.status === 'running').length} running`, x: 56, y: 60, ico: '\u2630' },
      { id: 'engram', name: 'ENGRAM', meta: `${snap.engrams ?? '\u2014'} memories`, x: 28, y: 84, ico: '\u25a4' },
      { id: 'web', name: 'Web Plane', meta: snap.web ? 'MCP :4177' : 'off', x: 66, y: 84, ico: '\u25c9', state: snap.web ? undefined : 'warn' },
    ],
    edges: [['vault', 'engine'], ['vault', 'adapter'], ['engine', 'loop'], ['adapter', 'loop'], ['loop', 'engram'], ['loop', 'web']],
  });
  renderTopbar();
  renderMissionPanel();
}

function nodeAction(id) {
  if (id === 'vault') switchView('vault');
  else if (id === 'engine') pingNow();
  else if (id === 'engram') switchView('memory');
  else if (id === 'loop') switchView('missions');
  else toast(`${id}: see EVENTS for details`);
}

async function pingNow() {
  if (!bridge) return;
  const port = enginePort();
  const res = await bridge.ping({ port, apiKey: state.settings.apiKey });
  state.ping = res;
  toast(res.ok ? `Engine :${port} healthy · ${res.ms}ms · ${(res.models || []).join(', ')}` : `Engine :${port} unreachable (${res.error || res.status})`);
  timelinePush(`ping :${port}`, `${res.ms}ms`, Boolean(res.ok));
  logEvent(`ping :${port} → ${res.ok ? `${res.ms}ms` : (res.error || res.status)}`);
  buildLiveWorld();
}

/* ---------------- engine control ---------------- */
function recommendModel() {
  const great = state.models.filter((m) => (m.fit || '').includes('GREAT'));
  return (great[great.length - 1] || state.models[0] || null);
}

async function quickStart() {
  const last = servedModel();
  const pick = last || (recommendModel() && recommendModel().id);
  if (!pick) {
    // Nothing discovered locally? The CLI's `up` quick lane scans the drive
    // itself, rates every GGUF against real RAM, hosts the best fit, and
    // wires the loop — the true one-click engine (CLI >= 3.2).
    if (state.info && state.info.cli && bridge && bridge.up) {
      toast('Nothing scanned locally — asking the CLI for its best-fit model (up)…');
      logEvent('quick start via CLI `up` lane');
      const res = await bridge.up({ port: state.settings.port, apiKey: state.settings.apiKey, resourceProfile: state.resourceProfile });
      if (res.ok) { toast('\u2713 Engine up — best-fit model serving'); timelinePush('up (best-fit model)', '\u2014', true); }
      else { toast('up found nothing to host — open the Vault view to scan a folder'); switchView('vault'); }
      await refreshLive();
      return;
    }
    toast('No models found — open the Vault view to scan'); switchView('vault'); return;
  }
  await serveModel(pick);
}

function modelById(id) {
  const low = String(id).toLowerCase();
  return state.models.find((m) => m.id === id)
    || state.models.find((m) => m.file && m.file.toLowerCase() === low)
    || null;
}
function parentDir(f) { return String(f).replace(/[\\/][^\\/]+$/, ''); }

// The CLI can only serve models its vault tracks. Scan-discovered models (and
// stale full-path ids left in an old serve.json) must be adopted first:
// register the containing folder as a vault root, reload the vault, and map
// to the vault's own id for that file.
async function resolveServeId(id) {
  let m = modelById(id);
  if (m && m.source === 'vault') return m.id;
  const file = (m && m.file) || (/[\\/]/.test(String(id)) ? String(id) : null);
  const roots = [];
  if (file) roots.push(parentDir(file));
  if (state.scan && Array.isArray(state.scan.hitRoots)) roots.push(...state.scan.hitRoots);
  for (const root of [...new Set(roots)]) {
    const res = await bridge.addRoot(root);
    logEvent(`vault add-root ${root} → ${res.ok ? 'ok' : (res.error || 'failed')}`);
  }
  if (roots.length) await loadModels();
  m = modelById(id) || (file && state.models.find((v) => v.file && v.file.toLowerCase() === file.toLowerCase())) || null;
  if (m && m.source === 'vault') return m.id;
  return (m && m.id) || id;
}

// Poll until the engine stops answering (port freed) so a follow-up serve
// does not trip the CLI's port-in-use pre-flight.
async function waitEngineDown(maxSecs = 20) {
  for (let i = 0; i < maxSecs; i += 1) {
    await refreshLive();
    if (!engineUp()) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

function engineHasModel(id) {
  const wanted = String(id || '').toLowerCase();
  return Boolean(state.ping && Array.isArray(state.ping.models) && state.ping.models.some((model) => String(model).toLowerCase().includes(wanted)));
}

async function forceStopEnginePort() {
  const port = String(enginePort());
  logEvent(`forcing listener shutdown on :${port}`);
  await bridge.runJson(['serve', 'stop', '--port', port, '--force', '--json'], 30000);
  return waitEngineDown();
}

async function serveModel(id) {
  if (engineBusy) return { ok: false, error: 'Engine operation already in progress' };
  if (state.missions.some((m) => m.status === 'running')) { toast('Finish or cancel the current mission before switching models.'); return { ok: false }; }
  engineBusy = true; engineFailure = ''; renderFooter();
  if (state.view === 'engine') renderEngineView();
  try {
    const result = await serveModelImpl(id);
    if (result && !result.ok) engineFailure = String(result.error || result.data?.diagnostic || result.data?.reason || 'Engine failed to start').slice(0, 2000);
    return result;
  } catch (err) { engineFailure = err.message; toast(`Engine failed: ${err.message}`); return { ok: false, error: err.message }; }
  finally { engineBusy = false; renderFooter(); if (state.view === 'engine') renderEngineView(); }
}

async function serveModelImpl(id) {
  if (!bridge) return;
  if (!(state.info && state.info.cli)) { toast('Connect the LehroSol CLI first (Settings)'); switchView('settings'); return; }
  const serveId = await resolveServeId(id);
  if (serveId !== id) logEvent(`resolved "${id}" → vault model "${serveId}"`);
  toast(`Starting ${serveId} on :${state.settings.port}… (first load can take a few minutes)`);
  logEvent(`vault serve ${serveId} :${state.settings.port}`);
  // Switching models? The CLI's serve pre-flight refuses a busy port
  // ("port-in-use"), so stop the current engine and wait for the port first.
  if (engineUp() && !engineHasModel(serveId)) {
    logEvent(`switching engine: freeing :${state.settings.port} before ${serveId}`);
    await forceStopEnginePort();
  }
  const started = Date.now();
  // Give CPU/HDD model loads enough time. The CLI returns a retained engine
  // log if the binary exits, so a real startup failure is diagnosable here.
  // The CLI waits for readiness internally (up to 60s) and treats slower
  // loads as background startup — this cockpit's own run timeout governs.
  // The old `--readyTimeout` flag no longer exists in the CLI v3.2 surface.
  const serveArgs = ['vault', 'serve', '--model', serveId, '--port', state.settings.port, '--apiKey', state.settings.apiKey, '--resourceProfile', state.resourceProfile, '--json'];
  let res = await bridge.runJson(serveArgs, 600000);
  if (!res.ok && /port-in-use/.test(String((res.data && res.data.reason) || res.error || res.raw || ''))) {
    logEvent('port busy (stale engine) — stopping it and retrying once');
    await forceStopEnginePort();
    res = await bridge.runJson(serveArgs, 600000);
  }
  const secs = ((Date.now() - started) / 1000).toFixed(0);
  if (res.ok) {
    toast(`\u2713 ${serveId} serving on :${state.settings.port} (${secs}s)`);
    notify(`Engine online: ${serveId}`);
    timelinePush(`serve ${serveId}`, `${secs}s`, true);
  } else {
    const reason = (res.data && (res.data.diagnostic || res.data.reason)) || res.error || res.raw || JSON.stringify(res.data) || 'unknown';
    toast('\u2717 serve failed — see OUTPUT');
    logEvent(`serve failed: ${reason.slice(0, 140)}`);
    appendPane('outputOut', `\nserve error (${serveId}):\n${reason}\n`);
    timelinePush(`serve ${serveId}`, 'failed', false);
  }
  await refreshLive();
  if (res.ok && !engineUp()) logEvent(`engine not answering on :${enginePort()} yet — model may still be loading (auto re-ping every 5s)`);
  return res;
}

async function stopEngine() {
  if (state.missions.some((m) => m.status === 'running')) { toast('Cancel the current mission before stopping its engine.'); return; }
  if (!bridge || !(state.info && state.info.cli)) return;
  const res = await bridge.runJson(['serve', 'stop', '--json'], 30000);
  toast(res.ok ? 'Engine stopped' : 'No tracked engine to stop');
  timelinePush('serve stop', '\u2014', res.ok);
  logEvent('serve stop');
  await refreshLive();
}

/* ---------------- missions ---------------- */
const PHASE_RE = /\[(architect|scout|builder|reviewer|scribe)\]/i;

/* ---------------- ask bar intelligence & status ---------------- */
// Mirrors the CLI's skill inference so users can see which skills a prompt
// will activate BEFORE running it (presentation only — the CLI decides for real).
const SKILL_HINTS = [
  [/\b(loop|iterate|repeat|until|keep going)\b/i, 'loop-discipline'],
  [/\b(fix|bug|error|crash|broken|fail)\b/i, 'evidence-check'],
  [/\b(refactor|clean|rewrite|restructure|simplify)\b/i, 'safe-change'],
  [/\b(ram|memory|slow|perf|optimi[sz]e|efficien)\b/i, 'resource-aware'],
  [/\b(test|verify|check|validate)\b/i, 'harness-verification'],
  [/\b(plan|design|architect)\b/i, 'clear-outcome'],
];
function renderAskChips() {
  const box = $('askSkills');
  if (!box) return;
  const text = $('askInput').value;
  if (!text.trim()) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  const hits = SKILL_HINTS.filter(([re]) => re.test(text)).map(([, id]) => id).slice(0, 4);
  const mode = $('missionContext') ? $('missionContext').value : 'normal';
  box.innerHTML = hits.map((id) => `<span class="ask-chip">\u26a1 ${esc(id)}</span>`).join('') + `<span class="ask-chip dim-chip">${esc(mode)} ctx · ${esc(state.reasoning)} reasoning</span>`;
  box.classList.remove('hidden');
}
function renderStatusMission() {
  const el = $('stMission');
  if (!el) return;
  const running = state.missions.find((m) => m.status === 'running');
  if (!running) { el.classList.add('hidden'); el.textContent = ''; return; }
  el.textContent = running.step ? `\u25b8 mission step ${running.step}/${running.total}` : '\u25b8 mission starting\u2026';
  el.classList.remove('hidden');
}
function applyThemeSetting() {
  appearance.theme = state.theme;
  applyAppearance();
}
async function undoLastMission() {
  closePalette();
  if (!(bridge && state.info && state.info.cli)) { toast('Connect the LehroSol CLI first'); return; }
  const res = await bridge.runJson(['missions', 'undo', '--id', 'last', '--json'], 30000);
  toast(res.data && res.data.ok ? `\u2713 Rolled back — ${(res.data.restored || []).length} restored, ${(res.data.deleted || []).length} removed` : 'Nothing to undo');
}
function showShortcuts() {
  openModal(`<h3>Keyboard shortcuts</h3>
    <div class="alt-sub" style="line-height:2">\u2318/Ctrl K — command palette<br>\u2318/Ctrl / — focus the ask bar<br>\u2191 \u2193 in ask bar — recall previous prompts<br>\u2318/Ctrl S — save current file<br>\u2318/Ctrl J — toggle the bottom panel<br>\u2318/Ctrl M — mission history<br>\u2318/Ctrl . — this overlay<br>Esc — close dialogs</div>
    <div class="modal-actions"><button class="btn btn-dark" id="scClose">Close</button></div>`);
  $('scClose').addEventListener('click', closeModal);
}

function runMission(prompt) {
  if (!bridge) return;
  // Missions run the CLI's code agent INSIDE a project folder - refuse to
  // silently work the GUI's own source folder when nothing is open.
  if (!state.projectDir) { toast('Open a project folder first - missions work inside it'); switchView('files'); return; }
  if (!(state.info && state.info.cli)) { toast('Connect the LehroSol CLI first (Settings)'); switchView('settings'); return; }
  if (!engineUp()) { toast('Engine offline — starting it first…'); quickStart().then(() => { if (engineUp()) runMission(prompt); }); return; }
  const live = $('missionLive').checked;
  const allowRun = $('missionRun').checked;
  const contextMode = $('missionContext').value;
  // Remember the prompt for ArrowUp recall in the ask bar.
  state.askHistory = [prompt, ...state.askHistory.filter((p) => p !== prompt)].slice(0, 25);
  localStorage.setItem('lc.askHistory', JSON.stringify(state.askHistory));
  state.askHistIdx = -1;
  const id = `m${state.missionSeq += 1}`;
  const mission = { id, prompt, model: servedModel() || state.ping?.models?.[0], project: state.projectDir, dryRun: !live, allowRun, status: 'running', phase: 'starting', startedAt: Date.now(), ms: null, tail: [], activity: [], raw: '', step: 0, total: 0, changedFiles: [], contextMode };
  state.missions.unshift(mission);
  state.missions = state.missions.filter((m, i) => i < 30 || m.status === 'running');
  outputSelection = id;
  renderMissionPanel(); renderTopbar();
  appendPane('outputOut', `\n\u25b8 [${id}] mission: ${prompt}${live ? '' : '  (dry run)'}\n`);
  if (state.view !== 'code' || !layout.split) switchView('output');
  renderOutput();
  // v2.1.6 sent prompts to `loop run` - the scoring/verdict harness - which
  // never reads files or answers questions (a dry run makes NO model calls).
  // The `code` lane (CLI >= 3.0.17) is the hands-on agent: it lists and reads
  // the project, works the task, and reports an honest summary.
  const args = ['code', prompt, '--port', String(enginePort()), '--apiKey', state.settings.apiKey, '--reasoning', state.reasoning, '--resourceProfile', state.resourceProfile, '--contextMode', contextMode];
  if (state.info?.codeEvents) args.push('--events');
  if (!live) args.push('--dryRun');
  if (allowRun) args.push('--allowRun');
  if (state.profileNeedsRestart) args.push('--restart');
  bridge.streamStart({ id, args, cwd: state.projectDir || undefined }).then((res) => {
    if (!res.ok) {
      mission.status = 'failed';
      mission.tail.push(res.error || 'failed to start');
      mission.ms = Date.now() - mission.startedAt;
      workspace.feed(mission, `Unable to start: ${res.error || 'unknown error'}\n`);
      renderMissionPanel();
      renderOutput(); renderFooter();
      appendPane('outputOut', `\u2717 ${res.error}\n`);
    }
  });
  if (state.profileNeedsRestart) state.profileNeedsRestart = false;
}

function cancelMission(id) {
  bridge.streamStop({ id });
  const m = state.missions.find((x) => x.id === id);
  if (m && m.status === 'running') { m.status = 'cancelled'; m.ms = Date.now() - m.startedAt; }
  renderMissionPanel();
  renderOutput(); renderFooter();
  logEvent(`mission ${id} cancelled`);
}

if (bridge) {
  bridge.onStream((kind, msg) => {
    const m = state.missions.find((x) => x.id === msg.id);
    if (kind === 'data') {
      appendPane('outputOut', msg.chunk);
      if (m) {
        workspace.feed(m, msg.chunk);
        const lines = m.tail;
        for (const line of lines) {
          const phase = line.match(PHASE_RE);
          if (phase) m.phase = phase[1].toLowerCase();
          const step = line.match(/^\[(\d+)\/(\d+)\]/);
          if (step) { m.step = Number(step[1]); m.total = Number(step[2]); }
          const files = line.match(/Files changed[:\s]+(.+)$/i);
          if (files && !/\(none/.test(files[1])) m.changedFiles = files[1].split(',').map((s) => s.trim()).filter(Boolean);
        }
        scheduleOutputRender();
      }
    } else {
      if (m) workspace.feed(m, '', true);
      if (m && m.status === 'running') {
        m.status = msg.code === 0 && m.result?.ok !== false ? 'done' : 'failed';
        m.ms = Date.now() - m.startedAt;
      }
      appendPane('outputOut', `\n\u25aa [${msg.id}] mission ended (exit ${msg.code})\n`);
      if (m) {
        timelinePush(`mission: ${m.prompt.slice(0, 26)}…`, `${((m.ms || 0) / 1000).toFixed(1)}s`, msg.code === 0);
        notify(`Mission ${m.status} in ${((m.ms || 0) / 1000).toFixed(1)}s${(m.changedFiles && m.changedFiles.length) ? ` · ${m.changedFiles.length} file(s) changed` : ''}: ${m.prompt.slice(0, 40)}`);
      }
      renderMissionPanel(); renderTopbar();
      renderOutput(); refreshMetrics();
    }
  });
}

/* ---------------- terminal ---------------- */
let termReady = false;
let termWired = false;
let termId = null;
let termSeq = 0;
let termStarting = null;
async function ensureTerminal() {
  if (termReady || !bridge) return;
  if (termStarting) return termStarting;
  if (!termWired) {
    termWired = true;
    bridge.onTerm((kind, msg) => {
      if (msg.id !== termId) return;
      if (kind === 'data') appendPane('termOut', msg.chunk);
      else { termReady = false; appendPane('termOut', `\n[shell exited ${msg.code}]\n`); }
    });
  }
  const id = `t${++termSeq}`;
  termId = id;
  termStarting = (async () => {
    try {
      const res = await bridge.termCreate({ id, cwd: state.projectDir || undefined });
      if (termId !== id) return;
      termReady = Boolean(res.ok);
      appendPane('termOut', res.ok ? `[${res.shell}${state.projectDir ? ' — ' + state.projectDir : ''}]\n` : `terminal error: ${res.error}\n`);
    } catch (err) {
      if (termId === id) termReady = false;
      appendPane('termOut', `terminal error: ${err.message}\n`);
    } finally { termStarting = null; }
  })();
  return termStarting;
}
async function termSubmit(cmd) {
  if (!bridge) return;
  await ensureTerminal();
  if (!termReady) return;
  const res = await bridge.termInput({ id: termId, data: cmd + '\n' });
  if (!res.ok) { termReady = false; appendPane('termOut', `terminal error: ${res.error || 'shell unavailable'}\n`); }
}

/* ---------------- views ---------------- */
function switchView(view) {
  state.view = view;
  afterViewChange(view);
  document.querySelectorAll('.rail-btn[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  const alt = $('viewAlt');
  const code = $('viewCode');
  if (view === 'output') { code.classList.add('hidden'); alt.classList.add('hidden'); return; }
  if (view === 'code') { alt.classList.add('hidden'); code.classList.remove('hidden'); return; }
  code.classList.add('hidden'); alt.classList.remove('hidden');
  if (view === 'vault') renderVaultView();
  else if (view === 'bench') renderBenchView();
  else if (view === 'files') renderFilesView();
  else if (view === 'skills') renderSkillsView();
  else if (view === 'missions') renderMissionsView();
  else if (view === 'memory') renderMemoryView();
  else if (view === 'settings') renderSettingsView();
  else if (view === 'search') renderSearchView();
  else if (view === 'onboarding') renderOnboarding();
}

function fitBadge(fit) {
  const f = String(fit || '').toUpperCase();
  const cls = f.includes('TIGHT') ? 'fit-tight' : (f.includes('NO') ? 'fit-no' : 'fit-great');
  return `<span class="fitbadge ${cls}">${esc(f || 'GREAT')}</span>`;
}

async function renderVaultView() {
  const alt = $('viewAlt');
  alt.innerHTML = `<div class="alt-title">Model Vault</div>
    <div class="alt-sub">${state.modelsSource === 'vault' ? 'Models tracked by the LehroSol CLI vault — shared with the CLI.' : (state.modelsSource === 'scan' ? 'Models found by scanning this PC — not yet in the CLI vault.' : 'Discovering models…')}</div>
    <div style="display:flex;gap:8px;margin-bottom:14px">
      <button class="btn btn-dark" id="btnRescan">\u2315 Rescan drives</button>
      ${state.modelsSource === 'scan' && state.models.length ? '<button class="btn btn-green" id="btnAdopt">+ Add found folders to CLI vault</button>' : ''}
      <button class="btn btn-dark" id="btnScanFolder">Scan another folder…</button>
    </div>
    <div id="vaultList">${state.models.length ? '' : 'Scanning…'}</div>
    <div class="alt-sub" id="scanInfo"></div>`;
  $('btnRescan').addEventListener('click', async () => { state.modelsSource = null; await loadModels(); renderVaultView(); });
  const adopt = $('btnAdopt');
  if (adopt) adopt.addEventListener('click', adoptScanRoots);
  $('btnScanFolder').addEventListener('click', async () => {
    const dir = await bridge.projectPick();
    if (!dir) return;
    state.scan = await bridge.nativeScan({ extraDirs: [dir] });
    state.models = (state.scan.models || []).map((m) => ({ id: m.id, sizeLabel: `${m.sizeGB} GB`, fit: m.fit, file: m.file, role: m.quant ? `quant ${m.quant}` : '', source: 'scan' }));
    state.modelsSource = 'scan';
    renderVaultView();
  });
  if (!state.models.length) await loadModels();
  $('vaultList').innerHTML = state.models.length
    ? state.models.map((m) => `<div class="vault-card"><div style="flex:1"><div class="vault-name">${esc(m.id)}</div><div class="vault-meta">${esc(m.sizeLabel)}${m.role ? ' · ' + esc(m.role) : ''}${m.file ? ' · <span class="scan-root">' + esc(m.file) + '</span>' : ''}</div></div>${fitBadge(m.fit)}<button class="btn btn-dark" data-bench="${attr(m.id)}">Test</button><button class="btn btn-green" data-serve="${attr(m.id)}">Serve</button></div>`).join('')
    : '<div class="alt-sub">No GGUF models found on this PC. Put models in a folder like <code>D:\\AI Models</code> or use “Scan another folder…”.</div>';
  if (state.scan) $('scanInfo').textContent = `Scanned ${state.scan.scannedRoots.length} folder(s) · RAM ${state.scan.totalGB} GB · usable budget ~${state.scan.budgetGB} GB`;
  document.querySelectorAll('[data-serve]').forEach((b) => b.addEventListener('click', () => serveModel(b.dataset.serve)));
  document.querySelectorAll('[data-bench]').forEach((b) => b.addEventListener('click', () => { switchView('bench'); const sel = $('benchModel'); if (sel) sel.value = b.dataset.bench; }));
}

/* ---------------- test bench ---------------- */
async function ensureServed(modelId) {
  if (servedModel() === modelId && engineUp()) return true;
  const res = await serveModel(modelId);
  return Boolean(res && res.ok && engineUp());
}

async function benchRun(modelId, label, prompt, maxTokens) {
  const okServe = await ensureServed(modelId);
  if (!okServe) { logEvent(`bench: could not serve ${modelId}`); return { ok: false, model: modelId, label, error: 'engine failed to start' }; }
  logEvent(`bench: ${label} on ${modelId}`);
  const res = await bridge.chat({ port: enginePort(), apiKey: state.settings.apiKey, model: modelId, source: 'desktop-bench', prompt, maxTokens });
  refreshMetrics();
  const entry = { model: modelId, label, ok: res.ok, ms: res.ms, tokens: res.tokens, tokPerSec: res.tokPerSec, text: res.ok ? res.text : (res.error || 'failed'), at: new Date().toLocaleTimeString() };
  state.bench.unshift(entry);
  timelinePush(`bench ${modelId.slice(0, 18)}`, res.ok ? `${res.tokPerSec ?? '?'} tok/s` : 'failed', res.ok);
  return entry;
}

function benchLeaderboard() {
  const byModel = {};
  for (const b of state.bench.filter((x) => x.ok)) {
    (byModel[b.model] = byModel[b.model] || []).push(b);
  }
  return Object.entries(byModel).map(([model, runs]) => ({
    model,
    runs: runs.length,
    avgTokPerSec: Math.round(runs.reduce((s, r) => s + (r.tokPerSec || 0), 0) / runs.length * 10) / 10,
    avgMs: Math.round(runs.reduce((s, r) => s + r.ms, 0) / runs.length),
  })).sort((a, b) => b.avgTokPerSec - a.avgTokPerSec);
}

async function renderBenchView() {
  const alt = $('viewAlt');
  if (!state.models.length) await loadModels();
  const options = state.models.map((m) => `<option value="${attr(m.id)}">${esc(m.id)} (${esc(m.sizeLabel)})</option>`).join('');
  const board = benchLeaderboard();
  alt.innerHTML = `<div class="alt-title">Model Test Bench</div>
    <div class="alt-sub">Benchmark and feel out each model: one click serves it, runs the prompt, and records latency + tokens/sec. Run the same preset across models to compare.</div>
    <div class="alt-sub" id="benchLoad" style="margin-top:-6px"></div>
    <div class="bench-grid">
      <div><label>Model</label><select id="benchModel">${options || '<option>no models found</option>'}</select></div>
      <div><label>Prompt preset</label><select id="benchPreset">
        <option value="code">Code · debounce()</option>
        <option value="reasoning">Reasoning · sheep</option>
        <option value="summary">Summarize · 3 bullets</option>
        <option value="creative">Creative · poem</option>
        <option value="custom">Custom…</option>
      </select></div>
      <div><label>Max tokens</label><input id="benchMax" value="256" style="width:70px" /></div>
      <div><button class="btn btn-green" id="btnBenchRun">\u25b8 Run</button></div>
      <div><button class="btn btn-dark" id="btnBenchAll" title="Runs the selected preset on every GREAT-fit model, one after another">Run on all GREAT models</button></div>
    </div>
    <textarea id="benchCustom" class="hidden" rows="3" style="width:100%;margin-bottom:12px" placeholder="Custom prompt…"></textarea>
    ${board.length ? `<table class="bench-table"><tr><th>MODEL</th><th>RUNS</th><th>AVG TOK/S</th><th>AVG LATENCY</th></tr>${board.map((r, i) => `<tr class="${i === 0 ? 'best' : ''}"><td>${esc(r.model)}</td><td>${r.runs}</td><td>${r.avgTokPerSec}</td><td>${r.avgMs}ms</td></tr>`).join('')}</table>` : ''}
    <div id="benchResults">${state.bench.map(benchResultHtml).join('')}</div>`;
  $('benchPreset').addEventListener('change', (e) => $('benchCustom').classList.toggle('hidden', e.target.value !== 'custom'));
  $('btnBenchRun').addEventListener('click', async () => {
    if (state.benchBusy) { toast('A benchmark is already running'); return; }
    const model = $('benchModel').value;
    const presetKey = $('benchPreset').value;
    const prompt = presetKey === 'custom' ? $('benchCustom').value.trim() : BENCH_PRESETS[presetKey];
    if (!prompt) { toast('Write a custom prompt first'); return; }
    const maxTokens = Number($('benchMax').value) || 256;
    state.benchBusy = true;
    toast(`Testing ${model}…`);
    await benchRun(model, presetKey, prompt, maxTokens);
    state.benchBusy = false;
    if (state.view === 'bench') renderBenchView();
  });
  $('btnBenchAll').addEventListener('click', async () => {
    if (state.benchBusy) { toast('A benchmark is already running'); return; }
    const presetKey = $('benchPreset').value;
    const prompt = presetKey === 'custom' ? $('benchCustom').value.trim() : BENCH_PRESETS[presetKey];
    if (!prompt) { toast('Write a custom prompt first'); return; }
    const maxTokens = Number($('benchMax').value) || 256;
    const targets = state.models.filter((m) => (m.fit || 'GREAT').includes('GREAT'));
    if (!targets.length) { toast('No GREAT-fit models'); return; }
    state.benchBusy = true;
    notify(`Comparing ${targets.length} models — this serves each one in turn`);
    for (const m of targets) {
      toast(`Testing ${m.id}…`);
      await benchRun(m.id, presetKey, prompt, maxTokens);
      if (state.view === 'bench') renderBenchView();
    }
    state.benchBusy = false;
    toast('\u2713 Comparison complete');
    if (state.view === 'bench') renderBenchView();
  });
  // Benchmark validity guard: background load silently skews tok/s readings
  // (a runaway process made a 9B model look 6x slower during live testing).
  if (bridge && bridge.cpuLoad) {
    bridge.cpuLoad().then((load) => {
      const el = $('benchLoad');
      if (!el) return;
      if (load >= 60) el.textContent = `\u26a0 Background CPU load ${load}% — tok/s readings may be skewed. Close heavy apps and re-run.`;
      else el.textContent = `CPU load ${load}% — readings are valid.`;
    });
  }
}
function benchResultHtml(b) {
  return `<div class="bench-result"><div class="br-head"><span class="bench-model">${esc(b.model)}</span><span class="tag tag-green">${esc(b.label)}</span><span class="flex1"></span><span class="bench-stats">${b.ok ? `${b.ms}ms · ${b.tokens ?? '?'} tok · ${b.tokPerSec ?? '?'} tok/s` : 'failed'} · ${esc(b.at)}</span></div><div class="bench-text">${esc(b.text)}</div></div>`;
}

/* ---------------- other views ---------------- */
let filesRequest = 0;
async function renderFilesView() {
  const request = ++filesRequest;
  const dir = state.projectDir;
  const alt = $('viewAlt');
  alt.innerHTML = `<div class="alt-title">Files</div><div class="alt-sub">${state.projectDir ? esc(state.projectDir) : 'No project open.'}</div><button class="btn btn-green" id="btnOpenProject">Open Project Folder</button><div id="treeList" style="margin-top:12px"></div>`;
  $('btnOpenProject').addEventListener('click', pickProject);
  if (state.projectDir && bridge) {
    const tree = await bridge.projectTree({ dir });
    if (request !== filesRequest || state.view !== 'files' || state.projectDir !== dir || !$('treeList')) return;
    if (!Array.isArray(tree)) { state.tree = []; $('treeList').innerHTML = ''; toast(tree.error || 'Project folder unavailable'); return; }
    state.tree = tree;
    $('treeList').innerHTML = treeHtml(state.tree, 0);
    document.querySelectorAll('.tree-item[data-file]').forEach((el) => el.addEventListener('click', () => openFile(el.dataset.file)));
  }
}
function treeHtml(entries, depth) {
  return entries.map((e) => e.dir
    ? `<div class="tree-item tree-dir" style="padding-left:${8 + depth * 14}px">\u25b8 ${esc(e.name)}</div>${treeHtml(e.children || [], depth + 1)}`
    : `<div class="tree-item" data-file="${attr(e.path)}" style="padding-left:${8 + depth * 14}px">\u29c9 ${esc(e.name)}</div>`).join('');
}
async function pickProject() {
  if (!bridge) return;
  if (hasUnsavedChanges() && !window.confirm('Discard unsaved edits and open another project?')) return;
  const dir = await bridge.projectPick();
  if (!dir) return;
  state.projectDir = dir;
  state.tree = [];
  state.tabs = [{ name: 'Welcome', ico: '\u2b21' }];
  state.openFiles = {};
  state.activeTab = 0;
  state.editing = false;
  renderTabs(); renderEditor(); renderSuggestion(null);
  // Re-home the integrated terminal: the old shell was started in whatever
  // folder the GUI launched from, not the project the user just opened.
  if (termReady || termStarting) {
    if (termStarting) await termStarting;
    const oldId = termId;
    termId = null;
    await bridge.termKill({ id: oldId });
    termReady = false;
    appendPane('termOut', `\n[terminal re-homed to ${dir}]\n`);
    ensureTerminal();
  }
  renderTopbar();
  if (state.view === 'files') renderFilesView();
}
let openFileRequest = 0;
async function openFile(path) {
  if (!bridge) return;
  const request = ++openFileRequest;
  syncEditorDraft();
  const existing = state.tabs.findIndex((t) => t.path === path);
  if (existing >= 0) { selectTab(existing); switchView('code'); return; }
  const project = state.projectDir;
  const res = await bridge.projectRead({ file: path });
  if (request !== openFileRequest || project !== state.projectDir) return;
  if (!res.ok) { toast(`Cannot read: ${res.error}`); return; }
  const name = path.split(/[\\/]/).pop();
  syncEditorDraft();
  state.editing = false;
  state.openFiles[path] = { path, content: res.content, savedContent: res.content, truncated: Boolean(res.truncated) };
  state.tabs.push({ path, name, ico: (name.split('.').pop() || 'f').slice(0, 2).toUpperCase() }); state.activeTab = state.tabs.length - 1;
  switchView('code');
  renderTabs(); renderEditor(); renderSuggestion(null);
  if (res.truncated) toast('Large file preview is read-only; open it in an external editor to change it.');
}

function renderSkillsView() {
  const alt = $('viewAlt');
  const skills = [
    ['workspace-first', 'Inspect the opened project before making project-specific claims or changes.'],
    ['intent-and-scope', 'Keep work tightly aligned to the requested outcome and state assumptions briefly.'],
    ['safe-change', 'Read before editing; preserve unrelated behavior and keep writes within the project.'],
    ['evidence-check', 'Inspect results and verify with the most focused available check.'],
    ['clear-outcome', 'End with a concise factual summary of changes, evidence, and limits.'],
    ['efficient-context', 'Use preloaded context and targeted reads to avoid unnecessary agent steps.'],
    ['loop-discipline', 'For loop requests, use a bounded objective, evidence gate, and recovery path.'],
    ['mode-alignment', 'Align planning, building, review, repair, and documentation work to the right workflow.'],
    ['resource-aware', 'Respect active RAM, CPU, and GPU capacity for a responsive local workflow.'],
  ];
  alt.innerHTML = `<div class="alt-title">Engineering Skills</div><div class="alt-sub">Task intent activates the relevant local skills automatically. Select a specific skill only when you want to foreground it.</div><div class="settings-row"><label>Reasoning level</label><select id="skillReasoning"><option value="focused" ${state.reasoning === 'focused' ? 'selected' : ''}>Focused — smallest sufficient investigation</option><option value="standard" ${state.reasoning === 'standard' ? 'selected' : ''}>Standard — inspect, act, then verify</option><option value="deep" ${state.reasoning === 'deep' ? 'selected' : ''}>Deep — dependencies, edge cases, verification</option></select></div><div class="settings-row"><label>Resource profile</label><select id="skillResource"><option value="eco" ${state.resourceProfile === 'eco' ? 'selected' : ''}>Eco — preserve RAM while multitasking</option><option value="balanced" ${state.resourceProfile === 'balanced' ? 'selected' : ''}>Balanced — normal local workflow</option><option value="performance" ${state.resourceProfile === 'performance' ? 'selected' : ''}>Performance — larger context when memory permits</option></select></div>` +
    skills.map(([n, d]) => `<div class="skill-card" data-skill="${n}"><b>${n}</b><div class="alt-sub" style="margin:4px 0 0">${d}</div></div>`).join('');
  document.querySelectorAll('.skill-card').forEach((el) => el.addEventListener('click', () => {
    $('askInput').value = `use skill: ${el.dataset.skill} — `;
    switchView('code'); $('askInput').focus();
  }));
  const reasoning = $('skillReasoning');
  if (reasoning) reasoning.addEventListener('change', () => { state.reasoning = reasoning.value; localStorage.setItem('lc.reasoning', state.reasoning); toast(`Reasoning: ${state.reasoning}`); });
  const profile = $('skillResource');
  if (profile) profile.addEventListener('change', () => { state.resourceProfile = profile.value; state.profileNeedsRestart = true; localStorage.setItem('lc.resourceProfile', state.resourceProfile); toast(`Resource profile: ${state.resourceProfile} — next mission restarts the engine`); });
}

async function renderMissionsView() {
  const session = state.missions.map((m) => `<div class="bench-result"><div class="br-head"><span class="phase-badge">${esc(m.status)}</span><span class="bench-model">${esc(m.prompt.slice(0, 80))}</span><span class="flex1"></span><span class="bench-stats">${m.ms != null ? (m.ms / 1000).toFixed(1) + 's' : 'running'}</span></div><div class="bench-text">${esc(m.tail.join('\n'))}</div></div>`).join('');
  $('viewAlt').innerHTML = `<div class="alt-title">Missions</div><div class="alt-sub">Every prompt becomes a journaled mission: watch it live, roll it back with Undo, or re-run it. The context engine tunes itself from this history.</div>
    <div class="alt-sub" style="margin-top:10px;font-weight:600">Journal (on disk — survives restarts)</div><div id="journalList" class="alt-sub">Loading mission journal…</div>
    ${session ? `<div class="alt-sub" style="margin-top:10px;font-weight:600">This session</div>${session}` : ''}`;
  if (!(bridge && state.info && state.info.cli)) { $('journalList').textContent = 'Connect the LehroSol CLI to see the on-disk mission journal.'; return; }
  const journal = $('journalList');
  const res = await bridge.runJson(['missions', 'list', '--json', '--limit', '15'], 30000);
  if (state.view !== 'missions' || $('journalList') !== journal) return;
  const rows = res.data && res.data.missions;
  if (!rows || !rows.length) { $('journalList').textContent = 'No missions in the journal yet — run one from the ask bar.'; return; }
  $('journalList').outerHTML = '<div id="journalList">' + rows.map((m) => `
    <div class="bench-result"><div class="br-head"><span class="phase-badge">${m.ok ? '\u2713 ok' : '\u2717 failed'}</span><span class="bench-model">${esc(String(m.task || '').slice(0, 70))}</span><span class="flex1"></span><span class="bench-stats">${m.steps ?? '?'} step(s) · ${m.durationMs ? (m.durationMs / 1000).toFixed(1) + 's' : '?'}${m.contextModeSource === 'adaptive' ? ' · auto-tuned' : ''}</span></div>
    <div class="bench-text">${esc((m.changedFiles || []).join(', ') || '(no files changed)')}${m.error ? `\n${esc(String(m.error).slice(0, 120))}` : ''}</div>
    <div class="modal-actions" style="justify-content:flex-start;margin-top:6px">${(m.changedFiles || []).length ? `<button class="btn btn-dark" data-undo="${attr(m.id)}">Undo</button>` : ''}<button class="btn btn-dark" data-replay-task="${attr(String(m.task || ''))}">Re-run</button></div></div>`).join('') + '</div>';
  document.querySelectorAll('[data-undo]').forEach((el) => el.addEventListener('click', async () => {
    const undone = await bridge.runJson(['missions', 'undo', '--id', el.dataset.undo, '--json'], 30000);
    toast(undone.data && undone.data.ok ? `\u2713 Undid ${el.dataset.undo} — ${(undone.data.restored || []).length} restored, ${(undone.data.deleted || []).length} removed` : 'Nothing to undo for that mission');
    if (state.view === 'missions') renderMissionsView();
  }));
  document.querySelectorAll('[data-replay-task]').forEach((el) => el.addEventListener('click', () => { switchView('code'); runMission(el.dataset.replayTask); }));
}

async function renderMemoryView() {
  const alt = $('viewAlt');
  const n = state.snapshot && state.snapshot.engrams;
  const nLabel = esc(Array.isArray(n) ? n.length : (n ?? '\u2026'));
  alt.innerHTML = `<div class="alt-title">Memory (ENGRAM)</div><div class="alt-sub">${nLabel} engrams on disk — recalled automatically at mission start.</div><button class="btn btn-dark" id="btnEngram">Show recent engrams</button><pre id="engramOut" style="font-family:var(--mono);font-size:12px;margin-top:10px;color:var(--dim)"></pre>`;
  $('btnEngram').addEventListener('click', async () => {
    if (!bridge) { toast('Launch the desktop app to read memory.'); return; }
    const output = $('engramOut');
    // The CLI command is `engrams` (v3.0+ — `engram list` no longer exists)
    // and now supports --json, so the memory panel consumes real data again.
    const res = bridge.engrams
      ? await bridge.engrams(15)
      : await bridge.runJson(['engrams', '--json'], 30000);
    if (state.view !== 'memory' || $('engramOut') !== output) return;
    output.textContent = res.data ? JSON.stringify(res.data, null, 2).slice(0, 4000) : (res.raw || res.error || 'no data');
  });
}

function renderSettingsView() {
  const alt = $('viewAlt');
  const cli = state.info && state.info.cli;
  alt.innerHTML = `<div class="alt-title">Settings</div><div class="alt-sub">Lehrosol Code v${esc(APP_VERSION)} · ${cli ? `CLI v${esc((state.info && state.info.cliVersion) || '?')} connected` : 'CLI not connected'}</div>
    <div class="settings-row"><label>LehroSol CLI</label><span class="${cli ? 'green' : ''}" style="font-family:var(--mono);font-size:12px">${cli ? esc(cli) : 'not found'}</span><button class="btn btn-dark" id="btnLocateCli">Locate…</button></div>
    <div class="settings-row"><label>State home</label><span style="font-family:var(--mono);font-size:12px">${esc((state.info && state.info.home) || '~/.lehro')}</span></div>
    <div class="settings-row"><label>RAM</label><span style="font-family:var(--mono);font-size:12px">${esc(String((state.info && state.info.totalGB) || '?'))} GB total</span></div>
    <div class="settings-row"><label>Resource profile</label><select id="setResource"><option value="eco" ${state.resourceProfile === 'eco' ? 'selected' : ''}>Eco</option><option value="balanced" ${state.resourceProfile === 'balanced' ? 'selected' : ''}>Balanced</option><option value="performance" ${state.resourceProfile === 'performance' ? 'selected' : ''}>Performance</option></select><span class="dim">Smart context, threads, and RAM headroom</span></div>
    <div class="settings-row"><label>Theme</label><select id="setTheme">${workspace.themes.map((theme) => `<option value="${theme}" ${state.theme === theme ? 'selected' : ''}>${theme[0].toUpperCase() + theme.slice(1)}</option>`).join('')}</select><button class="btn btn-dark" id="settingsAppearance">Accent, density &amp; fonts</button></div>
    <div class="settings-row"><label>Workspace</label><button class="btn btn-dark" id="settingsViews">Views &amp; saved layouts</button><button class="btn btn-dark" id="settingsPreferences">Import / export setup</button></div>
    <div class="settings-row"><label>Default port</label><input id="setPort" value="${attr(state.settings.port)}" /></div>
    <div class="settings-row"><label>API key</label><input id="setKey" type="password" value="${attr(state.settings.apiKey)}" /></div>
    <div class="settings-row"><label>Auto-start engine</label><label class="livetoggle"><input type="checkbox" id="setAuto" ${state.settings.autoServe ? 'checked' : ''} /> resume the last served model on launch</label></div>
    <div class="modal-actions" style="justify-content:flex-start"><button class="btn btn-green" id="btnSaveSettings">Save</button><button class="btn btn-dark" id="btnStopEngine">Stop engine</button><button class="btn btn-dark" id="btnSettingsUpdate">Check for updates</button></div>`;
  $('btnSettingsUpdate').addEventListener('click', () => window.lehroUpdates?.check());
  $('settingsAppearance').addEventListener('click', appearanceDialog);
  $('settingsViews').addEventListener('click', viewsDialog);
  $('settingsPreferences').addEventListener('click', preferencesDialog);
  $('btnLocateCli').addEventListener('click', async () => {
    if (!bridge) { toast('Launch the desktop app to connect the CLI.'); return; }
    const file = await bridge.pickFile();
    if (!file) return;
    const res = await bridge.setCliPath(file);
    if (res.ok) {
      localStorage.setItem('lc.cliPath', file);
      state.settings.cliPath = file;
      state.info = res;
      toast('\u2713 CLI connected');
      logEvent(`CLI path set: ${file}`);
      await loadModels();
      await refreshLive();
      renderSettingsView();
    } else {
      toast('That file does not exist');
    }
  });
  $('btnSaveSettings').addEventListener('click', () => {
    const port = $('setPort').value.trim();
    if (!validPort(port)) { toast('Port must be a whole number from 1 to 65535.'); return; }
    state.settings.port = String(Number(port));
    state.settings.apiKey = $('setKey').value.trim() || 'lehro-local';
    state.settings.autoServe = $('setAuto').checked;
    const changedProfile = state.resourceProfile !== $('setResource').value;
    state.resourceProfile = $('setResource').value;
    state.profileNeedsRestart = state.profileNeedsRestart || changedProfile;
    state.theme = $('setTheme').value;
    localStorage.setItem('lc.theme', state.theme);
    applyThemeSetting();
    localStorage.setItem('lc.port', state.settings.port);
    localStorage.setItem('lc.apiKey', state.settings.apiKey);
    localStorage.setItem('lc.autoServe', state.settings.autoServe ? '1' : '0');
    localStorage.setItem('lc.resourceProfile', state.resourceProfile);
    toast(changedProfile ? 'Settings saved — next mission restarts the engine with this profile' : 'Settings saved');
  });
  $('btnStopEngine').addEventListener('click', stopEngine);
}

function renderSearchView() {
  let searchRequest = 0;
  $('viewAlt').innerHTML = `<div class="alt-title">Search</div><div class="alt-sub">Search the open project.</div><input id="projSearch" style="background:var(--panel2);border:1px solid var(--border);border-radius:7px;padding:8px 12px;width:420px" placeholder="Search text… (Enter)" /><div id="searchResults" style="margin-top:12px"></div>`;
  $('projSearch').addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    const q = e.target.value.trim().toLowerCase();
    if (!q) return;
    if (!bridge) { toast('Launch the desktop app to search files.'); return; }
    if (!state.projectDir) { $('searchResults').innerHTML = '<div class="alt-sub">Open a project first.</div>'; return; }
    const request = ++searchRequest;
    const project = state.projectDir;
    const output = $('searchResults');
    const stale = () => state.view !== 'search' || state.projectDir !== project || request !== searchRequest || $('searchResults') !== output;
    const hits = [];
    const walk = async (entries) => {
      for (const en of entries) {
        if (hits.length > 40 || stale()) return;
        if (en.dir) await walk(en.children || []);
        else if (/\.(ts|js|json|md|py|yaml|yml|txt|css|html)$/i.test(en.name)) {
          const res = await bridge.projectRead({ file: en.path });
          if (res.ok) res.content.split('\n').forEach((line, i) => { if (line.toLowerCase().includes(q) && hits.length <= 40) hits.push({ path: en.path, line: i + 1, text: line.trim().slice(0, 90) }); });
        }
      }
    };
    if (!state.tree.length) {
      const tree = await bridge.projectTree({ dir: state.projectDir });
      if (stale()) return;
      state.tree = Array.isArray(tree) ? tree : [];
    }
    await walk(state.tree);
    if (stale()) return;
    $('searchResults').innerHTML = hits.length ? hits.map((h) => `<div class="tree-item" data-file="${attr(h.path)}"><span class="dim">${esc(h.path.split(/[\\/]/).pop())}:${h.line}</span> ${esc(h.text)}</div>`).join('') : '<div class="alt-sub">No matches.</div>';
    document.querySelectorAll('#searchResults .tree-item').forEach((el) => el.addEventListener('click', () => openFile(el.dataset.file)));
  });
}

function renderOnboarding() {
  const alt = $('viewAlt');
  const found = state.models.length;
  alt.innerHTML = `<div class="hero">
    <h2>\u2b21 Welcome to Lehrosol Code</h2>
    <div class="alt-sub">${bridge ? 'The LehroSol CLI was not found on this machine, so agent missions are disabled. Your local models were still discovered:' : 'Launch the app with <code>npm start</code> — opening this file directly in a browser has no access to your machine.'}</div>
    ${bridge ? `
    <div class="steps">
      <b>${found}</b> GGUF model(s) found on this PC${found ? ' — see the Vault view (\u25a3)' : ''}.<br>
      <b>1.</b> Install the CLI: <code>npm install -g @lehrosolutions/cli@beta</code><br>
      <b>2.</b> Or point me at it: Settings → “Locate…” → pick <code>bin\\lehrosol.js</code><br>
      <b>3.</b> Then serve a model and start your first mission.
    </div>
    <div class="modal-actions" style="justify-content:flex-start"><button class="btn btn-green" id="obLocate">Locate lehrosol.js…</button><button class="btn btn-dark" id="obVault">View found models</button></div>` : ''}
  </div>`;
  const loc = $('obLocate');
  if (loc) loc.addEventListener('click', () => { switchView('settings'); });
  const v = $('obVault');
  if (v) v.addEventListener('click', () => switchView('vault'));
}

/* ---------------- AI suggestion flow ---------------- */
let suggestionRequest = 0;
async function requestSuggestion() {
  syncEditorDraft();
  const file = currentFile();
  if (!bridge || !(state.info && state.info.cli)) { toast('Connect the LehroSol CLI first'); return; }
  if (!file) { toast('Open a file first (Files view)'); return; }
  if (file.truncated) { toast('Large file preview is read-only; AI rewrite is disabled.'); return; }
  if (!engineUp()) { toast('Engine offline — serve a model first'); return; }
  const originalContent = file.content;
  const originalPath = file.path;
  const request = ++suggestionRequest;
  toast('Asking your local model for an improvement…');
  // Context-aware plan (bridge computes it in the testable layer): local
  // engines reserve max_tokens inside the context window, so the old flat
  // 2048-token ask overflowed the very 2K-context servers the CLI clamps to.
  const plan = bridge.suggestionPlan
    ? await bridge.suggestionPlan({ resourceProfile: state.resourceProfile, fileChars: originalContent.length, reasoning: state.reasoning })
    : { charBudget: 6000, maxTokens: 1024, truncated: originalContent.length > 6000, system: undefined, temperature: 0.2 };
  if (plan.truncated || originalContent.length > plan.charBudget) {
    toast('This file exceeds the safe AI rewrite context. Use a mission for a targeted edit.');
    return;
  }
  const buildPrompt = () => {
    return `Improve this file. Reply with ONLY a fenced code block containing the full improved file, no commentary. File ${originalPath}:\n\n${originalContent}`;
  };
  // Ask the hot engine directly - `loop run` is a scoring harness and never
  // returns model text, so suggestions could not work through it.
  const res = await bridge.chat({ port: enginePort(), apiKey: state.settings.apiKey, model: servedModel(), source: 'desktop-suggestion', prompt: buildPrompt(), system: plan.system, maxTokens: plan.maxTokens, temperature: plan.temperature });
  refreshMetrics();
  syncEditorDraft();
  if (request !== suggestionRequest || currentFile() !== file || file.path !== originalPath || file.content !== originalContent) {
    toast('The file changed while AI was working. Request a fresh suggestion.'); return;
  }
  if (!res.ok) { toast(`Suggestion failed: ${res.error || 'engine unavailable'}`); return; }
  if (res.finishReason === 'length') { toast('AI output was cut short. Nothing was applied; use a targeted mission.'); return; }
  const textOut = (res.ok && res.text) || res.error || '';
  const match = textOut.match(/```[a-z]*\n([\s\S]*?)```/);
  if (!match) { appendPane('outputOut', `\nAI suggestion raw output:\n${textOut.slice(0, 2000)}\n`); toast('No code block returned — raw output in OUTPUT pane'); return; }
  const improved = match[1].replace(/\n$/, '');
  const oldLines = originalContent.split('\n');
  const newLines = improved.split('\n');
  let a = 0;
  while (a < oldLines.length && a < newLines.length && oldLines[a] === newLines[a]) a += 1;
  let bo = oldLines.length - 1; let bn = newLines.length - 1;
  while (bo > a && bn > a && oldLines[bo] === newLines[bn]) { bo -= 1; bn -= 1; }
  renderSuggestion({
    range: `line ${a + 1}-${bo + 1}`,
    tag: '\u26a1 AI Rewrite',
    minus: oldLines.slice(a, bo + 1),
    plus: newLines.slice(a, bn + 1),
    fullNew: improved,
    path: originalPath,
    originalContent,
  });
}
async function applySuggestion() {
  syncEditorDraft();
  const sug = state.suggestion;
  const file = currentFile();
  if (!sug || !file || !sug.fullNew) { renderSuggestion(null); return; }
  if (file.truncated || file.path !== sug.path || file.content !== sug.originalContent) {
    toast('Suggestion is stale. Request a fresh suggestion for this file.'); return;
  }
  const res = await bridge.projectWrite({ file: file.path, content: sug.fullNew, expectedContent: file.savedContent });
  if (!res.ok) { toast(`Write failed: ${res.error}`); return; }
  syncEditorDraft();
  if (file.content === sug.originalContent) file.content = sug.fullNew;
  file.savedContent = sug.fullNew;
  renderEditor();
  timelinePush(`apply \u2192 ${file.path.split(/[\\/]/).pop()}`, 'saved', true);
  toast('\u2713 Applied and saved');
  renderSuggestion(null);
}
function openDiffView() {
  const sug = state.suggestion;
  if (!sug) return;
  switchView('missions');
  const alt = $('viewAlt');
  alt.innerHTML = `<div class="alt-title">Diff View</div><div class="alt-sub">${esc(sug.range)}</div><div style="font-family:var(--mono);font-size:12.5px;border:1px solid var(--border);border-radius:9px;overflow:hidden">${sug.minus.map((l) => `<div class="dl dl-minus">- ${esc(l)}</div>`).join('')}${sug.plus.map((l) => `<div class="dl dl-plus">+ ${esc(l)}</div>`).join('')}</div><div class="modal-actions" style="justify-content:flex-start"><button class="btn btn-green" id="btnApply2">\u2714 Apply</button><button class="btn btn-dark" id="btnBack2">Back to editor</button></div>`;
  $('btnApply2').addEventListener('click', () => { applySuggestion(); switchView('code'); });
  $('btnBack2').addEventListener('click', () => switchView('code'));
}

/* ---------------- command palette ---------------- */
const COMMANDS = [
  { name: 'Output Workspace', hint: 'Ctrl Shift O', run: () => switchView('output') },
  { name: 'Model Usage and Context Windows', hint: 'Ctrl Shift U', run: () => { switchView('usage'); refreshMetrics(); } },
  { name: 'Engine Controls', hint: 'view', run: () => switchView('engine') },
  { name: 'Customize Views and Layout', hint: 'workspace', run: viewsDialog },
  { name: 'Customize Theme, Accent, and Fonts', hint: 'appearance', run: appearanceDialog },
  { name: 'Minimal Workspace', hint: 'Ctrl Shift F', run: () => choosePreset('minimal') },
  { name: 'Code Workspace with Split Output', hint: 'layout', run: () => choosePreset('code') },
  { name: 'Create Workspace', hint: 'layout', run: () => choosePreset('create') },
  { name: 'Debug Workspace', hint: 'layout', run: () => choosePreset('debug') },
  { name: 'Serve a Model (New Agent)', hint: 'vault serve', run: () => newAgentModal() },
  { name: 'Quick Start — best model', hint: 'auto serve', run: quickStart },
  { name: 'Model Test Bench', hint: 'benchmark', run: () => switchView('bench') },
  { name: 'Model Vault', hint: 'view', run: () => switchView('vault') },
  { name: 'Rescan Drives for Models', hint: 'discovery', run: async () => { state.modelsSource = null; await loadModels(); switchView('vault'); } },
  { name: 'Open Project Folder', hint: 'files', run: pickProject },
  { name: 'Stop Engine', hint: 'serve stop', run: stopEngine },
  { name: 'Ping Engine', hint: 'health', run: pingNow },
  { name: 'Run Mission…', hint: 'code', run: () => { closePalette(); $('askInput').focus(); } },
  { name: 'Toggle Terminal', hint: 'panel', run: () => setBottomCollapsed(!$('bottomPanel').classList.contains('collapsed')) },
  { name: 'Mission History', hint: 'journal', run: () => switchView('missions') },
  { name: 'Undo Last Mission', hint: 'rollback', run: undoLastMission },
  { name: 'Toggle Light/Dark Theme', hint: 'theme', run: () => { state.theme = state.theme === 'light' ? 'dark' : 'light'; localStorage.setItem('lc.theme', state.theme); applyThemeSetting(); } },
  { name: 'Keyboard Shortcuts', hint: 'help', run: () => { closePalette(); showShortcuts(); } },
  { name: 'Skills Library', hint: 'view', run: () => switchView('skills') },
  { name: 'Memory (ENGRAM)', hint: 'view', run: () => switchView('memory') },
  { name: 'Settings', hint: 'view', run: () => switchView('settings') },
];
function openPalette() {
  $('palette').classList.remove('hidden');
  $('paletteInput').value = '';
  renderPalette('');
  $('paletteInput').focus();
}
function closePalette() { $('palette').classList.add('hidden'); }
function renderPalette(q) {
  const items = COMMANDS.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));
  $('paletteList').innerHTML = items.map((c, i) => `<div class="pal-item ${i === 0 ? 'sel' : ''}" data-cmd="${attr(c.name)}">${esc(c.name)}<span class="pal-hint">${esc(c.hint)}</span></div>`).join('') || '<div class="pal-item">No matching command</div>';
  document.querySelectorAll('.pal-item[data-cmd]').forEach((el) => el.addEventListener('click', () => runCommand(el.dataset.cmd)));
}
function runCommand(name) {
  const cmd = COMMANDS.find((c) => c.name === name);
  closePalette();
  if (cmd) cmd.run();
}

/* ---------------- new agent modal ---------------- */
async function newAgentModal() {
  if (!bridge || !(state.info && state.info.cli)) { toast('Connect the LehroSol CLI first (Settings).'); switchView('settings'); return; }
  if (!state.models.length) await loadModels();
  const options = state.models.map((m) => `<option>${esc(m.id)}</option>`).join('') || '<option>no models found</option>';
  openModal(`<h3>Serve a local model</h3>
    <div class="settings-row"><label>Model</label><select id="naModel">${options}</select></div>
    <div class="settings-row"><label>Port</label><input id="naPort" value="${attr(state.settings.port)}" /></div>
    <div class="modal-actions"><button class="btn btn-dark" id="naCancel">Cancel</button><button class="btn btn-green" id="naGo">Serve &amp; wire agents</button></div>`);
  $('naCancel').addEventListener('click', closeModal);
  $('naGo').addEventListener('click', () => {
    const port = $('naPort').value.trim();
    if (!validPort(port)) { toast('Port must be a whole number from 1 to 65535.'); return; }
    if (!state.models.length) { toast('Scan the Vault for a model first.'); return; }
    state.settings.port = String(Number(port));
    closeModal();
    serveModel($('naModel').value);
  });
}

/* ---------------- wiring ---------------- */
// Collapse/expand the bottom panel and keep its drag handle in sync so a
// collapsed panel does not leave a floating resize bar behind.
function setBottomCollapsed(collapsed) {
  $('bottomPanel').classList.toggle('collapsed', collapsed);
  const handle = $('resizeBottom');
  if (handle) handle.classList.toggle('hidden', collapsed);
  layout.bottom = !collapsed;
  localStorage.setItem('lc.workspace', JSON.stringify(layout));
}

function switchBottomTab(name) {
  document.querySelectorAll('.btab').forEach((b) => b.classList.toggle('active', b.dataset.btab === name));
  ['terminal', 'problems', 'output', 'debug'].forEach((p) => $(`pane${p[0].toUpperCase()}${p.slice(1)}`).classList.toggle('hidden', p !== name));
  if (name === 'terminal') { ensureTerminal(); $('termInput').focus(); }
}

function initMissionControls() {
  const live = $('missionLive');
  const run = $('missionRun');
  const context = $('missionContext');
  live.checked = localStorage.getItem('lc.missionLive') === '1';
  run.checked = localStorage.getItem('lc.missionRun') === '1';
  context.value = localStorage.getItem('lc.contextMode') || 'normal';
  live.addEventListener('change', () => localStorage.setItem('lc.missionLive', live.checked ? '1' : '0'));
  run.addEventListener('change', () => localStorage.setItem('lc.missionRun', run.checked ? '1' : '0'));
  context.addEventListener('change', () => localStorage.setItem('lc.contextMode', context.value));
}

function initResizablePanels() {
  const root = document.documentElement;
  const restore = (key, variable, fallback) => root.style.setProperty(variable, localStorage.getItem(key) || fallback);
  restore('lc.agentWidth', '--agent-width', '258px');
  restore('lc.rightWidth', '--right-width', '300px');
  restore('lc.bottomHeight', '--bottom-height', '218px');
  const bind = (id, variable, key, valueAt) => {
    const handle = $(id);
    handle.addEventListener('pointerdown', (down) => {
      down.preventDefault();
      handle.classList.add('dragging');
      handle.setPointerCapture(down.pointerId);
      const move = (event) => {
        const value = valueAt(event);
        root.style.setProperty(variable, `${value}px`);
        localStorage.setItem(key, `${value}px`);
      };
      const end = () => { handle.classList.remove('dragging'); handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', end); handle.removeEventListener('pointercancel', end); if (lastGraphData) renderGraph(lastGraphData); };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', end);
      handle.addEventListener('pointercancel', end);
    });
  };
  bind('resizeLeft', '--agent-width', 'lc.agentWidth', (e) => Math.max(170, Math.min(520, e.clientX - 46)));
  bind('resizeRight', '--right-width', 'lc.rightWidth', (e) => Math.max(190, Math.min(520, window.innerWidth - e.clientX)));
  bind('resizeBottom', '--bottom-height', 'lc.bottomHeight', (e) => Math.max(110, Math.min(620, window.innerHeight - e.clientY - 22)));
}

function wire() {
  initWorkbench();
  initMissionControls();
  initResizablePanels();
  document.querySelectorAll('.rail-btn[data-view]').forEach((b) => b.addEventListener('click', () => switchView(b.dataset.view)));
  $('railNewAgent').addEventListener('click', newAgentModal);
  $('railPanel').addEventListener('click', () => setBottomCollapsed(!$('bottomPanel').classList.contains('collapsed')));
  $('railWeb').addEventListener('click', async () => {
    if (!bridge || !(state.info && state.info.cli)) { toast('Web plane needs the CLI connected'); return; }
    // `web start`/`web status` stopped existing as CLI commands — the shared
    // control plane state now ships inside the `tui --json` snapshot this
    // cockpit already polls every 5s. Read it instead of spawning a dead call.
    const web = (state.snapshot || {}).web;
    toast(web ? `Web plane: ${JSON.stringify(web).slice(0, 120)}` : 'Web plane off — start the shared control plane with `lehrosol gui`');
  });

  $('btnNewAgent').addEventListener('click', newAgentModal);
  $('btnAgentFilter').addEventListener('click', () => { $('agentFilterInput').classList.toggle('hidden'); $('agentFilterInput').focus(); });
  $('agentFilterInput').addEventListener('input', renderMissionPanel);
  $('btnViewAllAgents').addEventListener('click', () => switchView('vault'));

  $('projectPill').addEventListener('click', pickProject);
  $('enginePill').addEventListener('click', () => switchView('engine'));
  $('agentsPill').addEventListener('click', () => { if (engineUp()) switchView('engine'); else quickStart(); });
  $('btnTermToggle').addEventListener('click', () => { setBottomCollapsed(false); switchBottomTab('terminal'); });
  $('btnBell').addEventListener('click', () => {
    $('bellBadge').classList.add('hidden');
    openModal(`<h3>Notifications</h3>${state.notifications.length ? state.notifications.map((nt) => `<div class="alt-sub" style="margin-bottom:6px">${esc(nt.at)} — ${esc(nt.msg)}</div>`).join('') : '<div class="alt-sub">Nothing yet. Missions and engine events land here.</div>'}<div class="modal-actions"><button class="btn btn-dark" id="nClose">Close</button></div>`);
    $('nClose').addEventListener('click', closeModal);
  });
  const about = () => {
    openModal(`<h3>Lehrosol Code</h3><div class="alt-sub">v${esc(APP_VERSION)} — the agentic engineering IDE for local models.${state.info && state.info.cliVersion ? ` Paired with the LehroSol CLI v${esc(state.info.cliVersion)}.` : ''}<br><br>A cockpit over the LehroSol CLI: zero-setup model discovery, one-click engines (up), arena model racing, HELIX missions, a model test bench, ENGRAM memory, and a live system graph. Models run on your own drive. Update checks contact GitHub only when requested.</div><div class="modal-actions"><button class="btn btn-dark" id="btnAboutUpdate">Check for updates</button><button class="btn btn-green" id="aClose">Close</button></div>`);
    $('aClose').addEventListener('click', closeModal);
    $('btnAboutUpdate').addEventListener('click', () => window.lehroUpdates?.check());
    const actions = $('modalBox').querySelector('.modal-actions');
    const help = document.createElement('button');
    help.className = 'btn btn-dark'; help.textContent = 'Open help'; help.id = 'btnOpenHelp';
    help.addEventListener('click', async () => { const result = await bridge?.openHelp?.(); if (!result?.ok) toast(result?.error || 'Help requires the desktop app'); });
    actions.prepend(help);
  };
  $('btnHelp').addEventListener('click', about);
  $('btnAvatar').addEventListener('click', about);

  $('searchBox').addEventListener('click', openPalette);
  $('paletteInput').addEventListener('input', (e) => renderPalette(e.target.value));
  $('paletteInput').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePalette();
    if (e.key === 'Enter') { const sel = document.querySelector('.pal-item.sel') || document.querySelector('.pal-item[data-cmd]'); if (sel && sel.dataset.cmd) runCommand(sel.dataset.cmd); }
  });
  $('palette').addEventListener('click', (e) => { if (e.target.id === 'palette') closePalette(); });
  $('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

  document.querySelectorAll('.btab').forEach((b) => b.addEventListener('click', () => switchBottomTab(b.dataset.btab)));
  $('termInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { termSubmit(e.target.value); e.target.value = ''; } });
  $('askInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.value.trim()) { runMission(e.target.value.trim()); e.target.value = ''; renderAskChips(); return; }
    // ArrowUp/ArrowDown recall previous prompts (newest first).
    if (e.key === 'ArrowUp' && state.askHistory.length) {
      e.preventDefault();
      state.askHistIdx = Math.min(state.askHistIdx + 1, state.askHistory.length - 1);
      e.target.value = state.askHistory[state.askHistIdx];
      renderAskChips();
    } else if (e.key === 'ArrowDown' && state.askHistIdx >= 0) {
      e.preventDefault();
      state.askHistIdx -= 1;
      e.target.value = state.askHistIdx >= 0 ? state.askHistory[state.askHistIdx] : '';
      renderAskChips();
    }
  });
  $('askInput').addEventListener('input', renderAskChips);
  $('btnAsk').addEventListener('click', () => { const v = $('askInput').value.trim(); if (v) { runMission(v); $('askInput').value = ''; } });

  $('btnAISuggest').addEventListener('click', requestSuggestion);
  $('btnCloseSuggest').addEventListener('click', () => renderSuggestion(null));
  $('btnApply').addEventListener('click', applySuggestion);
  $('btnReject').addEventListener('click', () => { renderSuggestion(null); toast('Suggestion rejected'); });
  $('btnDiffView').addEventListener('click', openDiffView);

  $('btnEditToggle').addEventListener('click', () => {
    const file = currentFile();
    if (!file) { toast('Open a real file to edit'); return; }
    if (file.truncated) { toast('Large file preview is read-only.'); return; }
    syncEditorDraft();
    state.editing = !state.editing;
    $('editorTextarea').classList.toggle('hidden', !state.editing);
    $('editorPre').classList.toggle('hidden', state.editing);
    if (state.editing) { $('editorTextarea').value = file.content; $('editorTextarea').focus(); }
    else { renderEditor(); renderTabs(); }
  });
  $('editorTextarea').addEventListener('input', () => { syncEditorDraft(); renderTabs(); });
  $('btnSaveFile').addEventListener('click', saveCurrentFile);

  $('btnGraphLive').addEventListener('click', () => {
    state.polling = !state.polling;
    $('graphLiveDot').className = `dot ${state.polling ? 'dot-green' : 'dot-gray'}`;
    toast(state.polling ? 'Live polling on (5s)' : 'Live polling paused');
  });
  $('btnGraphExpand').addEventListener('click', pingNow);
  $('btnTimelineAll').addEventListener('click', () => switchView('missions'));

  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
    if (mod && e.key === '/') { e.preventDefault(); $('askInput').focus(); }
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveCurrentFile(); }
    if (mod && e.key.toLowerCase() === 'j') { e.preventDefault(); setBottomCollapsed(!$('bottomPanel').classList.contains('collapsed')); }
    if (mod && e.key.toLowerCase() === 'm') { e.preventDefault(); switchView('missions'); }
    if (mod && e.key === '.') { e.preventDefault(); showShortcuts(); }
    if (e.key === 'Escape') { closePalette(); closeModal(); }
  });
  window.addEventListener('resize', () => { if (lastGraphData) renderGraph(lastGraphData); }, { passive: true });
  window.addEventListener('beforeunload', (event) => {
    if (hasUnsavedChanges()) { event.preventDefault(); event.returnValue = ''; }
  });
}

async function saveCurrentFile() {
  syncEditorDraft();
  const file = currentFile();
  if (!file || !bridge) return;
  if (file.truncated) { toast('Large file preview is read-only.'); return; }
  const content = file.content;
  const res = await bridge.projectWrite({ file: file.path, content, expectedContent: file.savedContent });
  if (res.ok) file.savedContent = content;
  renderTabs();
  toast(res.ok ? `\u2713 Saved ${file.path.split(/[\\/]/).pop()}` : `Save failed: ${res.error}`);
}

/* ---------------- boot ---------------- */
async function boot() {
  applyThemeSetting();
  wire();
  renderTabs(); renderEditor(); renderTimeline(); renderTopbar(); renderMissionPanel();
  if (!bridge) { switchView('onboarding'); return; }

  // Re-apply a previously located CLI path before probing.
  if (state.settings.cliPath) await bridge.setCliPath(state.settings.cliPath);
  state.info = await bridge.info();
  APP_VERSION = state.info.appVersion || 'unknown';
  setInterval(() => { if (state.polling) refreshLive(); }, 5000);

  // Zero-setup discovery runs regardless of the CLI.
  await loadModels();

  if (!state.info.cli) {
    logEvent('LehroSol CLI not found — missions disabled until connected');
    switchView('onboarding');
    renderTopbar(); renderMissionPanel();
    return;
  }

  appendPane('outputOut', `[lehrosol] live · CLI: ${state.info.cli}\n[lehrosol] ${state.models.length} model(s) · source: ${state.modelsSource}\n`);
  await refreshLive();
  timelinePush('cockpit connected', 'boot', true);
  logEvent(`connected · ${state.models.length} models · engine ${engineUp() ? 'online' : 'offline'}`);

  // Auto-start: resume the last served model so your local AI is just *on*.
  if (state.settings.autoServe && !engineUp() && !state.autoResumeTried) {
    state.autoResumeTried = true;
    const last = servedModel() || (recommendModel() && recommendModel().id);
    if (last) {
      toast(`Auto-starting ${last}…`);
      logEvent(`auto-start ${last}`);
      serveModel(last);
    } else {
      // No known model yet — let the CLI's `up` quick lane discover, rate,
      // and host the best fit (quickStart falls through to it).
      logEvent('auto-start: nothing known locally — asking the CLI (up)');
      quickStart();
    }
  }

}

boot().catch((err) => { toast(`Startup failed: ${err.message}`); logEvent(`startup failed: ${err.message}`); });
