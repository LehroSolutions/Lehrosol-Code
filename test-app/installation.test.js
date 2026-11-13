'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { detectInstallation, INSTALLER_GUID } = require('../electron/installation');

test('installation detector finds an older Windows install with spaces and distinguishes portable copies', async () => {
  const result = await detectInstallation({ platform: 'win32', query: async (key) => {
    if (key.startsWith('HKLM')) return '';
    if (key.includes('Uninstall')) return '    DisplayVersion    REG_SZ    2.3.0\n    UninstallString    REG_SZ    "C:\\Users\\Home Station\\Programs\\Lehrosol Code\\Uninstall Lehrosol Code.exe" /currentuser';
    return '    InstallLocation    REG_SZ    C:\\Users\\Home Station\\Programs\\Lehrosol Code';
  } });
  assert.equal(result.state, 'installed');
  assert.equal(result.installations[0].version, '2.3.0');
  assert.equal(result.installations[0].scope, 'current user');
  assert.equal(result.installations[0].directory, 'C:\\Users\\Home Station\\Programs\\Lehrosol Code');
  assert.equal(result.installations[0].running, false);
  assert.equal((await detectInstallation({ platform: 'win32', query: async () => '' })).state, 'portable');
});

test('installation detector reports registry failure without pretending nothing is installed', async () => {
  const result = await detectInstallation({ platform: 'win32', query: async () => { throw new Error('Access denied'); } });
  assert.equal(result.state, 'unknown');
  assert.equal(result.error, 'Access denied');
});

test('installer identity matches predecessor and preserves user data on replacement', () => {
  const nsis = require('../package.json').build.nsis;
  assert.equal(nsis.guid, INSTALLER_GUID);
  assert.equal(nsis.deleteAppDataOnUninstall, false);
});
