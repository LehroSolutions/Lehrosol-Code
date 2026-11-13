import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname, resolve, normalize, sep, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sourceState from './source-state.cjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
const status = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
if (revision.status !== 0 || status.status !== 0) throw new Error('Release preparation requires an identifiable Git checkout');
const dirty = Boolean(status.stdout.trim());
if (process.env.CI && dirty) throw new Error('CI release preparation requires an unchanged source checkout');
const name = `Lehrosol.Code.Setup.${pkg.version}.exe`;
const installer = join(root, 'dist', name);
if (!existsSync(installer)) throw new Error(`Build the v${pkg.version} Windows installer first: pnpm dist`);
const asarPath = join(root, 'dist', 'win-unpacked', 'resources', 'app.asar');
const currentSourceHashes = sourceState.sourceHashes(root);
const currentFingerprint = sourceState.fingerprint(currentSourceHashes);
const appAsarSha256 = sourceState.sha256(readFileSync(asarPath));
const executableSha256 = sourceState.sha256(readFileSync(join(root, 'dist', 'win-unpacked', 'Lehrosol Code.exe')));
for (const file of ['source-smoke.json', 'packaged-smoke.json']) {
  const receipt = JSON.parse(readFileSync(join(root, 'dist', 'qa', file), 'utf8'));
  if (receipt.ok !== true || receipt.version !== pkg.version || receipt.errors?.length || !receipt.checks?.length || receipt.sourceFingerprint !== currentFingerprint) throw new Error(`Missing, failed, or stale QA: ${file}. Run the smoke gate against current source.`);
  if (file === 'packaged-smoke.json' && receipt.appAsarSha256 !== appAsarSha256) throw new Error('Packaged smoke does not cover this application archive');
  if (file === 'packaged-smoke.json' && receipt.executableSha256 !== executableSha256) throw new Error('Packaged smoke does not cover this executable');
}
const installation = JSON.parse(readFileSync(join(root, 'dist', 'qa', 'installation', 'installation.json'), 'utf8'));
if (!installation.ok || !installation.actualInstallationUnchanged || sourceState.fingerprint(installation.sourceHashes || {}) !== currentFingerprint) throw new Error('Installation QA is incomplete or stale. Run pnpm verify:installation.');
const { default: asar } = await import('@electron/asar');
const entries = asar.listPackage(asarPath).map((x) => x.replace(/\\/g, '/'));
for (const file of Object.keys(currentSourceHashes).filter((file) => /^(electron|renderer|docs)\//.test(file))) {
  if (!entries.includes(`/${file}`)) throw new Error(`Missing packaged source: ${file}. Rebuild before release.`);
}
for (const file of ['/electron/main.js', '/electron/updates.js', '/electron/installation.js', '/renderer/updates.js', '/docs/glossary.html', '/docs/USER-GUIDE.md', '/LICENSE', '/NOTICE', '/CHANGELOG.md']) {
  if (!entries.includes(file)) throw new Error(`Missing packaged file: ${file}`);
}
const packed = JSON.parse(asar.extractFile(asarPath, 'package.json').toString('utf8'));
if (packed.version !== pkg.version) throw new Error('Installer app version does not match source');
for (const field of ['name', 'productName', 'version', 'description', 'license', 'author', 'main']) if (JSON.stringify(packed[field]) !== JSON.stringify(pkg[field])) throw new Error(`Packaged metadata differs: ${field}`);
const sourceHashes = {};
for (const entry of entries) {
  const relative = entry.replace(/^\//, '');
  const source = join(root, relative);
  if (!existsSync(source) || !statSync(source).isFile()) continue;
  if (!/^(?:electron\/|renderer\/|docs\/|LICENSE$|NOTICE$|CHANGELOG\.md$)/.test(relative)) continue;
  const bytes = readFileSync(source);
  if (!bytes.equals(asar.extractFile(asarPath, normalize(relative)))) throw new Error(`Packaged source is stale: ${relative}. Rebuild before release.`);
  sourceHashes[relative] = createHash('sha256').update(bytes).digest('hex');
}
const bytes = readFileSync(installer);
const sha256 = createHash('sha256').update(bytes).digest('hex');
const require = createRequire(import.meta.url);
const sevenZip = join(dirname(require.resolve('electron-winstaller/package.json')), 'vendor', '7z-x64.exe');
const staging = mkdtempSync(join(tmpdir(), 'lehrosol-release-payload-'));
try {
  const extract = (archive, files) => {
    const result = spawnSync(sevenZip, ['e', '-y', `-o${staging}`, archive, ...files], { encoding: 'utf8', windowsHide: true, timeout: 120000 });
    if (result.status !== 0) throw new Error(`Could not verify installer payload: ${result.stderr || result.stdout || result.error}`);
  };
  extract(installer, ['$PLUGINSDIR\\app-64.7z']);
  extract(join(staging, 'app-64.7z'), ['resources\\app.asar', 'Lehrosol Code.exe']);
  if (sourceState.sha256(readFileSync(join(staging, 'app.asar'))) !== appAsarSha256) throw new Error('Installer payload does not match the smoke-tested application archive. Rebuild the installer.');
  if (sourceState.sha256(readFileSync(join(staging, 'Lehrosol Code.exe'))) !== sourceState.sha256(readFileSync(join(root, 'dist', 'win-unpacked', 'Lehrosol Code.exe')))) throw new Error('Installer executable differs from the smoke-tested application.');
} finally {
  if (!resolve(staging).startsWith(resolve(tmpdir()) + sep) || !basename(staging).startsWith('lehrosol-release-payload-')) throw new Error('Refusing unsafe release-staging cleanup');
  rmSync(staging, { recursive: true, force: true });
}
const inspected = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Import-Module (Join-Path $PSHOME 'Modules\\Microsoft.PowerShell.Utility\\Microsoft.PowerShell.Utility.psd1') -ErrorAction Stop; $sig = Get-AuthenticodeSignature -LiteralPath '${installer.replace(/'/g, "''")}'; @{status=$sig.Status.ToString(); statusMessage=$sig.StatusMessage} | ConvertTo-Json -Compress`], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
if (inspected.status !== 0) throw new Error('Could not verify installer Authenticode status');
const signature = { ...JSON.parse(inspected.stdout.replace(/^\uFEFF/, '')), sha256 };
if (!['Valid', 'NotSigned'].includes(signature.status)) throw new Error(`Installer signature verification failed: ${signature.status}`);
mkdirSync(join(root, 'dist', 'qa'), { recursive: true });
writeFileSync(join(root, 'dist', 'qa', 'signature.json'), `${JSON.stringify(signature, null, 2)}\n`);
const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
const start = changelog.indexOf(`## [${pkg.version}]`);
if (start < 0) throw new Error('No changelog entry for this version');
const end = changelog.indexOf('\n## [', start + 3);
const notes = changelog.slice(start, end < 0 ? changelog.length : end).trim();
writeFileSync(join(root, 'dist', 'SHA256SUMS'), `${sha256}  ${name}\n`);
const signingNote = signature.status === 'NotSigned' ? 'This Windows installer is unsigned. Windows SmartScreen may warn. Verify SHA256SUMS before installing.' : `Installer Authenticode status: ${signature.status}.`;
writeFileSync(join(root, 'dist', 'RELEASE-NOTES.md'), `${notes}\n\n### Installer signature\n\n${signingNote}\n`);
const manifest = {
  version: pkg.version, platform: 'win32', arch: 'x64', installer: name,
  bytes: bytes.length, sha256, signing: signature.status,
  generatedAt: new Date().toISOString(), packagedDocs: true,
  installerPayloadVerified: true, appAsarSha256, executableSha256,
  sourceFingerprint: currentFingerprint,
  source: { revision: revision.stdout.trim(), dirty },
  tools: {
    node: process.version,
    electron: JSON.parse(readFileSync(join(root, 'node_modules', 'electron', 'package.json'), 'utf8')).version,
    builder: JSON.parse(readFileSync(join(root, 'node_modules', 'electron-builder', 'package.json'), 'utf8')).version,
  },
  sourceHashes,
};
writeFileSync(join(root, 'dist', 'release.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Prepared ${name}, SHA256SUMS, RELEASE-NOTES.md, and release.json; packaged docs verified.`);
