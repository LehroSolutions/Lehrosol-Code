'use strict';
// Dev launcher for Lehrosol Code.
//
// Why this exists: pnpm 11 injects `--use-system-ca` into NODE_OPTIONS when
// running package scripts. Electron only accepts a small whitelist of
// NODE_OPTIONS and exits with code 9 ("--use-system-ca is not allowed in
// NODE_OPTIONS") if anything else is present. So instead of `electron .`,
// `pnpm start` runs this script, which spawns Electron with a scrubbed
// environment. Works the same under npm/yarn/plain node.
const { spawn } = require('node:child_process');
const path = require('node:path');

// When required by plain Node, the `electron` package exports the path to
// the Electron executable for this platform.
const electron = require('electron');
if (typeof electron !== 'string') {
  console.error('[start] Unexpected: `electron` did not resolve to a binary path. Run this with node, not electron.');
  process.exit(1);
}

const appRoot = path.join(__dirname, '..');
const env = { ...process.env };
delete env.NODE_OPTIONS; // strip pnpm-injected flags Electron rejects
delete env.NODE_REPL_EXTERNAL_MODULE;

const child = spawn(electron, [appRoot], { stdio: 'inherit', env, cwd: appRoot });
child.on('error', (err) => {
  console.error('[start] Failed to launch Electron:', err.message);
  process.exit(1);
});
child.on('exit', (code, signal) => {
  process.exit(signal ? 1 : (code == null ? 0 : code));
});
