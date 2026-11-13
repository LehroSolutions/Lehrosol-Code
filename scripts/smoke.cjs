'use strict';
const { _electron } = require('playwright');
const { launchPackaged } = require('./electron-launch.cjs');
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const root = resolve(__dirname, '..');
const option = (name) => {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
  return value;
};
const packagedDir = resolve(option('--packaged-dir') || join(root, 'dist', 'win-unpacked'));
const { sourceHashes, fingerprint, sha256 } = require('./source-state.cjs');
const sourceFingerprint = fingerprint(sourceHashes(root));
const appAsarSha256 = process.argv.includes('--packaged') ? sha256(readFileSync(join(packagedDir, 'resources', 'app.asar'))) : null;
const executableSha256 = process.argv.includes('--packaged') ? sha256(readFileSync(join(packagedDir, 'Lehrosol Code.exe'))) : null;
const version = require('../package.json').version;
const updateVersion = version.split('.').map((part, index) => index === 2 ? Number(part) + 1 : part).join('.');
const outputDir = resolve(option('--qa-dir') || join(root, 'dist', 'qa'));
mkdirSync(outputDir, { recursive: true });
const temp = mkdtempSync(join(tmpdir(), 'lehrosol-desktop-smoke-'));
const project = join(temp, 'project with spaces');
const home = join(temp, 'home');
mkdirSync(join(project, 'src'), { recursive: true });
mkdirSync(join(project, 'test'), { recursive: true });
mkdirSync(home);
writeFileSync(join(project, 'src', 'index.js'), 'const original = 1;\n');
writeFileSync(join(project, 'test', 'index.js'), 'const other = 2;\n');
writeFileSync(join(project, 'large.txt'), 'x'.repeat(400100));
const cli = join(temp, 'cli.js');
writeFileSync(cli, `const args=process.argv.slice(2); const cmd=args[0];
if(cmd==='--version'){ console.log('LehroSol CLI v3.2.0-beta.2'); }
else if(cmd==='code') { console.log(JSON.stringify({version:1,type:'start',model:'smoke-model',missionId:'fixture',dryRun:args.includes('--dryRun')})); if(args[1]==='wait') { setInterval(()=>console.log('[builder] waiting'),1000); } else { console.log(JSON.stringify({version:1,type:'request',step:1,usage:{prompt_tokens:20,completion_tokens:12},ms:30})); console.log(JSON.stringify({version:1,type:'action',action:'read',label:'read src/index.js',ok:true,step:1,total:2,observation:'const saved = 4;'})); console.log(JSON.stringify({version:1,type:'result',ok:true,summary:'# Project reviewed\\n\\nThe source is ready for review.\\n\\n\\x3cscript\\x3eunsafe()\\x3c/script\\x3e',changedFiles:['src/index.js']})); } }
else if(cmd==='vault') console.log(JSON.stringify({ok:true,models:[{id:'smoke-model',size:'1 GB',fit:'GREAT'}],roots:[]}));
else if(cmd==='tui') console.log(JSON.stringify({ok:true,vault:{models:1},engrams:0,web:false,adapters:1}));
else if(cmd==='engrams') console.log(JSON.stringify({ok:true,engrams:[]}));
else if(cmd==='sessions') console.log(JSON.stringify({ok:true,sessions:[]}));
else console.log(JSON.stringify({ok:true}));
`);
const errors = [];
const checks = [];
let app;
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/v1/models') { res.end(JSON.stringify({ data: [{ id: 'smoke-model' }] })); return; }
  if (req.url === '/props') { res.end(JSON.stringify({ default_generation_settings: { n_ctx: 4096 }, total_slots: 1 })); return; }
  let body = '';
  req.on('data', (d) => { body += d; });
  req.on('end', () => res.end(JSON.stringify({ choices: [{ message: { content: '```javascript\nconst rewritten = 3;\n```' }, finish_reason: 'stop' }], usage: { completion_tokens: 12, prompt_tokens: 20 } })));
});
const record = async (name, fn) => { await fn(); checks.push(name); console.log(`PASS ${name}`); };
(async () => {
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const port = server.address().port;
  writeFileSync(join(home, 'serve.json'), JSON.stringify({ model: 'smoke-model', port, pid: process.pid }));
  const packaged = process.argv.includes('--packaged');
  const executablePath = packaged ? join(packagedDir, 'Lehrosol Code.exe') : require('electron');
  const launchArgs = [...(packaged ? [] : [root]), `--user-data-dir=${join(temp, 'user-data')}`];
  const launch = packaged ? launchPackaged : (options) => _electron.launch({ ...options, timeout: 120000 });
  const env = { ...process.env, LEHRO_HOME: home, LEHROSOL_BIN: cli, LEHRO_MODELS_DIR: temp };
  delete env.NODE_OPTIONS; delete env.ELECTRON_RUN_AS_NODE;
  app = await launch({ executablePath, args: launchArgs, env });
  const page = await app.firstWindow();
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('dialog', (dialog) => dialog.dismiss());
  await page.waitForURL(/\/index\.html$/);
  await page.waitForFunction(() => window.lehro && typeof state !== 'undefined' && state.ping && state.ping.ok);
  await app.evaluate(({ dialog }, dir) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] }); }, project);
  await record('Sandboxed preload, installed version, and engine health', async () => {
    const info = await page.evaluate(() => window.lehro.info());
    assert.equal(info.appVersion, require('../package.json').version);
    assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
    const preferences = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences());
    assert.equal(preferences.sandbox, true);
    assert.equal(await page.evaluate((p) => window.lehro.ping({ port: p }), port).then((r) => r.ok), true);
  });
  await record('Project picker and duplicate-basename tabs', async () => {
    await page.locator('#projectPill').click();
    await page.waitForFunction(() => document.querySelector('#projectRepo').textContent === 'project with spaces');
    await page.evaluate(async (paths) => { await openFile(paths[0]); await openFile(paths[1]); }, [join(project, 'src', 'index.js'), join(project, 'test', 'index.js')]);
    assert.equal(await page.locator('#tabsBar [data-tab]').count(), 3);
    assert.ok((await page.locator('#editorCode').textContent()).includes('other'));
  });
  await record('Edit, save, and external-change conflict protection', async () => {
    await page.evaluate((file) => openFile(file), join(project, 'src', 'index.js'));
    await page.locator('#btnEditToggle').click();
    await page.locator('#editorTextarea').fill('const saved = 4;\n');
    await page.locator('#btnSaveFile').click();
    assert.equal(readFileSync(join(project, 'src', 'index.js'), 'utf8'), 'const saved = 4;\n');
    const result = await page.evaluate((file) => window.lehro.projectWrite({ file, content: 'bad', expectedContent: 'old' }), join(project, 'src', 'index.js'));
    assert.equal(result.ok, false);
  });
  await record('Large file is read-only without destructive saving', async () => {
    await page.evaluate((file) => openFile(file), join(project, 'large.txt'));
    assert.equal(await page.locator('#btnSaveFile').isDisabled(), true);
    await page.evaluate(() => saveCurrentFile());
    assert.equal(readFileSync(join(project, 'large.txt'), 'utf8').length, 400100);
  });
  await record('Local AI suggestion and Apply write the original target', async () => {
    await page.evaluate((file) => openFile(file), join(project, 'src', 'index.js'));
    await page.locator('#btnAISuggest').click();
    await page.waitForFunction(() => !document.querySelector('#suggestCard').classList.contains('hidden'));
    await page.locator('#btnApply').click();
    await page.waitForFunction(() => document.querySelector('#suggestCard').classList.contains('hidden'));
    assert.match(readFileSync(join(project, 'src', 'index.js'), 'utf8'), /rewritten/);
  });
  await record('Settings validation and configured engine port', async () => {
    await page.evaluate(() => switchView('settings'));
    await page.locator('#setPort').fill('70000');
    await page.locator('#btnSaveSettings').click();
    assert.match(await page.locator('#toast').textContent(), /port/i);
    await page.locator('#setPort').fill(String(port));
    await page.locator('#btnSaveSettings').click();
    assert.equal(await page.locator('#setKey').getAttribute('type'), 'password');
  });
  await record('Dry-run mission, output streaming, and cancellation', async () => {
    assert.equal(await page.locator('#missionLive').isChecked(), false);
    await page.locator('#askInput').fill('inspect this project'); await page.locator('#askInput').press('Enter');
    await page.waitForFunction(() => state.missions.some((m) => m.status === 'done'));
    await page.locator('#askInput').fill('wait'); await page.locator('#askInput').press('Enter');
    await page.waitForFunction(() => state.missions.some((m) => m.status === 'running'));
    await page.evaluate(async () => { const m = state.missions.find((m) => m.status === 'running'); await cancelMission(m.id); });
    await page.waitForFunction(() => !state.missions.some((m) => m.status === 'running'));
  });
  await record('Full-size output, escaped answers, tool activity, and changed-file navigation', async () => {
    await page.evaluate(() => showMissionOutput(state.missions.find((m) => m.status === 'done').id));
    assert.match(await page.locator('#outputBody').textContent(), /Project reviewed/);
    assert.equal(await page.locator('#outputBody script').count(), 0);
    assert.match(await page.locator('#outputBody').textContent(), /<script>unsafe\(\)<\/script>/);
    const bounds = await page.locator('#outputBody').boundingBox();
    const workspaceBounds = await page.locator('#mainViews').boundingBox();
    assert.ok(bounds.height >= 160 && bounds.height >= workspaceBounds.height * 0.45, JSON.stringify({ output: bounds, workspace: workspaceBounds }));
    await page.screenshot({ path: join(outputDir, packaged ? 'packaged-output.png' : 'source-output.png') });
    await page.locator('[data-output-mode="activity"]').click();
    await page.locator('#outputFilter').selectOption('tools');
    assert.equal(await page.locator('.output-event').count(), 1);
    await page.locator('.output-event summary').click(); assert.match(await page.locator('.output-event pre').textContent(), /const saved/);
    await page.locator('#outputFilter').selectOption('all'); await page.locator('[data-output-mode="answer"]').click();
    await page.locator('[data-output-file]').first().click(); await page.waitForFunction(() => state.view === 'code');
  });
  await record('Footer usage combines measured tokens with active engine context', async () => {
    await page.locator('#footerUsage').click(); await page.waitForSelector('.usage-table');
    assert.match(await page.locator('.usage-table').textContent(), /smoke-model/);
    assert.match(await page.locator('.usage-table').textContent(), /4,096 active/);
    assert.match(await page.locator('.usage-table').textContent(), /12/);
    await page.locator('#footerEngine').click(); await page.waitForSelector('#engineModel');
    assert.match(await page.locator('.engine-facts').textContent(), /4,096 tokens/);
  });
  await record('Layouts hide panels without hiding the composer and retain split output', async () => {
    await page.locator('#workspacePreset').selectOption('minimal');
    assert.equal(await page.locator('#agentPanel').isVisible(), false);
    assert.equal(await page.locator('#rightCol').isVisible(), false);
    assert.equal(await page.locator('#askInput').isVisible(), true);
    await page.locator('#workspacePreset').selectOption('code');
    assert.equal(await page.locator('#viewCode').isVisible(), true); assert.equal(await page.locator('#viewOutput').isVisible(), true);
    await page.locator('#btnViews').click(); await page.locator('[data-pin-view="usage"]').check(); await page.locator('#layoutName').fill('My review'); await page.locator('#layoutSave').click();
    assert.equal(await page.locator('[data-load-layout]').count(), 1); await page.locator('#viewsClose').click();
    assert.equal(await page.locator('[data-view="usage"]').isVisible(), true);
  });
  await record('Saved layout corruption recovers and engine selection survives refresh', async () => {
    await page.evaluate(() => localStorage.setItem('lc.savedLayouts', '[null,4,{}]'));
    await page.locator('#btnViews').click();
    assert.equal(await page.locator('[data-load-layout]').count(), 0);
    await page.locator('#layoutName').fill('My review'); await page.locator('#layoutSave').click();
    await page.locator('#viewsClose').click();
    await page.evaluate(() => { state.polling = false; state.models.push({ ...state.models[0], id: 'selection-fixture' }); switchView('engine'); });
    await page.locator('#engineModel').selectOption('selection-fixture');
    await page.evaluate(() => refreshMetrics());
    assert.equal(await page.locator('#engineModel').inputValue(), 'selection-fixture');
    await page.evaluate(() => { state.models = state.models.filter((model) => model.id !== 'selection-fixture'); state.polling = true; });
  });
  await record('Appearance applies theme, density and output font and excludes secrets from setup export', async () => {
    await page.locator('#footerTheme').click(); await page.locator('#appearanceTheme').selectOption('midnight'); await page.locator('#appearanceDensity').selectOption('compact');
    await page.locator('#appearanceOutput').fill('17'); await page.locator('#appearanceClose').click();
    assert.equal(await page.evaluate(() => document.body.dataset.theme), 'midnight');
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--output-font').trim()), '17px');
    await page.locator('#btnViews').click(); await page.locator('#preferencesShare').click();
    const exported = await page.locator('#preferencesJson').inputValue(); assert.equal(exported.includes('apiKey'), false); assert.equal(exported.includes(project), false);
    await page.locator('#preferencesJson').fill('{invalid'); await page.locator('#preferencesImport').click(); assert.match(await page.locator('#toast').textContent(), /Invalid setup/);
    await page.locator('#preferencesJson').fill(exported); await page.locator('#preferencesImport').click();
  });
  await record('Terminal executes and restarts after exit', async () => {
    await page.locator('#btnTermToggle').click();
    await page.locator('#termInput').fill('echo LEHROSOL_SMOKE_OK'); await page.locator('#termInput').press('Enter');
    await page.waitForFunction(() => document.querySelector('#termOut').textContent.includes('LEHROSOL_SMOKE_OK'));
    await page.locator('#termInput').fill('exit'); await page.locator('#termInput').press('Enter');
    await page.waitForFunction(() => !termReady);
    await page.locator('#termInput').fill('echo RESTART_OK'); await page.locator('#termInput').press('Enter');
    await page.waitForFunction(() => document.querySelector('#termOut').textContent.includes('RESTART_OK'));
  });
  await record('Bundled Help opens a real file outside the app archive', async () => {
    await app.evaluate(({ shell }) => { shell.openPath = async (file) => { globalThis.lastHelpPath = file; return ''; }; });
    const result = await page.evaluate(() => window.lehro.openHelp());
    assert.equal(result.ok, true, JSON.stringify(result));
    const helpPath = await app.evaluate(() => globalThis.lastHelpPath);
    assert.equal(require('node:fs').existsSync(helpPath), true);
    assert.equal(helpPath.includes('app.asar'), false);
  });
  if (process.argv.includes('--live-update')) {
    await record('Live GitHub update request returns a recoverable release status', async () => {
      const result = await page.evaluate(() => window.lehro.checkUpdates());
      console.log(`LIVE UPDATE ${JSON.stringify(result)}`);
      writeFileSync(join(outputDir, 'live-update.json'), JSON.stringify(result, null, 2));
      assert.equal(result.ok, true);
    });
  }
  await record('Update buttons display changes and enable verified download', async () => {
    await app.evaluate(({ app, shell }, latest) => {
      const require = process.getBuiltinModule('module').createRequire(app.getAppPath() + '/package.json');
      const updates = require(require('node:path').join(app.getAppPath(), 'electron', 'updates.js'));
      const original = updates.checkForUpdates;
      globalThis.releaseFixture = { tag_name: `v${latest}`, html_url: `https://github.com/LehroSolutions/Lehrosol-Code/releases/tag/v${latest}`, body: 'Fixed editor workflows\n<script>data only</script>', assets: [
        { name: `Lehrosol.Code.Setup.${latest}.exe`, size: 100, browser_download_url: `https://github.com/LehroSolutions/Lehrosol-Code/releases/download/v${latest}/Lehrosol.Code.Setup.${latest}.exe` },
        { name: 'SHA256SUMS', size: 80, browser_download_url: `https://github.com/LehroSolutions/Lehrosol-Code/releases/download/v${latest}/SHA256SUMS` },
      ] };
      globalThis.openedReleaseUrls = [];
      shell.openExternal = async (url) => { globalThis.openedReleaseUrls.push(url); };
      updates.checkForUpdates = (version) => original(version, async () => {
        if (globalThis.releaseFailure) throw new Error('offline fixture');
        return globalThis.releaseFixture;
      });
    }, updateVersion);
    await page.locator('#btnUpdate').click();
    await page.waitForSelector('#updateDownload');
    assert.match(await page.locator('.release-notes').first().textContent(), /<script>data only<\/script>/);
    assert.equal(await page.locator('.release-notes script').count(), 0);
    assert.ok((await page.locator('.installed-notes').textContent()).includes(version));
    await page.locator('#updateNotes').click();
    await page.locator('#updateChecksums').click();
    await page.locator('#updateDownload').click();
    await page.waitForFunction(() => true);
    const opened = await app.evaluate(() => globalThis.openedReleaseUrls);
    assert.equal(opened.length, 3);
    assert.ok(opened[0].endsWith(`/tag/v${updateVersion}`));
    assert.ok(opened[1].endsWith('/SHA256SUMS'));
    assert.ok(opened[2].endsWith(`/Lehrosol.Code.Setup.${updateVersion}.exe`));
    assert.ok(await page.locator('.installation-status').textContent());
    await page.screenshot({ path: join(outputDir, packaged ? 'packaged-update.png' : 'source-update.png') });
    await page.locator('#updateClose').click();
    await page.evaluate(() => switchView('settings'));
    await page.locator('#btnSettingsUpdate').click(); await page.waitForSelector('#updateDownload'); await page.locator('#updateClose').click();
    await page.locator('#btnHelp').click(); await page.locator('#btnAboutUpdate').click(); await page.waitForSelector('#updateDownload'); await page.locator('#updateClose').click();
    await page.locator('#searchBox').click(); await page.locator('#paletteInput').fill('Check for updates');
    await page.locator('.pal-item').first().click(); await page.waitForSelector('#updateDownload'); await page.locator('#updateClose').click();
  });
  await record('Unpublished and offline updates retain bundled changes and recover on retry', async () => {
    await app.evaluate(() => { globalThis.releaseFixture = null; });
    await page.locator('#btnUpdate').click(); await page.waitForSelector('#updateRetry');
    assert.match(await page.locator('#modal').textContent(), /No stable release/);
    assert.ok((await page.locator('.installed-notes').textContent()).includes(version));
    await page.locator('#updateClose').click();
    await app.evaluate(() => { globalThis.releaseFailure = true; });
    await page.locator('#btnUpdate').click(); await page.waitForSelector('#updateRetry');
    assert.match(await page.locator('#modal').textContent(), /offline fixture/);
    assert.equal(await page.locator('#updateDownload').count(), 0);
    await app.evaluate(() => { globalThis.releaseFailure = false; });
    await page.locator('#updateRetry').click(); await page.waitForSelector('#updateRetry');
    assert.match(await page.locator('#modal').textContent(), /No stable release/);
    await page.locator('#updateClose').click();
  });
  await record('Dismissing a pending failed update never reopens its dialog', async () => {
    await app.evaluate(({ app }) => {
      const require = process.getBuiltinModule('module').createRequire(app.getAppPath() + '/package.json');
      const updates = require(require('node:path').join(app.getAppPath(), 'electron', 'updates.js'));
      updates.checkForUpdates = () => new Promise((_resolve, reject) => { globalThis.rejectPendingUpdate = reject; });
    });
    await page.locator('#btnUpdate').click();
    await page.waitForFunction(() => document.querySelector('#modal').textContent.includes('Checking for updates'));
    await page.locator('#updateClose').click();
    await app.evaluate(() => globalThis.rejectPendingUpdate(new Error('late failure')));
    await page.waitForFunction(() => !document.querySelector('#btnUpdate').disabled);
    assert.equal(await page.locator('#modal').isVisible(), false);
  });
  await record('Project search, memory retrieval, and model benchmark', async () => {
    await page.evaluate(() => switchView('search'));
    await page.locator('#projSearch').fill('rewritten'); await page.locator('#projSearch').press('Enter');
    await page.waitForFunction(() => document.querySelector('#searchResults').textContent.includes('index.js'));
    await page.evaluate(() => switchView('memory')); await page.locator('#btnEngram').click();
    await page.waitForFunction(() => document.querySelector('#engramOut').textContent.includes('engrams'));
    await page.evaluate(() => switchView('bench')); await page.locator('#btnBenchRun').click();
    await page.waitForFunction(() => state.bench.length > 0 && !state.benchBusy);
    assert.equal(await page.evaluate(() => state.bench[0].ok), true);
  });
  await record('Every main view opens without renderer exceptions', async () => {
    for (const view of ['output', 'code', 'files', 'search', 'engine', 'usage', 'bench', 'vault', 'skills', 'missions', 'memory', 'settings']) { await page.evaluate((v) => switchView(v), view); }
    assert.deepEqual(errors, []);
  });
  await record('Minimum window keeps update and settings controls reachable', async () => {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1080, 680));
    await page.locator('[data-view="settings"]').click();
    await page.locator('#btnSettingsUpdate').scrollIntoViewIfNeeded();
    const layout = await page.evaluate(() => ({ width: innerWidth, controls: ['btnUpdate', 'btnSettingsUpdate', 'btnSaveSettings'].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return { id, left: r.left, right: r.right }; }) }));
    for (const control of layout.controls) assert.ok(control.left >= 0 && control.right <= layout.width, JSON.stringify(layout));
    await page.screenshot({ path: join(outputDir, packaged ? 'packaged-minimum.png' : 'source-minimum.png') });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1480, 920));
  });
  await page.screenshot({ path: join(outputDir, packaged ? 'packaged.png' : 'source.png') });
  await record('Cold reopen retains saved settings and version', async () => {
    await app.close();
    app = await launch({ executablePath, args: launchArgs, env });
    const reopened = await app.firstWindow();
    await reopened.waitForURL(/\/index\.html$/);
    await reopened.waitForFunction(() => typeof state !== 'undefined' && state.info && state.ping && state.ping.ok);
    assert.equal(await reopened.evaluate(() => localStorage.getItem('lc.port')), String(port));
    assert.equal((await reopened.evaluate(() => window.lehro.info())).appVersion, require('../package.json').version);
    assert.equal(await reopened.evaluate(() => JSON.parse(localStorage.getItem('lc.askHistory')).includes('wait')), true);
    assert.equal(await reopened.evaluate(() => document.body.dataset.theme), 'midnight');
    assert.equal(await reopened.evaluate(() => appearance.outputFont), 17);
    assert.equal(await reopened.evaluate(() => layout.split), true);
    assert.equal(await reopened.evaluate(() => JSON.parse(localStorage.getItem('lc.savedLayouts'))[0].name), 'My review');
    assert.ok((await reopened.evaluate(() => window.lehro.usage())).models[0].requests >= 2);
  });
  assert.equal(fingerprint(sourceHashes(root)), sourceFingerprint, 'Application source changed during smoke verification');
  if (packaged) {
    assert.equal(sha256(readFileSync(executablePath)), executableSha256, 'Packaged executable changed during smoke verification');
    assert.equal(sha256(readFileSync(join(packagedDir, 'resources', 'app.asar'))), appAsarSha256, 'Packaged archive changed during smoke verification');
  }
  writeFileSync(join(outputDir, packaged ? 'packaged-smoke.json' : 'source-smoke.json'), JSON.stringify({ ok: true, version: require('../package.json').version, platform: process.platform, packaged, packagedDirectory: packaged ? packagedDir : null, sourceFingerprint, appAsarSha256, executableSha256, checks, errors, engine: 'Synthetic loopback API; no model-quality claim', cli: 'Disposable fixture for application flows', at: new Date().toISOString() }, null, 2));
})().catch((err) => {
  console.error(err); process.exitCode = 1;
  writeFileSync(join(outputDir, process.argv.includes('--packaged') ? 'packaged-smoke.json' : 'source-smoke.json'), JSON.stringify({ version, platform: process.platform, packaged: process.argv.includes('--packaged'), packagedDirectory: process.argv.includes('--packaged') ? packagedDir : null, sourceFingerprint, appAsarSha256, executableSha256, ok: false, checks, errors: [...errors, err.message], at: new Date().toISOString() }, null, 2));
}).finally(async () => {
  if (app) await app.close().catch(() => {});
  await new Promise((done) => server.close(done));
  if (!resolve(temp).startsWith(resolve(tmpdir()) + require('node:path').sep) || !require('node:path').basename(temp).startsWith('lehrosol-desktop-smoke-')) throw new Error('Refusing to remove an unverified smoke directory');
  rmSync(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});
