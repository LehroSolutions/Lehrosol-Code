'use strict';
const workspace = window.LehroWorkspace;
function savedJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') || fallback; } catch { return fallback; }
}
let layout = workspace.normalize(savedJson('lc.workspace', { ...workspace.presets.create, preset: 'create' }));
let appearance = workspace.appearance(savedJson('lc.appearance', { theme: localStorage.getItem('lc.theme') || 'dark' }));
let outputSelection = null;
let outputMode = 'answer';
let outputFollow = true;
let outputRenderTimer = null;
let usageData = { models: [], periodDays: 30 };
let engineMetadata = null;
let metricsBusy = null;
let engineBusy = false;
let engineFailure = '';
let engineSelection = null;

function applyAppearance() {
  document.body.dataset.theme = appearance.theme;
  document.body.dataset.density = appearance.density;
  document.body.classList.toggle('light', appearance.theme === 'light');
  const style = document.documentElement.style;
  style.setProperty('--editor-font', `${appearance.editorFont}px`);
  style.setProperty('--output-font', `${appearance.outputFont}px`);
  style.setProperty('--accent', appearance.accent || (appearance.theme === 'light' ? '#157a42' : '#35d07a'));
  localStorage.setItem('lc.appearance', JSON.stringify(appearance));
  state.theme = appearance.theme;
  localStorage.setItem('lc.theme', state.theme);
}

function applyLayout(save = true, navigate = false) {
  layout = workspace.normalize(layout);
  $('agentPanel').classList.toggle('hidden', !layout.agents);
  $('resizeLeft').classList.toggle('hidden', !layout.agents);
  $('graphPanel').classList.toggle('hidden', !layout.graph);
  $('timelinePanel').classList.toggle('hidden', !layout.timeline);
  $('rightCol').classList.toggle('hidden', !layout.graph && !layout.timeline);
  $('resizeRight').classList.toggle('hidden', !layout.graph && !layout.timeline);
  document.querySelectorAll('.rail-btn[data-view]').forEach((b) => b.classList.toggle('hidden', !layout.pins.includes(b.dataset.view)));
  $('mainViews').classList.toggle('split-output', layout.split && state.view === 'code');
  $('viewOutput').classList.toggle('hidden', state.view !== 'output' && !(layout.split && state.view === 'code'));
  $('btnSplitOutput').setAttribute('aria-pressed', String(layout.split));
  $('workspacePreset').value = layout.preset;
  $('footerLayout').textContent = layout.preset === 'custom' ? 'Custom layout' : `${layout.preset[0].toUpperCase()}${layout.preset.slice(1)}`;
  if (save) localStorage.setItem('lc.workspace', JSON.stringify(layout));
  if (navigate) switchView(layout.primary);
  renderFooter();
}

function choosePreset(name) {
  if (!Object.hasOwn(workspace.presets, name)) return;
  layout = workspace.normalize({ ...workspace.presets[name], preset: name });
  setBottomCollapsed(!layout.bottom);
  applyLayout(true, true);
}

function afterViewChange(view) {
  if (workspace.views.some((v) => v[0] === view)) { layout.primary = view; localStorage.setItem('lc.workspace', JSON.stringify(layout)); }
  $('viewOutput').classList.toggle('hidden', view !== 'output' && !(view === 'code' && layout.split));
  $('mainViews').classList.toggle('split-output', view === 'code' && layout.split);
  $('btnWorkspaceEditor').setAttribute('aria-pressed', String(view === 'code'));
  $('btnWorkspaceOutput').setAttribute('aria-pressed', String(view === 'output'));
  if (view === 'output') renderOutput();
  if (view === 'engine') renderEngineView();
  if (view === 'usage') renderUsageView();
}

function selectedOutput() { return state.missions.find((m) => m.id === outputSelection) || state.missions[0] || null; }
function showMissionOutput(id) { outputSelection = id; switchView('output'); renderOutput(); }
function scheduleOutputRender() {
  if (outputRenderTimer !== null) return;
  outputRenderTimer = setTimeout(() => { outputRenderTimer = null; renderOutput(); renderFooter(); }, 80);
}

function renderOutput() {
  const mission = selectedOutput();
  const selector = $('outputRun');
  const signature = state.missions.map((m) => `${m.id}:${m.status}`).join('|');
  if (selector.dataset.signature !== signature) {
    selector.innerHTML = state.missions.map((m) => `<option value="${attr(m.id)}">${esc(m.prompt.slice(0, 56))} · ${esc(m.status)}</option>`).join('') || '<option>No missions yet</option>';
    selector.dataset.signature = signature;
  }
  if (mission) selector.value = mission.id;
  $('outputTitle').textContent = mission ? mission.prompt : 'Make room for your next idea.';
  $('outputMeta').textContent = mission ? `${mission.status} · ${mission.model || 'local model'} · ${mission.dryRun ? 'preview writes' : 'live writes'}${mission.step ? ` · step ${mission.step}/${mission.total || '?'}` : ''}${mission.ms !== null ? ` · ${(mission.ms / 1000).toFixed(1)}s` : ''}` : 'A full-size workspace for local-model answers, code, and evidence.';
  $('outputCancel').disabled = !mission || mission.status !== 'running';
  $('outputCopy').disabled = !mission;
  $('outputReport').disabled = !mission;
  $('outputRetry').disabled = !mission || mission.status === 'running';
  const q = $('outputSearch').value.toLowerCase();
  const filter = $('outputFilter').value || 'all';
  const events = (mission?.activity || []).filter((e) => (filter !== 'errors' || e.ok === false || /error|failed|refused/i.test(e.text || '')) && (filter !== 'tools' || e.type === 'action') && (!q || JSON.stringify(e).toLowerCase().includes(q)));
  const body = $('outputBody'); const scrollTop = body.scrollTop;
  const stamp = JSON.stringify([mission?.id, mission?.revision, mission?.summary, mission?.status, q, filter, outputMode]);
  if (body.dataset.stamp !== stamp) {
    body.dataset.stamp = stamp;
    if (!mission) {
      body.innerHTML = '<div class="output-empty"><span class="output-mark">▤</span><h2>Create with the models you own.</h2><p>Open a project, start an engine, and describe what you want to build. Answers stay readable here while you inspect the code alongside them.</p><div class="output-empty-steps"><span>01 &nbsp; Open a project</span><span>02 &nbsp; Start a local model</span><span>03 &nbsp; Give it a goal</span></div></div>';
    } else if (outputMode === 'raw') {
      const raw = q ? (mission.raw || '').split('\n').filter((l) => l.toLowerCase().includes(q)).join('\n') : mission.raw;
      body.innerHTML = `<pre class="output-raw">${esc(raw || 'Waiting for the CLI…')}</pre>`;
    } else if (outputMode === 'inspect') {
      const details = { model: mission.model, project: mission.project, journalId: mission.journalId, dryRun: mission.dryRun, allowRun: mission.allowRun, contextMode: mission.contextMode, requests: mission.requests, latestProviderUsage: mission.latestUsage, result: mission.result };
      body.innerHTML = `<h2>Mission inspector</h2><p class="dim">Provider counts describe the last request, not cumulative context occupancy.</p><pre class="output-raw">${esc(JSON.stringify(details, null, 2))}</pre>`;
    } else if (outputMode === 'answer' && mission.summary && !q && filter === 'all') {
      body.innerHTML = `<article class="output-answer">${workspace.markdown(mission.summary)}</article>${mission.result?.continuationAvailable ? '<p class="output-warning">The CLI stopped at its step budget. Retry this goal to continue from the project state.</p>' : ''}`;
    } else {
      body.innerHTML = (mission.status === 'running' && outputMode === 'answer' ? '<p class="output-working">Working on your project. The final answer will appear here.</p>' : '') + events.map((e) => `<details class="output-event ${e.ok === false ? 'event-error' : ''}"><summary><span class="event-kind">${esc(e.type === 'action' ? e.action : e.type)}</span><span>${esc(e.label || e.text || (e.type === 'request' ? `Request ${e.step ?? ''} · ${e.usage?.prompt_tokens ?? '?'} input / ${e.usage?.completion_tokens ?? '?'} output tokens` : e.type === 'start' ? e.task : e.type === 'result' ? (e.ok ? 'Mission completed' : 'Mission stopped') : e.type))}</span><small>${e.ms ? `${(e.ms / 1000).toFixed(1)}s` : ''}</small></summary><pre>${esc(e.observation || e.text || JSON.stringify(e, null, 2))}</pre></details>`).join('') || '<p class="dim">No matching activity.</p>';
    }
    if (mission?.truncated || (mission?.raw?.length || 0) >= 256000) body.innerHTML += '<p class="output-warning">This view retains the latest 300 events and 256,000 log characters.</p>';
    body.scrollTop = outputFollow ? body.scrollHeight : scrollTop;
  }
  $('outputFiles').innerHTML = (mission?.changedFiles || []).slice(0, 60).map((file) => `<button class="file-chip" data-output-file="${attr(file)}" title="${attr(file)}">${esc(file.split(/[\\/]/).pop())}</button>`).join('');
  document.querySelectorAll('[data-output-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.outputMode === outputMode)));
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied to clipboard'); } catch { toast('Clipboard unavailable. Select and copy the displayed text.'); }
}
function outputReport() {
  const m = selectedOutput(); if (!m) return '';
  return `# ${m.prompt}\n\nModel: ${m.model || 'local'}\nStatus: ${m.status}\nProject: ${m.project || ''}\nWrites: ${m.dryRun ? 'preview' : 'live'}\nCommands: ${m.allowRun ? 'enabled' : 'disabled'}\n\n${m.summary || 'No final answer.'}\n\nChanged files:\n${(m.changedFiles || []).map((f) => '- ' + f).join('\n') || '(none recorded)'}\n\n## Activity\n\n${(m.activity || []).map((e) => e.label || e.text || e.type).join('\n')}`;
}

function activeContext() {
  if (!engineUp()) return null;
  const live = engineMetadata?.contextWindow;
  if (live) return { size: live, source: 'Engine properties' };
  const launch = state.serve?.serve;
  if (Number(launch?.port) === Number(enginePort()) && Number(launch?.ctxSize) > 0) return { size: Number(launch.ctxSize), source: 'Configured at launch' };
  return null;
}
function usageModel(id) {
  return usageData.models.find((m) => m.model === id) || usageData.models.find((m) => modelById(m.model)?.id === id);
}
function renderFooter() {
  if (!$('footerUsage')) return;
  const up = engineUp();
  const running = state.missions.filter((m) => m.status === 'running').length;
  $('footerEngine').textContent = `${engineBusy ? '◈ Starting…' : up ? '● Engine online' : '○ Engine offline'}`;
  $('footerMission').textContent = running ? `${running} mission${running > 1 ? 's' : ''} running` : 'Missions ready';
  const active = usageModel(servedModel());
  const ctx = activeContext();
  const tokens = active ? active.promptTokens + active.completionTokens : 0;
  $('footerUsageText').textContent = `${tokens.toLocaleString()} tok${active?.unmeasuredRequests ? ' + unknown' : ''}${ctx ? ` · ${ctx.size.toLocaleString()} ctx` : ''}`;
  $('footerUsage').title = 'Model usage: measured request totals and context capacity. Open to inspect each model.';
}

function refreshMetrics() {
  if (!bridge || metricsBusy) return metricsBusy || Promise.resolve();
  metricsBusy = (async () => {
    const [usage, metadata] = await Promise.allSettled([
      bridge.usage ? bridge.usage(30) : Promise.resolve({ models: [] }),
      engineUp() && bridge.engineDetails ? bridge.engineDetails({ port: enginePort(), apiKey: state.settings.apiKey }) : Promise.resolve(null),
    ]);
    if (usage.status === 'fulfilled' && usage.value?.models) usageData = usage.value;
    engineMetadata = metadata.status === 'fulfilled' && metadata.value?.ok ? metadata.value : null;
    renderFooter();
    if (state.view === 'usage') renderUsageView();
    if (state.view === 'engine') renderEngineView();
  })().finally(() => { metricsBusy = null; });
  return metricsBusy;
}

function renderUsageView() {
  const ids = [...new Set([...state.models.map((m) => m.id), ...usageData.models.map((m) => modelById(m.model)?.id || m.model), ...(servedModel() ? [modelById(servedModel())?.id || servedModel()] : [])])];
  $('viewAlt').innerHTML = `<div class="view-heading"><div><div class="eyebrow">LOCAL INFERENCE</div><h1>Model usage</h1><p class="alt-sub">Last ${usageData.periodDays || 30} UTC days · input and output counts reported by your engine.</p></div><button class="btn btn-dark" id="usageRefresh">Refresh</button></div>
    <p class="usage-note">Totals cover instrumented CLI chats, coding missions, HTTP adapters, and desktop requests. Other applications are outside this ledger. Context is the capacity of one request; cumulative tokens do not fill it.</p>
    ${usageData.truncated || usageData.invalidRows ? `<p class="output-warning">${usageData.truncated ? 'Partial totals: reads retain the most recent 2 MiB per day. ' : ''}${usageData.invalidRows ? `${usageData.invalidRows} incomplete or invalid rows were skipped.` : ''}</p>` : ''}
    <div class="table-scroll"><table class="usage-table"><thead><tr><th>Model</th><th>Requests</th><th>Input</th><th>Output</th><th>Context window</th></tr></thead><tbody>${ids.map((id) => {
      const row = usageModel(id); const model = modelById(id); const isActive = engineHasModel(id) && engineUp();
      const capacity = isActive ? activeContext() : null;
      const native = model?.contextWindow;
      const last = row?.last;
      const pressure = capacity && last ? workspace.contextUsage(last.promptTokens, last.completionTokens, capacity.size) : null;
      return `<tr><td><strong>${esc(id)}</strong>${isActive ? '<span class="tag tag-green">active</span>' : ''}<small>${row?.unmeasuredRequests ? `${row.unmeasuredRequests} request(s) with unknown counts` : row?.sources.map(esc).join(', ') || 'No recorded requests'}</small></td><td>${row?.requests || 0}</td><td>${row ? row.promptTokens.toLocaleString() : '—'}</td><td>${row ? row.completionTokens.toLocaleString() : '—'}</td><td>${capacity ? `<strong>${capacity.size.toLocaleString()} active</strong><small>${esc(capacity.source)}</small>` : ''}${native ? `<small>${Number(native).toLocaleString()} native (GGUF)</small>` : !capacity ? '<small>Unknown — metadata unavailable</small>' : ''}${pressure ? `<progress max="100" value="${Math.min(100, pressure.percent)}" aria-label="Last request used ${pressure.percent}% of active context"></progress><small>Last request: ${pressure.tokens.toLocaleString()} tokens · ${pressure.percent}%</small>` : ''}</td></tr>`;
    }).join('') || '<tr><td colspan="5">No models discovered yet. Scan a folder in the Model Vault.</td></tr>'}</tbody></table></div>
    <p class="usage-note">Stored locally in <code>${esc(state.info?.home || '~/.lehro')}/usage/YYYY-MM-DD.jsonl</code>. This ledger stores model identifiers, timestamps, counts, and timing; it excludes prompts and answers.</p>`;
  $('usageRefresh').addEventListener('click', refreshMetrics);
}

function renderEngineView() {
  if (!state.models.some((model) => model.id === engineSelection)) engineSelection = state.models.find((model) => engineHasModel(model.id))?.id || state.models[0]?.id || '';
  const up = engineUp(); const active = state.serve?.serve || {}; const ctx = activeContext();
  const running = state.missions.some((m) => m.status === 'running');
  const row = usageModel(servedModel());
  $('viewAlt').innerHTML = `<div class="view-heading"><div><div class="eyebrow">YOUR HARDWARE. YOUR MODELS.</div><h1>Engine</h1><p class="alt-sub">Choose a model, keep room for context, and inspect the inference behind each mission.</p></div><span class="engine-state"><span class="dot ${up ? 'dot-green' : 'dot-gray'}"></span>${engineBusy ? 'Starting' : up ? 'Online' : 'Offline'}</span></div>
    <div class="engine-console"><label for="engineModel">Local model</label><select id="engineModel">${state.models.map((m) => `<option value="${attr(m.id)}" ${m.id === engineSelection ? 'selected' : ''}>${esc(m.id)} · ${esc(m.fit || 'unrated')} ${esc(m.sizeLabel)}</option>`).join('') || '<option value="">Scan the Model Vault first</option>'}</select><div class="engine-actions"><button class="btn btn-green" id="engineServe" ${engineBusy || running ? 'disabled' : ''}>${up ? 'Serve selected model' : 'Start engine'}</button><button class="btn btn-dark" id="engineStop" ${!up || engineBusy || running ? 'disabled' : ''}>Stop</button><button class="btn btn-dark" id="enginePing">Check health</button><button class="btn btn-dark" id="engineVault">Model Vault</button><button class="btn btn-dark" id="engineBench">Test Bench</button></div>${running ? '<p class="usage-note">Model switching is available after the current mission finishes or is cancelled.</p>' : ''}${engineFailure ? `<p class="output-warning">${esc(engineFailure)}</p>` : ''}</div>
    <div class="engine-facts"><div><span>Active model</span><strong>${esc(up ? servedModel() || state.ping?.models?.[0] || 'local' : 'None')}</strong></div><div><span>Endpoint</span><strong>127.0.0.1:${enginePort()}</strong><small>${up ? `${state.ping?.ms ?? '?'} ms health latency` : 'Not responding'}</small></div><div><span>Active context</span><strong>${ctx ? ctx.size.toLocaleString() + ' tokens' : 'Unknown'}</strong><small>${ctx ? ctx.source : 'Engine metadata unavailable'}</small></div><div><span>RAM available to the machine</span><strong>${state.info?.totalGB || '?'} GB total</strong><small>${esc(state.resourceProfile)} resource profile</small></div><div><span>Process</span><strong>${active.pid && up ? `PID ${active.pid}` : 'Untracked'}</strong><small>${esc(active.engine || 'OpenAI-compatible engine')}</small></div><div><span>Measured usage</span><strong>${row ? (row.promptTokens + row.completionTokens).toLocaleString() + ' tokens' : 'No counts yet'}</strong><small>${row?.requests || 0} instrumented request(s)</small></div></div>
    <div class="engine-tuning"><h2>Mission tuning</h2><p class="alt-sub">Eco preserves memory. Balanced suits everyday work. Performance reserves a larger context when hardware permits. The CLI keeps completion headroom and shrinks observations after context overflow.</p><label for="engineProfile">Resource profile</label><select id="engineProfile"><option value="eco" ${state.resourceProfile === 'eco' ? 'selected' : ''}>Eco</option><option value="balanced" ${state.resourceProfile === 'balanced' ? 'selected' : ''}>Balanced</option><option value="performance" ${state.resourceProfile === 'performance' ? 'selected' : ''}>Performance</option></select><p class="usage-note">Profile changes apply on the next mission restart. Native model context can be much larger than the context safe to allocate on this machine.</p><button class="btn btn-dark" id="engineUsage">Inspect each model’s usage</button><button class="btn btn-dark" id="engineSettings">Connection settings</button></div>`;
  $('engineServe').addEventListener('click', () => $('engineModel').value ? serveModel($('engineModel').value) : quickStart());
  $('engineStop').addEventListener('click', stopEngine);
  $('engineModel').addEventListener('change', () => { engineSelection = $('engineModel').value; });
  $('enginePing').addEventListener('click', pingNow);
  $('engineVault').addEventListener('click', () => switchView('vault'));
  $('engineBench').addEventListener('click', () => switchView('bench'));
  $('engineUsage').addEventListener('click', () => switchView('usage'));
  $('engineSettings').addEventListener('click', () => switchView('settings'));
  $('engineProfile').addEventListener('change', () => { state.resourceProfile = $('engineProfile').value; state.profileNeedsRestart = true; localStorage.setItem('lc.resourceProfile', state.resourceProfile); toast('Profile saved — applies on the next mission restart'); });
}

function viewsDialog() {
  const saved = workspace.savedLayouts(savedJson('lc.savedLayouts', []));
  openModal(`<h3>Make this workspace yours</h3><p class="alt-sub">Hide what you do not need. Every view remains available from this menu and the command palette.</p><div class="view-picker">${workspace.views.map(([id, label]) => `<div><button class="btn-ghost" data-open-view="${id}">${label}</button><label><input type="checkbox" data-pin-view="${id}" ${layout.pins.includes(id) ? 'checked' : ''}> Pin</label></div>`).join('')}</div><h4>Panels</h4><div class="panel-options">${[['agents', 'Agent Stream'], ['graph', 'System Graph'], ['timeline', 'Execution Timeline'], ['bottom', 'Terminal and logs'], ['split', 'Output beside editor']].map(([key, title]) => `<label><input type="checkbox" data-layout-panel="${key}" ${layout[key] ? 'checked' : ''}> ${title}</label>`).join('')}</div><div class="settings-row"><label for="layoutName">Save layout</label><input id="layoutName" maxlength="40" placeholder="e.g. Review and build"><button class="btn btn-dark" id="layoutSave">Save</button></div><div class="saved-layouts">${Array.isArray(saved) ? saved.slice(0, 8).map((item, i) => `<button class="btn btn-dark" data-load-layout="${i}">${esc(item.name)}</button>`).join('') : ''}</div><div class="modal-actions"><button class="btn btn-dark" id="layoutReset">Restore Create</button><button class="btn btn-dark" id="preferencesShare">Import / export</button><button class="btn btn-green" id="viewsClose">Done</button></div>`);
  document.querySelectorAll('[data-open-view]').forEach((b) => b.addEventListener('click', () => { closeModal(); switchView(b.dataset.openView); }));
  document.querySelectorAll('[data-pin-view]').forEach((input) => input.addEventListener('change', () => { layout.pins = input.checked ? [...layout.pins, input.dataset.pinView] : layout.pins.filter((id) => id !== input.dataset.pinView); layout.preset = 'custom'; applyLayout(); }));
  document.querySelectorAll('[data-layout-panel]').forEach((input) => input.addEventListener('change', () => { layout[input.dataset.layoutPanel] = input.checked; layout.preset = 'custom'; if (input.dataset.layoutPanel === 'bottom') setBottomCollapsed(!input.checked); applyLayout(); }));
  $('viewsClose').addEventListener('click', closeModal);
  $('layoutReset').addEventListener('click', () => { closeModal(); choosePreset('create'); });
  $('preferencesShare').addEventListener('click', preferencesDialog);
  $('layoutSave').addEventListener('click', () => {
    const name = $('layoutName').value.trim(); if (!name) { toast('Give this layout a name'); return; }
    const entries = Array.isArray(saved) ? saved : [];
    localStorage.setItem('lc.savedLayouts', JSON.stringify([{ name, layout }, ...entries.filter((v) => v.name !== name)].slice(0, 8)));
    viewsDialog(); toast('Layout saved');
  });
  document.querySelectorAll('[data-load-layout]').forEach((b) => b.addEventListener('click', () => { const item = saved[Number(b.dataset.loadLayout)]; if (!item) return; layout = workspace.normalize(item.layout); closeModal(); setBottomCollapsed(!layout.bottom); applyLayout(true, true); }));
}

function preferencesDialog() {
  const value = JSON.stringify({ version: 1, layout, appearance }, null, 2);
  openModal(`<h3>Share your workspace setup</h3><p class="alt-sub">Layouts and appearance only. Connection keys, prompts, and project paths are excluded.</p><textarea id="preferencesJson" rows="13" spellcheck="false" aria-label="Workspace preferences JSON">${esc(value)}</textarea><div class="modal-actions"><button class="btn btn-dark" id="preferencesCopy">Copy JSON</button><button class="btn btn-green" id="preferencesImport">Import JSON</button><button class="btn btn-dark" id="preferencesClose">Close</button></div>`);
  $('preferencesCopy').addEventListener('click', () => copyText($('preferencesJson').value));
  $('preferencesClose').addEventListener('click', closeModal);
  $('preferencesImport').addEventListener('click', () => {
    try {
      const raw = $('preferencesJson').value; if (raw.length > 16000) throw new Error('Setup exceeds 16 KB');
      const data = JSON.parse(raw); if (data.version !== 1 || !data.layout || !data.appearance) throw new Error('Expected workspace setup version 1');
      layout = workspace.normalize(data.layout); appearance = workspace.appearance(data.appearance);
      applyAppearance(); setBottomCollapsed(!layout.bottom); applyLayout(true, true); closeModal(); toast('Workspace setup imported');
    } catch (err) { toast(`Invalid setup: ${err.message}`); }
  });
}

function appearanceDialog() {
  openModal(`<h3>Appearance</h3><p class="alt-sub">Tune the workspace for long sessions. Changes apply immediately.</p><div class="settings-row"><label for="appearanceTheme">Theme</label><select id="appearanceTheme">${workspace.themes.map((t) => `<option value="${t}" ${appearance.theme === t ? 'selected' : ''}>${t[0].toUpperCase() + t.slice(1)}</option>`).join('')}</select></div><div class="settings-row"><label for="appearanceAccent">Accent</label><input type="color" id="appearanceAccent" value="${attr(appearance.accent || (appearance.theme === 'light' ? '#157a42' : '#35d07a'))}"><button class="btn btn-dark" id="appearanceReset">Theme default</button></div><div class="settings-row"><label for="appearanceDensity">Density</label><select id="appearanceDensity"><option value="comfortable" ${appearance.density === 'comfortable' ? 'selected' : ''}>Comfortable</option><option value="compact" ${appearance.density === 'compact' ? 'selected' : ''}>Compact</option></select></div><div class="settings-row"><label for="appearanceEditor">Editor font</label><input type="range" id="appearanceEditor" min="11" max="20" value="${appearance.editorFont}"><output id="appearanceEditorValue">${appearance.editorFont}px</output></div><div class="settings-row"><label for="appearanceOutput">Output font</label><input type="range" id="appearanceOutput" min="12" max="22" value="${appearance.outputFont}"><output id="appearanceOutputValue">${appearance.outputFont}px</output></div><div class="modal-actions"><button class="btn btn-green" id="appearanceClose">Done</button></div>`);
  for (const [id, key] of [['appearanceTheme', 'theme'], ['appearanceAccent', 'accent'], ['appearanceDensity', 'density'], ['appearanceEditor', 'editorFont'], ['appearanceOutput', 'outputFont']]) {
    $(id).addEventListener('input', () => { appearance[key] = $(id).value; appearance = workspace.appearance(appearance); applyAppearance(); if (key.endsWith('Font')) $(id + 'Value').textContent = $(id).value + 'px'; });
  }
  $('appearanceReset').addEventListener('click', () => { appearance.accent = ''; applyAppearance(); appearanceDialog(); });
  $('appearanceClose').addEventListener('click', closeModal);
}

function initWorkbench() {
  $('workspacePreset').addEventListener('change', (e) => choosePreset(e.target.value));
  $('btnWorkspaceEditor').addEventListener('click', () => switchView('code'));
  $('btnWorkspaceOutput').addEventListener('click', () => switchView('output'));
  $('btnSplitOutput').addEventListener('click', () => { layout.split = !layout.split; layout.preset = 'custom'; applyLayout(); switchView('code'); });
  $('btnViews').addEventListener('click', viewsDialog);
  $('footerLayout').addEventListener('click', viewsDialog);
  $('footerTheme').addEventListener('click', appearanceDialog);
  $('footerUsage').addEventListener('click', () => { switchView('usage'); refreshMetrics(); });
  $('footerEngine').addEventListener('click', () => switchView('engine'));
  $('footerMission').addEventListener('click', () => switchView('missions'));
  $('btnOutputExpand').addEventListener('click', () => switchView('output'));
  $('outputRun').addEventListener('change', () => { outputSelection = $('outputRun').value; renderOutput(); });
  document.querySelectorAll('[data-output-mode]').forEach((b) => b.addEventListener('click', () => { outputMode = b.dataset.outputMode; renderOutput(); }));
  $('outputSearch').addEventListener('input', renderOutput); $('outputFilter').addEventListener('change', renderOutput);
  $('outputFollow').addEventListener('change', () => { outputFollow = $('outputFollow').checked; if (outputFollow) $('outputBody').scrollTop = $('outputBody').scrollHeight; });
  $('outputBody').addEventListener('scroll', () => { const el = $('outputBody'); if (outputFollow && el.scrollHeight - el.scrollTop - el.clientHeight > 80) { outputFollow = false; $('outputFollow').checked = false; } });
  $('outputCancel').addEventListener('click', () => { const m = selectedOutput(); if (m) cancelMission(m.id); });
  $('outputCopy').addEventListener('click', () => { const m = selectedOutput(); if (m) copyText(m.summary || m.raw || ''); });
  $('outputReport').addEventListener('click', () => copyText(outputReport()));
  $('outputRetry').addEventListener('click', () => { const m = selectedOutput(); if (!m) return; if (m.project !== state.projectDir) { toast('Open the original project before retrying this mission.'); return; } runMission(m.prompt); });
  $('outputFiles').addEventListener('click', (e) => { const file = e.target.closest('[data-output-file]'); const m = selectedOutput(); if (file && m?.project === state.projectDir) openFile(/^(?:[A-Za-z]:[\\/]|\/)/.test(file.dataset.outputFile) ? file.dataset.outputFile : `${state.projectDir}/${file.dataset.outputFile}`); });
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || !e.shiftKey) return;
    if (e.key.toLowerCase() === 'o') { e.preventDefault(); switchView('output'); }
    if (e.key.toLowerCase() === 'u') { e.preventDefault(); switchView('usage'); }
    if (e.key.toLowerCase() === 'f') { e.preventDefault(); choosePreset(layout.preset === 'minimal' ? 'create' : 'minimal'); }
  });
  applyAppearance();
  setBottomCollapsed(!layout.bottom);
  applyLayout(false, true);
  renderOutput();
}
