'use strict';
const { readdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { createHash } = require('node:crypto');

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
function sourceHashes(root) {
  const hashes = {};
  function visit(relative) {
    for (const entry of readdirSync(join(root, relative), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = `${relative}/${entry.name}`;
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) hashes[file] = sha256(readFileSync(join(root, file)));
    }
  }
  for (const directory of ['electron', 'renderer', 'docs']) visit(directory);
  for (const file of ['package.json', 'pnpm-lock.yaml', 'CHANGELOG.md', 'LICENSE', 'NOTICE']) hashes[file] = sha256(readFileSync(join(root, file)));
  return hashes;
}
const fingerprint = (hashes) => sha256(JSON.stringify(Object.entries(hashes).sort(([a], [b]) => a.localeCompare(b))));
module.exports = { sourceHashes, fingerprint, sha256 };
