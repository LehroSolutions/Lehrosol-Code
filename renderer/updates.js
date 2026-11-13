'use strict';
(function updateControls() {
  let busy = false;
  function render(result) {
    const detection = result.installation;
    const detected = detection?.installations || [];
    const installationDetail = detected.length
      ? `Detected Windows installation: ${detected.map((item) => `${item.version} (${item.scope})${item.directory ? ` at ${item.directory}` : ''}`).join('; ')}. The installer detects the selected installation scope, removes the previous application files, and installs the new version. Settings, projects, and models are preserved.`
      : detection?.state === 'unknown' ? detection.error
      : 'No registered installation was found. This may be a source or portable copy. The installer will check again before installing; portable folders are managed separately.';
    const title = result.state === 'available' ? `Update available: ${esc(result.latestVersion)}` : result.state === 'current' ? 'You are up to date' : result.state === 'unpublished' ? 'No stable release published yet' : 'Update check unavailable';
    const detail = result.error || (result.state === 'unpublished' ? 'This build is a release candidate. Drafts and prereleases are excluded from update checks.' : `Installed: ${result.currentVersion}. Latest published: ${result.latestVersion}.`);
    openModal(`<h3>${title}</h3><p class="alt-sub">${esc(detail)}</p>${result.notes ? `<h4>Latest published changes (${esc(result.latestVersion)})</h4><pre class="release-notes">${esc(result.notes)}</pre>` : ''}${result.installedNotes && result.latestVersion !== result.currentVersion ? `<h4>Changes in your installed version (${esc(result.currentVersion)})</h4><pre class="release-notes installed-notes">${esc(result.installedNotes)}</pre>` : ''}${result.state === 'available' && !result.installerUrl ? '<p class="alt-sub">The release does not yet have a Windows installer and checksum file.</p>' : ''}<p class="alt-sub">Updates open in your browser. Download SHA256SUMS and verify the installer hash. Save your work, close the app, and run the new installer. Your local projects and models stay on disk.</p><div class="modal-actions"><button class="btn btn-dark" id="updateClose">Close</button><button class="btn btn-dark" id="updateRetry">Check again</button>${result.releaseUrl ? '<button class="btn btn-dark" id="updateNotes">Release page</button>' : ''}${result.state === 'available' && result.checksumUrl ? '<button class="btn btn-dark" id="updateChecksums">Download checksums</button>' : ''}${result.state === 'available' && result.installerUrl ? '<button class="btn btn-green" id="updateDownload">Download update</button>' : ''}</div>`);
    const installationMessage = document.createElement('p');
    installationMessage.className = 'alt-sub installation-status';
    installationMessage.textContent = installationDetail;
    $('updateClose').closest('.modal-actions').before(installationMessage);
    $('updateClose').addEventListener('click', closeModal);
    $('updateRetry').addEventListener('click', check);
    const open = async (url) => { try { const res = await bridge.openRelease(url); if (!res.ok) toast(res.error); } catch (err) { toast(err.message); } };
    if ($('updateNotes')) $('updateNotes').addEventListener('click', () => open(result.releaseUrl));
    if ($('updateDownload')) $('updateDownload').addEventListener('click', () => open(result.installerUrl));
    if ($('updateChecksums')) $('updateChecksums').addEventListener('click', () => open(result.checksumUrl));
  }
  async function check() {
    if (busy) return;
    if (!bridge || !bridge.checkUpdates) { toast('Update checks require the desktop app'); return; }
    busy = true;
    $('btnUpdate').disabled = true;
    openModal('<h3>Checking for updates…</h3><p class="alt-sub" role="status">Contacting GitHub for the latest published release and its changes.</p><div class="modal-actions"><button class="btn btn-dark" id="updateClose">Close</button></div>');
    $('updateClose').addEventListener('click', closeModal);
    const loadingClose = $('updateClose');
    const ownsModal = () => !$('modal').classList.contains('hidden') && $('updateClose') === loadingClose;
    try {
      const result = await bridge.checkUpdates();
      if (ownsModal()) render(result);
    } catch (err) { if (ownsModal()) render({ state: 'error', error: err.message }); }
    finally { busy = false; $('btnUpdate').disabled = false; }
  }
  window.lehroUpdates = { check };
  $('btnUpdate').addEventListener('click', check);
  if (typeof COMMANDS !== 'undefined') COMMANDS.push({ name: 'Check for updates', hint: 'release notes', run: () => { closePalette(); check(); } });
})();
