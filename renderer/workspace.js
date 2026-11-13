(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LehroWorkspace = api;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const views = [
    ['output', 'Output', '▤'], ['code', 'Editor', '⌘'], ['files', 'Files', '▱'], ['search', 'Search', '⌕'],
    ['engine', 'Engine', '◈'], ['usage', 'Model usage', '◴'], ['bench', 'Test Bench', '⚖'], ['vault', 'Model Vault', '▣'],
    ['skills', 'Skills', '◇'], ['missions', 'Missions', '▸'], ['memory', 'Memory', '▥'], ['settings', 'Settings', '⚙'],
  ];
  const presets = {
    create: { primary: 'output', split: false, agents: true, graph: false, timeline: true, bottom: false, pins: ['output', 'code', 'files', 'engine', 'vault', 'settings'] },
    code: { primary: 'code', split: true, agents: false, graph: false, timeline: false, bottom: false, pins: ['code', 'output', 'files', 'search', 'engine', 'settings'] },
    debug: { primary: 'output', split: false, agents: true, graph: true, timeline: true, bottom: true, pins: views.map((v) => v[0]) },
    minimal: { primary: 'output', split: false, agents: false, graph: false, timeline: false, bottom: false, pins: ['output', 'code', 'settings'] },
  };
  function normalize(input) {
    const value = input && typeof input === 'object' ? input : {};
    const base = presets.create;
    const result = { version: 1, preset: Object.hasOwn(presets, value.preset) ? value.preset : 'custom' };
    result.primary = views.some((v) => v[0] === value.primary) ? value.primary : base.primary;
    for (const key of ['split', 'agents', 'graph', 'timeline', 'bottom']) result[key] = typeof value[key] === 'boolean' ? value[key] : base[key];
    result.pins = Array.isArray(value.pins) ? [...new Set(value.pins.filter((id) => views.some((v) => v[0] === id)))] : [...base.pins];
    return result;
  }
  const themes = ['dark', 'light', 'midnight', 'graphite'];
  function savedLayouts(input) {
    if (!Array.isArray(input)) return [];
    return input.filter((item) => item && typeof item.name === 'string' && item.name.trim() && item.layout && typeof item.layout === 'object' && !Array.isArray(item.layout))
      .slice(0, 8).map((item) => ({ name: item.name.trim().slice(0, 40), layout: normalize(item.layout) }));
  }
  function appearance(input) {
    const v = input && typeof input === 'object' ? input : {};
    const bound = (n, fallback, min, max) => Number.isFinite(Number(n)) ? Math.min(max, Math.max(min, Number(n))) : fallback;
    return { theme: themes.includes(v.theme) ? v.theme : 'dark', accent: /^#[\da-f]{6}$/i.test(v.accent || '') ? v.accent : '', density: v.density === 'compact' ? 'compact' : 'comfortable', editorFont: bound(v.editorFont, 13, 11, 20), outputFont: bound(v.outputFont, 14, 12, 22) };
  }
  const escape = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function markdown(text) {
    const blocks = String(text || '').slice(0, 64000).split(/(```[^\n]*\n[\s\S]*?(?:```|$))/g);
    const inline = (s) => escape(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    return blocks.map((block) => {
      if (block.startsWith('```')) {
        const end = block.indexOf('\n'); const lang = block.slice(3, end).trim();
        return `<div class="output-code"><span>${escape(lang || 'code')}</span><pre><code>${escape(block.slice(end + 1).replace(/```$/, ''))}</code></pre></div>`;
      }
      return block.split('\n').map((line) => {
        const heading = line.match(/^(#{1,3})\s+(.+)$/);
        if (heading) return `<h${heading[1].length + 1}>${inline(heading[2])}</h${heading[1].length + 1}>`;
        if (/^\s*(?:[-*]|\d+\.)\s/.test(line)) return `<p class="output-list-line">${inline(line)}</p>`;
        return line ? `<p>${inline(line)}</p>` : '<div class="output-break"></div>';
      }).join('');
    }).join('');
  }
  function feed(mission, chunk, flush = false) {
    mission.revision = (mission.revision || 0) + 1;
    mission.raw = ((mission.raw || '') + String(chunk || '')).slice(-256000);
    mission.carry = (mission.carry || '') + String(chunk || '');
    const lines = mission.carry.split('\n'); mission.carry = flush ? '' : lines.pop();
    if (mission.carry.length > 128000) { mission.carry = mission.carry.slice(-128000); mission.truncated = true; }
    mission.activity ||= [];
    for (const line of lines) {
      if (!line.trim()) continue;
      let event;
      try { event = JSON.parse(line); } catch { /* Older CLI output is plain text. */ }
      if (event?.version === 1 && typeof event.type === 'string') {
        mission.structured = true;
        if (event.type === 'start') { mission.model = event.model; mission.journalId = event.missionId; mission.dryRun = event.dryRun; mission.allowRun = event.allowRun; mission.total = event.totalStepBudget; }
        if (event.type === 'result') { mission.result = event; mission.summary = String(event.summary || event.error || event.reason || 'No final answer was returned.'); mission.changedFiles = Array.isArray(event.changedFiles) ? event.changedFiles.filter((v) => typeof v === 'string') : []; }
        if (event.type === 'action') { mission.step = event.step; mission.total = event.total; }
        if (event.type === 'request') { mission.latestUsage = event.usage; mission.requests = (mission.requests || 0) + 1; }
        mission.activity.push(event);
      } else {
        if (event && typeof event.ok === 'boolean') {
          mission.result = event; mission.summary = String(event.summary || event.error || event.reason || '');
          if (Array.isArray(event.changedFiles)) mission.changedFiles = event.changedFiles.filter((v) => typeof v === 'string');
        }
        mission.activity.push({ type: 'log', text: line.slice(0, 8000) });
      }
    }
    if (mission.activity.length > 300) { mission.activity = mission.activity.slice(-300); mission.truncated = true; }
    mission.tail = mission.activity.slice(-6).map((e) => e.label || e.text || (e.type === 'request' ? `Model request ${e.step ?? ''} · ${e.ms ?? '?'} ms` : e.type));
    return mission;
  }
  function contextUsage(prompt, completion, capacity) {
    if (![prompt, completion, capacity].every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0) || capacity === 0) return null;
    return { tokens: prompt + completion, capacity, percent: Math.round((prompt + completion) / capacity * 100), ratio: Math.min(1, (prompt + completion) / capacity) };
  }
  return { views, presets, normalize, savedLayouts, themes, appearance, markdown, feed, contextUsage, escape };
});
