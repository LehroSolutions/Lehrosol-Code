import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let count = 0;
for (const dir of ['electron', 'renderer', 'scripts', 'test-app']) {
  for (const file of readdirSync(join(root, dir))) {
    if (!/\.(?:js|mjs|cjs)$/.test(file)) continue;
    const result = spawnSync(process.execPath, ['--check', join(root, dir, file)], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr || `Syntax failed: ${file}`);
    count++;
  }
}
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
if (!pkg.private || !/^\d+\.\d+\.\d+$/.test(pkg.version)) throw new Error('Invalid desktop release metadata');
for (const file of ['README.md', 'RELEASING.md', 'docs/USER-GUIDE.md', 'docs/glossary.html']) {
  const source = readFileSync(join(root, file), 'utf8');
  const matches = file.endsWith('.md') ? [...source.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]) : [...source.matchAll(/(?:src|href)="([^"#]+)"/g)].map((m) => m[1]);
  for (const link of matches) {
    if (/^(?:https?:|data:|mailto:|#)/.test(link)) continue;
    const target = link.split('#')[0];
    if (target && !existsSync(resolve(root, dirname(file), target))) throw new Error(`Broken local link in ${file}: ${link}`);
  }
}
if (!readFileSync(join(root, 'CHANGELOG.md'), 'utf8').includes(`## [${pkg.version}]`)) throw new Error('Changelog must cover current release version');
console.log(`Checked ${count} JavaScript files, release metadata, and local documentation links (v${pkg.version}).`);
