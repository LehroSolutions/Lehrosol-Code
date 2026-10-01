'use strict';
// Lehrosol Code — path confinement for the project:* IPC surface. Roots are
// registered ONLY by project:pick, which goes through a native directory
// dialog, so the renderer can never widen its own blast radius by asking.
// Every candidate path is resolved to absolute and must land inside a root
// twice: lexically, and again after symlink resolution. Symlink policy is
// allow-if-inside, deny-if-escapes — a link that stays in the project is fine
// (node_modules, junctions, pnpm store links), one that leaves it is not.
const path = require('node:path');
const fs = require('node:fs');

const roots = new Set();

// Windows paths are case-insensitive; lowercasing keeps a root picked as
// C:\Src\Proj matching a path the CLI later reports as c:\src\proj.
function norm(p) {
  const s = path.resolve(String(p));
  return process.platform === 'win32' ? s.toLowerCase() : s;
}

// A path that does not exist yet has no realpath, and project:write must be
// able to create files — so fall back to the real parent directory. Returns
// null only when neither the entry nor its parent can be resolved.
function realpathish(p) {
  try { return fs.realpathSync(p); } catch { /* not created yet */ }
  try { return path.join(fs.realpathSync(path.dirname(p)), path.basename(p)); } catch { return null; }
}

function addRoot(dir) {
  const abs = path.resolve(String(dir));
  roots.add(norm(abs));
  const real = realpathish(abs);
  if (real) roots.add(norm(real));
  return abs;
}

function listRoots() { return [...roots]; }

function reset() { roots.clear(); }

function within(root, target) {
  if (root === target) return true;
  const rel = path.relative(root, target);
  return rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel);
}

function resolveInside(input) {
  if (roots.size === 0) {
    return { ok: false, error: 'No project folder is open — use "Open Project Folder" first.' };
  }
  const abs = path.resolve(String(input == null ? '' : input));
  const real = realpathish(abs);
  const symlinked = Boolean(real) && norm(real) !== norm(abs);
  for (const root of roots) {
    if (within(root, norm(abs)) && (!real || within(root, norm(real)))) {
      if (symlinked) console.warn(`[confinement] symlink kept inside project: ${abs} -> ${real}`);
      return { ok: true, path: real || abs, symlinked };
    }
  }
  return { ok: false, error: `Path is outside the open project folder: ${abs}` };
}

module.exports = { addRoot, listRoots, reset, resolveInside, within };
