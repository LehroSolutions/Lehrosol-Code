'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const count = (v) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null;

function record(home, model, usage, ms, source = 'desktop-chat') {
  const row = { version: 1, id: randomUUID(), at: new Date().toISOString(), model: String(model || 'local').slice(0, 256), source, promptTokens: count(usage?.prompt_tokens), completionTokens: count(usage?.completion_tokens), ms: Math.max(0, Number(ms) || 0) };
  try {
    const dir = path.join(home, 'usage'); fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, row.at.slice(0, 10) + '.jsonl'), JSON.stringify(row) + '\n', { mode: 0o600 });
    return row;
  } catch { return null; }
}

function read(home, days = 30, now = new Date()) {
  const periodDays = Math.min(30, Math.max(1, Math.floor(Number(days) || 30)));
  const models = new Map(); const seen = new Set();
  let truncated = false; let invalidRows = 0;
  for (let d = periodDays - 1; d >= 0; d--) {
    const date = new Date(now); date.setUTCDate(date.getUTCDate() - d);
    let fd;
    try {
      fd = fs.openSync(path.join(home, 'usage', date.toISOString().slice(0, 10) + '.jsonl'), 'r');
      const size = fs.fstatSync(fd).size;
      const start = Math.max(0, size - 2 * 1024 * 1024); truncated ||= start > 0;
      const buffer = Buffer.alloc(size - start); const length = fs.readSync(fd, buffer, 0, buffer.length, start);
      const lines = buffer.subarray(0, length).toString('utf8').split('\n'); if (start) lines.shift();
      for (const line of lines) {
        if (!line) continue;
        let row; try { row = JSON.parse(line); } catch { invalidRows++; continue; }
        if (!row || row.version !== 1 || typeof row.id !== 'string' || typeof row.model !== 'string' || !row.model || typeof row.at !== 'string') { invalidRows++; continue; }
        if (seen.has(row.id)) continue; seen.add(row.id);
        const m = models.get(row.model) || { model: row.model, requests: 0, promptTokens: 0, completionTokens: 0, unmeasuredRequests: 0, ms: 0, last: null, sources: [] };
        m.requests++; m.promptTokens += count(row.promptTokens) || 0; m.completionTokens += count(row.completionTokens) || 0;
        if (count(row.promptTokens) === null || count(row.completionTokens) === null) m.unmeasuredRequests++;
        m.ms += Math.max(0, Number(row.ms) || 0); m.last = row;
        if (!m.sources.includes(row.source)) m.sources.push(row.source);
        models.set(row.model, m);
      }
    } catch (err) { if (err.code !== 'ENOENT') invalidRows++; }
    finally { if (fd !== undefined) fs.closeSync(fd); }
  }
  return { ok: true, version: 1, periodDays, truncated, invalidRows, models: [...models.values()].sort((a, b) => b.requests - a.requests) };
}
module.exports = { record, read };
