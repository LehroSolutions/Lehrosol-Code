import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { beforeEach, afterEach } from 'node:test';

const home = mkdtempSync(join(tmpdir(), 'lehrosol-code-test-'));
process.env.LEHRO_HOME = home;
beforeEach(() => { process.env.LEHRO_HOME = home; });
afterEach(() => { process.env.LEHRO_HOME = home; });
process.on('exit', () => {
  if (!resolve(home).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unsafe test-home cleanup path');
  rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
