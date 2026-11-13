'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkForUpdates, trustedUrl, isNewer, installedReleaseNotes } = require('../electron/updates');
const release = () => ({ tag_name: 'v2.4.3', html_url: 'https://github.com/LehroSolutions/Lehrosol-Code/releases/tag/v2.4.3', body: '# Fixed\n<button onclick="bad()">data</button>', draft: false, prerelease: false, assets: [
  { name: 'Lehrosol.Code.Setup.2.4.3.exe', size: 100, browser_download_url: 'https://github.com/LehroSolutions/Lehrosol-Code/releases/download/v2.4.3/Lehrosol.Code.Setup.2.4.3.exe' },
  { name: 'SHA256SUMS', size: 80, browser_download_url: 'https://github.com/LehroSolutions/Lehrosol-Code/releases/download/v2.4.3/SHA256SUMS' },
] });
test('update check projects published notes and matching installer with checksums', async () => {
  const result = await checkForUpdates('2.4.2', async () => release());
  assert.equal(result.state, 'available');
  assert.equal(result.latestVersion, '2.4.3');
  assert.ok(result.installerUrl.endsWith('.exe'));
  assert.ok(result.checksumUrl.endsWith('/SHA256SUMS'));
  assert.equal(result.notes, release().body);
});

test('installed changes use the matching bundled version and exclude adjacent releases', () => {
  const notes = installedReleaseNotes('2.4.2');
  assert.match(notes, /## \[2\.4\.2\]/);
  assert.doesNotMatch(notes, /## \[2\.4\.1\]/);
  assert.equal(installedReleaseNotes('9.0.0'), '');
});
test('same/newer candidate version is current, numeric comparison and stable-over-beta work', async () => {
  assert.equal((await checkForUpdates('2.4.3', async () => release())).state, 'current');
  assert.equal((await checkForUpdates('2.4.4', async () => release())).state, 'current');
  assert.equal(isNewer('2.10.0', '2.9.0'), true);
  assert.equal(isNewer('2.4.3', '2.4.3-beta.1'), true);
  assert.equal(isNewer('2.4.3-beta.1', '2.4.2'), false);
});
test('no published releases and network errors are recoverable', async () => {
  assert.equal((await checkForUpdates('2.4.2', async () => null)).state, 'unpublished');
  const result = await checkForUpdates('2.4.2', async () => { throw new Error('offline'); });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'offline');
});
test('drafts, prereleases, mismatched tags and hostile URLs cannot enable download', async () => {
  for (const override of [{ draft: true }, { prerelease: true }, { tag_name: 'v2.4.3-beta.1' }, { html_url: 'https://github.com/attacker/repo/releases/tag/v2.4.3' }, { tag_name: 'v2.4.4' }]) {
    assert.equal((await checkForUpdates('2.4.2', async () => ({ ...release(), ...override }))).ok, false);
  }
  for (const url of ['javascript:alert(1)', 'https://github.com.evil.test/LehroSolutions/Lehrosol-Code/releases', 'https://x:secret@github.com/LehroSolutions/Lehrosol-Code/releases', 'https://github.com/LehroSolutions/Lehrosol-Code/releases?x=1']) assert.equal(trustedUrl(url), false);
});
test('installer link is withheld when checksum or correct version asset is missing', async () => {
  const r = release(); r.assets.pop();
  assert.equal((await checkForUpdates('2.4.2', async () => r)).installerUrl, null);
  const mismatch = release(); mismatch.assets[0].name = 'other.exe';
  assert.equal((await checkForUpdates('2.4.2', async () => mismatch)).installerUrl, null);
});
