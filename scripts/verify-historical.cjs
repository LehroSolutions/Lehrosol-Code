'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const asar = require('@electron/asar');
const { detectInstallation } = require('../electron/installation');
const { sha256, sourceHashes, fingerprint } = require('./source-state.cjs');
const root = path.resolve(__dirname, '..');
if (process.env.GITHUB_ACTIONS !== 'true' || process.platform !== 'win32') throw new Error('Historical upgrade QA runs only on a disposable GitHub Windows runner');
const candidate = path.join(root, 'dist', 'historical-candidate');
const historical = path.join(root, 'dist', 'historical-release');
const output = path.join(root, 'dist', 'qa', 'historical');
fs.mkdirSync(output, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(candidate, 'release.json'), 'utf8'));
assert.equal(manifest.version, require('../package.json').version);
assert.equal(manifest.sourceFingerprint, fingerprint(sourceHashes(root)), 'Candidate source differs from this checkout');
assert.equal(manifest.installer, `Lehrosol.Code.Setup.${manifest.version}.exe`);
const latest = path.join(candidate, manifest.installer);
assert.equal(sha256(fs.readFileSync(latest)), manifest.sha256);
const oldName = 'Lehrosol.Code.Setup.2.4.1.exe';
const old = path.join(historical, oldName);
const checksums = fs.readFileSync(path.join(historical, 'SHA256SUMS'), 'utf8').replace(/^\uFEFF/, '');
const oldHash = checksums.split(/\r?\n/).map((line) => /^([a-fA-F0-9]{64})\s+\*?(.+)$/.exec(line)).find((match) => match?.[2] === oldName)?.[1];
assert.equal(sha256(fs.readFileSync(old)), oldHash?.toLowerCase(), 'Historical installer checksum mismatch');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lehrosol-historical-'));
const install = path.join(temp, 'application with spaces');
const executable = path.join(install, 'Lehrosol Code.exe');
const profile = path.join(temp, 'profile');
const home = path.join(temp, 'home');
const evidence = { ok: false, version: manifest.version, sourceRevision: manifest.source.revision, installerSha256: manifest.sha256, historicalVersion: '2.4.1', historicalInstallerSha256: oldHash, at: new Date().toISOString(), checks: [] };

function run(file, args, name, timeout = 120000) {
  const result = spawnSync(file, args, { cwd: root, windowsHide: true, encoding: 'utf8', timeout });
  fs.writeFileSync(path.join(output, `${name}.log`), `${result.stdout || ''}\n${result.stderr || ''}`);
  if (result.error || result.status !== 0) throw new Error(`${name} failed: ${result.error?.message || result.stderr || result.status}`);
}
function packageVersion() {
  return JSON.parse(asar.extractFile(path.join(install, 'resources', 'app.asar'), 'package.json').toString('utf8')).version;
}
async function ownRegistration(version) {
  const state = await detectInstallation();
  assert.equal(state.state, 'installed');
  assert.equal(state.installations.length, 1);
  assert.equal(path.resolve(state.installations[0].directory), path.resolve(install));
  if (version) assert.equal(state.installations[0].version, version);
}
(async () => {
  assert.equal((await detectInstallation()).state, 'portable', 'Runner already has a real installation; refusing to replace it');
  let installed = false;
  try {
    run(old, ['/S', '/currentuser', `/D=${install}`], 'install-historical');
    installed = true;
    await ownRegistration('2.4.1');
    assert.equal(packageVersion(), '2.4.1');
    evidence.checks.push('Install exact historical 2.4.1 artifact with original application identity');
    const driver = path.join(root, 'dist', 'qa', 'installation', 'installed-app.cjs');
    run(process.execPath, [driver, root, executable, profile, home, 'historical', '2.4.1', path.join(output, 'old.json')], 'launch-historical');
    const stale = path.join(install, 'historical-only-marker.txt');
    fs.writeFileSync(stale, 'Remove during upgrade');
    evidence.checks.push('Launch historical UI and save theme, port and auto-start settings');
    run(latest, ['/S', '/currentuser', `/D=${install}`], 'upgrade-candidate');
    await ownRegistration(manifest.version);
    assert.equal(packageVersion(), manifest.version);
    assert.equal(sha256(fs.readFileSync(path.join(install, 'resources', 'app.asar'))), manifest.appAsarSha256);
    assert.equal(sha256(fs.readFileSync(executable)), manifest.executableSha256);
    assert.equal(fs.existsSync(stale), false);
    run(process.execPath, [driver, root, executable, profile, home, 'new', manifest.version, path.join(output, 'new.json')], 'launch-candidate');
    evidence.checks.push('Upgrade to exact candidate payload; remove old files and retain historical settings');
  } catch (err) {
    evidence.error = err.message;
    throw err;
  } finally {
    try {
      if (installed) {
        await ownRegistration();
        assert.ok(path.resolve(install).startsWith(path.resolve(temp) + path.sep));
        run(path.join(install, 'Uninstall Lehrosol Code.exe'), ['/S', '/currentuser'], 'uninstall-candidate');
        assert.equal((await detectInstallation()).state, 'portable');
        evidence.checks.push('Uninstall test application and remove original-identity registration');
      }
      evidence.ok = !evidence.error;
    } catch (err) {
      evidence.error = [evidence.error, err.message].filter(Boolean).join('; ');
      throw err;
    } finally {
      fs.writeFileSync(path.join(output, 'historical-upgrade.json'), JSON.stringify(evidence, null, 2));
    }
  }
  console.log(`PASS historical upgrade: ${evidence.checks.length} checks`);
})().catch((err) => { console.error(err); process.exitCode = 1; });
