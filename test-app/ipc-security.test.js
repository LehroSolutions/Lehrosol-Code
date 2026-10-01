'use strict';
// Lehrosol Code — IPC security regressions. main.js cannot be required without
// a live Electron app, so the invariant it depends on — a renderer-supplied
// path is usable only if it lands inside a folder the user picked in a native
// dialog — lives in the dependency-free electron/pathConfinement.js module and
// is unit-tested here. These tests must pass on both the windows and ubuntu
// CI legs, so every POSIX-vs-Windows assumption is branched on explicitly.
const test = require('node:test');
const assert = require('node:assert');
const { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, realpathSync } = require('node:fs');
const { join, sep } = require('node:path');
const { tmpdir } = require('node:os');

const confinement = require('../electron/pathConfinement');

const IS_WIN = process.platform === 'win32';

function sandbox() {
  const base = mkdtempSync(join(tmpdir(), 'lc-confine-'));
  const root = join(base, 'project');
  const outside = join(base, 'secrets');
  mkdirSync(root);
  mkdirSync(outside);
  writeFileSync(join(root, 'app.js'), 'inside the project');
  writeFileSync(join(outside, 'id_rsa'), 'PRIVATE KEY');
  confinement.reset();
  confinement.addRoot(root);
  return { base, root, outside };
}

test('a path inside a user-picked project is permitted', () => {
  const { root } = sandbox();
  const file = confinement.resolveInside(join(root, 'app.js'));
  assert.strictEqual(file.ok, true);
  assert.strictEqual(file.path, realpathSync(join(root, 'app.js')));
  // the root itself is inside the root — project:tree resolves its dir this way
  assert.strictEqual(confinement.resolveInside(root).ok, true);
});

test('traversal out of the project root is rejected', () => {
  const { root } = sandbox();
  // The raw string a hostile "Files changed:" line or dataset would carry.
  const escape = root + sep + '..' + sep + 'secrets' + sep + 'id_rsa';
  const hit = confinement.resolveInside(escape);
  assert.strictEqual(hit.ok, false, '.. traversal must never escape the project root');
  assert.match(hit.error, /outside the open project folder/);
  // and again, buried under a subdirectory that does not exist
  const deep = escape.replace(`${sep}..${sep}`, `${sep}sub${sep}..${sep}..${sep}`);
  assert.strictEqual(confinement.resolveInside(deep).ok, false);
  // a subdirectory hop that lands back inside is NOT an escape
  assert.strictEqual(confinement.resolveInside(join(root, 'sub', '..', 'app.js')).ok, true);
});

test('an absolute path outside every picked root is rejected', () => {
  const { base, outside } = sandbox();
  assert.strictEqual(confinement.resolveInside(join(outside, 'id_rsa')).ok, false);
  assert.strictEqual(confinement.resolveInside(realpathSync(tmpdir())).ok, false);
  // A sibling whose name merely starts with the root's name — the bug any
  // naive `path.startsWith(root)` check would let through.
  const lookalike = `${base}${sep}project-evil`;
  mkdirSync(lookalike);
  writeFileSync(join(lookalike, 'id_rsa'), 'nope');
  assert.strictEqual(confinement.resolveInside(join(lookalike, 'id_rsa')).ok, false);
});

test('every path is rejected until a project folder is picked', () => {
  confinement.reset();
  const dir = mkdtempSync(join(tmpdir(), 'lc-noroot-'));
  writeFileSync(join(dir, 'file.txt'), 'x');
  const hit = confinement.resolveInside(join(dir, 'file.txt'));
  assert.strictEqual(hit.ok, false);
  assert.match(hit.error, /No project folder is open/);
  assert.deepStrictEqual(confinement.listRoots(), []);
  // the moment a root is registered the same path becomes legal
  confinement.addRoot(dir);
  assert.strictEqual(confinement.resolveInside(join(dir, 'file.txt')).ok, true);
});

test('a file that does not exist yet is permitted inside the root (project:write creates it)', () => {
  const { root } = sandbox();
  const fresh = confinement.resolveInside(join(root, 'created.js'));
  assert.strictEqual(fresh.ok, true);
  assert.ok(fresh.path.endsWith('created.js'));
  // both parents missing: the lexical path still decides, and it is inside
  const deep = confinement.resolveInside(join(root, 'a', 'b', 'created.js'));
  assert.strictEqual(deep.ok, true);
  // …but a missing path that would escape is still refused
  assert.strictEqual(confinement.resolveInside(join(root, 'a', '..', '..', 'secrets', 'new.txt')).ok, false);
});

test('a symlink is followed only while it stays inside the project', () => {
  const { root, outside } = sandbox();
  const escapeLink = join(root, 'escape');
  try { symlinkSync(outside, escapeLink, 'junction'); } catch { return; } // locked-down Windows CI
  const hit = confinement.resolveInside(join(escapeLink, 'id_rsa'));
  assert.strictEqual(hit.ok, false, 'a symlink must not launder a path out of the project');
  assert.strictEqual(confinement.resolveInside(escapeLink).ok, false);

  const insideDir = join(root, 'sub-real');
  mkdirSync(insideDir);
  writeFileSync(join(insideDir, 'note.txt'), 'hi');
  const insideLink = join(root, 'nested');
  try { symlinkSync(insideDir, insideLink, 'junction'); } catch { return; }
  const ok = confinement.resolveInside(join(insideLink, 'note.txt'));
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.symlinked, true);
  assert.strictEqual(ok.path, realpathSync(join(insideDir, 'note.txt')));
});

test('mixed separators and Windows-style paths stay confined', () => {
  const { root } = sandbox();
  const mixed = join(root, 'sub') + sep + '..' + sep + '..' + sep + 'secrets' + sep + 'id_rsa';
  assert.strictEqual(confinement.resolveInside(mixed).ok, false);

  if (IS_WIN) {
    assert.strictEqual(confinement.resolveInside(`${root}\\sub\\..\\..\\secrets\\id_rsa`).ok, false);
    assert.strictEqual(confinement.resolveInside(`${root}\\..\\secrets\\id_rsa`).ok, false);
    assert.strictEqual(confinement.resolveInside(`${root}\\app.js`).ok, true);
    // Windows paths are case-insensitive: a differently-cased path is the
    // same file, not an escape.
    assert.strictEqual(confinement.resolveInside(`${root.toLowerCase()}\\APP.JS`).ok, true);
  } else {
    // On POSIX a backslash is an ordinary filename character, never a
    // separator — so it can never traverse, and any path it yields must
    // still be inside the root.
    const back = confinement.resolveInside(`${root}\\..\\secrets\\id_rsa`);
    if (back.ok) assert.ok(back.path.startsWith(root), 'a backslash path on POSIX is a filename inside the root, not a traversal');
  }
});

test('a second picked root is honoured and roots are listed', () => {
  const { root, outside } = sandbox();
  assert.strictEqual(confinement.resolveInside(join(outside, 'id_rsa')).ok, false);
  confinement.addRoot(outside);
  assert.strictEqual(confinement.resolveInside(join(outside, 'id_rsa')).ok, true);
  assert.ok(confinement.listRoots().length >= 2);
  assert.ok(confinement.listRoots().some((r) => r === root || r.includes('project')));
  confinement.reset();
});
