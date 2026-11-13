'use strict';
const { execFile } = require('node:child_process');

const INSTALLER_GUID = 'f487ccb7-2921-5fe7-8c43-cc99c9874470';
const UNINSTALL_KEY = `Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${INSTALLER_GUID}`;

function queryRegistry(key) {
  return new Promise((resolve, reject) => {
    execFile('reg.exe', ['query', key, '/reg:64'], { windowsHide: true, timeout: 5000, maxBuffer: 65536 }, (error, stdout, stderr) => {
      if (!error) return resolve(stdout);
      if (error.code === 1 && !error.killed && /(?:not found|unable to find|cannot find)/i.test(stderr)) return resolve('');
      reject(new Error('Windows installation records could not be read. The installer will check again when it runs.'));
    });
  });
}

function registryValues(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(\S+)\s+REG_(?:SZ|EXPAND_SZ)\s+(.*)$/.exec(line);
    if (match) values[match[1]] = match[2].trim();
  }
  return values;
}

async function detectInstallation({ platform = process.platform, query = queryRegistry, executable = process.execPath, packaged = false } = {}) {
  if (platform !== 'win32') return { state: 'unsupported', installations: [] };
  try {
    const installations = [];
    for (const [hive, scope] of [['HKCU', 'current user'], ['HKLM', 'all users']]) {
      const values = registryValues(await query(`${hive}\\${UNINSTALL_KEY}`));
      if (!values.DisplayVersion || !values.UninstallString) continue;
      const location = registryValues(await query(`${hive}\\Software\\${INSTALLER_GUID}`)).InstallLocation;
      const uninstaller = /^"([^"]+)"/.exec(values.UninstallString)?.[1];
      const directory = location || (uninstaller ? require('node:path').win32.dirname(uninstaller) : '');
      installations.push({ version: values.DisplayVersion, scope, directory, running: packaged && executable.toLowerCase().startsWith(directory.toLowerCase() + '\\') });
    }
    return { state: installations.length ? 'installed' : 'portable', installations };
  } catch (err) { return { state: 'unknown', installations: [], error: err.message }; }
}

module.exports = { INSTALLER_GUID, detectInstallation, registryValues };
