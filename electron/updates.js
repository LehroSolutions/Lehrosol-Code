'use strict';
const https = require('node:https');
const tls = require('node:tls');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const REPO = 'LehroSolutions/Lehrosol-Code';
const RELEASES_URL = `https://github.com/${REPO}/releases`;
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const CAP = 1024 * 1024;

function installedReleaseNotes(version, changelog = readFileSync(join(__dirname, '..', 'CHANGELOG.md'), 'utf8')) {
  const heading = `## [${version}]`;
  const start = changelog.indexOf(heading);
  if (start < 0) return '';
  const end = changelog.indexOf('\n## [', start + heading.length);
  return changelog.slice(start, end < 0 ? changelog.length : end).trim();
}

function versionParts(value) {
  const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/.exec(String(value));
  return match ? { numbers: match.slice(1, 4).map(Number), prerelease: match[4] || '' } : null;
}

function isNewer(latest, current) {
  const a = versionParts(latest);
  const b = versionParts(current);
  if (!a || !b || a.prerelease) return false;
  for (let i = 0; i < 3; i++) {
    if (a.numbers[i] !== b.numbers[i]) return a.numbers[i] > b.numbers[i];
  }
  return Boolean(b.prerelease);
}

function trustedUrl(value, kind = 'release') {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || url.search || url.hash) return false;
    const base = `/${REPO}/releases`;
    if (kind === 'release') return url.pathname === base || new RegExp(`^${base}/tag/v?\\d+\\.\\d+\\.\\d+$`).test(url.pathname);
    return new RegExp(`^${base}/download/v?\\d+\\.\\d+\\.\\d+/[^/]+$`).test(url.pathname);
  } catch { return false; }
}

function requestRelease() {
  return new Promise((resolve, reject) => {
    const ca = typeof tls.getCACertificates === 'function' ? [...tls.getCACertificates('default'), ...tls.getCACertificates('system')] : undefined;
    const req = https.get(API_URL, { ca, headers: { 'User-Agent': 'Lehrosol-Code-update-check', Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } }, (res) => {
      const chunks = [];
      let size = 0;
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > CAP) { res.destroy(new Error('Release response is too large')); return; }
        chunks.push(chunk);
      });
      res.on('error', reject);
      res.on('end', () => {
        if (res.statusCode === 404) { resolve(null); return; }
        if (res.statusCode === 403 || res.statusCode === 429) { reject(new Error('GitHub is limiting update checks. Try again later.')); return; }
        if (res.statusCode !== 200) { reject(new Error(`GitHub returned HTTP ${res.statusCode}. Try again later.`)); return; }
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new Error('GitHub returned invalid release information.')); }
      });
    });
    const timer = setTimeout(() => req.destroy(new Error('Update check timed out. Check your connection and retry.')), 20000);
    req.on('error', reject);
    req.on('close', () => clearTimeout(timer));
  });
}

async function checkForUpdates(currentVersion, request = requestRelease) {
  const base = { currentVersion, releasesUrl: RELEASES_URL };
  try {
    const release = await request();
    if (!release) return { ...base, ok: true, state: 'unpublished' };
    const version = versionParts(release.tag_name);
    if (release.draft || release.prerelease || !version || version.prerelease || !trustedUrl(release.html_url)) throw new Error('The release metadata is not a published stable Lehrosol Code release.');
    const latestVersion = release.tag_name.replace(/^v/, '');
    const tagPath = `/releases/tag/${release.tag_name}`;
    if (!release.html_url.endsWith(tagPath)) throw new Error('The release version and link do not match.');
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const validAsset = (asset) => typeof asset.name === 'string' && trustedUrl(asset.browser_download_url, 'asset') && new URL(asset.browser_download_url).pathname === `/${REPO}/releases/download/${release.tag_name}/${asset.name}`;
    const installer = assets.find((asset) => validAsset(asset) && asset.name === `Lehrosol.Code.Setup.${latestVersion}.exe` && Number(asset.size) > 0);
    const checksums = assets.find((asset) => validAsset(asset) && asset.name === 'SHA256SUMS' && Number(asset.size) > 0);
    return {
      ...base, ok: true, state: isNewer(latestVersion, currentVersion) ? 'available' : 'current', latestVersion,
      releaseUrl: release.html_url, installerUrl: installer && checksums ? installer.browser_download_url : null,
      checksumUrl: installer && checksums ? checksums.browser_download_url : null,
      publishedAt: typeof release.published_at === 'string' ? release.published_at : '',
      notes: typeof release.body === 'string' && release.body.trim() ? release.body.slice(0, 50000) : 'No release notes were provided.',
    };
  } catch (err) {
    return { ...base, ok: false, state: 'error', error: err.message || 'Unable to check for updates. Check your connection and retry.' };
  }
}

module.exports = { checkForUpdates, requestRelease, trustedUrl, isNewer, installedReleaseNotes, RELEASES_URL };
