param([switch]$PrepareOnly, [switch]$SkipBuild, [switch]$ResumeExisting, [switch]$ValidateResumeOnly)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1') -ErrorAction Stop
$null = Get-Command Get-FileHash -ErrorAction Stop
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$qaRoot = [IO.Path]::GetFullPath((Join-Path $root 'dist\qa\installation'))
$qaGuid = 'cce9d50a-7f9f-4680-b0df-fc9e82b96f82'
$realGuid = 'f487ccb7-2921-5fe7-8c43-cc99c9874470'
$qaName = 'lehrosol-code-installation-qa'
$qaProduct = 'Lehrosol Code Installation QA'
$pkg = Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
$node = (Get-Command node -ErrorAction Stop).Source
$supportsSystemCa = (& $node --help | Select-String -SimpleMatch '--use-system-ca' -Quiet)
$utf8 = New-Object Text.UTF8Encoding($false)
if ($ValidateResumeOnly) { $ResumeExisting = $true }

function Assert-Within([string]$Target, [string]$Parent) {
  $absolute = [IO.Path]::GetFullPath($Target)
  $boundary = [IO.Path]::GetFullPath($Parent).TrimEnd('\') + '\'
  if (-not $absolute.StartsWith($boundary, [StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe QA target: $absolute" }
  return $absolute
}
function Write-Json([string]$File, $Value) {
  [IO.File]::WriteAllText($File, ($Value | ConvertTo-Json -Depth 30), $utf8)
}
function Quoted([string]$Value) {
  if ($Value.Contains('"') -or $Value.Contains("`r") -or $Value.Contains("`n")) { throw 'Unsupported process argument' }
  return '"' + $Value + '"'
}
function Run-Hidden([string]$File, [string]$Arguments, [string]$LogName, [int]$TimeoutSeconds = 180) {
  $stdout = Assert-Within (Join-Path $qaRoot "$LogName.stdout.log") $qaRoot
  $stderr = Assert-Within (Join-Path $qaRoot "$LogName.stderr.log") $qaRoot
  if ($LogName -in @('install-old', 'upgrade-new', 'uninstall-new')) {
    [IO.File]::WriteAllText($stdout, "Native GUI installer; NSIS does not emit application output through redirected console streams.`n", $utf8)
    [IO.File]::WriteAllText($stderr, '', $utf8)
    $startInfo = New-Object Diagnostics.ProcessStartInfo
    $startInfo.FileName = $File
    $startInfo.Arguments = $Arguments
    $startInfo.WorkingDirectory = $root
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $startInfo
    if (-not $process.Start()) { throw "Unable to start $LogName" }
  } else {
    $process = Start-Process -FilePath $File -ArgumentList $Arguments -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
  }
  $null = $process.Handle
  if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
    & (Join-Path $env:SystemRoot 'System32\taskkill.exe') /PID $process.Id /T /F | Out-Null
    [void]$process.WaitForExit(5000)
    throw "$LogName timed out; inspect $stderr"
  }
  $exitCode = $process.ExitCode
  if ($null -eq $exitCode -or $exitCode -ne 0) { throw "$LogName failed ($exitCode); inspect $stderr" }
  Write-Host "PASS $LogName"
}
function Registry-Snapshot([string]$Guid) {
  $result = [ordered]@{}
  foreach ($hive in @('HKCU:', 'HKLM:')) {
    foreach ($suffix in @("Software\Microsoft\Windows\CurrentVersion\Uninstall\$Guid", "Software\$Guid", "Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\$Guid", "Software\WOW6432Node\$Guid")) {
      $key = "$hive\$suffix"
      if (Test-Path -LiteralPath $key) {
        $values = [ordered]@{}
        $item = Get-ItemProperty -LiteralPath $key
        foreach ($property in ($item.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | Sort-Object Name)) { $values[$property.Name] = $property.Value }
        $result[$key] = $values
      }
    }
  }
  return $result
}
function Source-Hashes {
  $hashes = [ordered]@{}
  foreach ($folder in @('electron', 'renderer', 'docs')) {
    foreach ($file in (Get-ChildItem -LiteralPath (Join-Path $root $folder) -File -Recurse | Sort-Object FullName)) {
      $relative = $file.FullName.Substring($root.Length + 1).Replace('\', '/')
      $hashes[$relative] = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    }
  }
  foreach ($file in @('package.json', 'pnpm-lock.yaml', 'CHANGELOG.md', 'LICENSE', 'NOTICE')) { $hashes[$file] = (Get-FileHash -LiteralPath (Join-Path $root $file) -Algorithm SHA256).Hash.ToLowerInvariant() }
  return $hashes
}
function Registered-App-Hashes($Snapshot) {
  $hashes = [ordered]@{}
  foreach ($key in $Snapshot.Keys) {
    $entry = $Snapshot[$key]
    if (-not $entry.Contains('UninstallString')) { continue }
    $match = [regex]::Match([string]$entry.UninstallString, '^"([^"]+)"')
    if (-not $match.Success) { continue }
    $directory = [IO.Path]::GetDirectoryName($match.Groups[1].Value)
    foreach ($relative in @('resources\app.asar', 'Lehrosol Code.exe')) {
      $file = Join-Path $directory $relative
      if (Test-Path -LiteralPath $file) { $hashes[$file] = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() }
    }
  }
  return $hashes
}
function Wait-Condition([scriptblock]$Condition, [string]$Description) {
  $deadline = [DateTime]::UtcNow.AddSeconds(60)
  do {
    if (& $Condition) { return }
    Start-Sleep -Milliseconds 250
  } while ([DateTime]::UtcNow -lt $deadline)
  throw "Timed out: $Description"
}
function Prepare-AppData-Markers {
  $markers = @()
  foreach ($name in @($qaProduct, $qaName)) {
    $directory = Assert-Within (Join-Path $env:APPDATA $name) $env:APPDATA
    $marker = Join-Path $directory 'installation-qa-profile-marker.json'
    $existed = Test-Path -LiteralPath $directory
    if ($existed) {
      $children = @(Get-ChildItem -LiteralPath $directory -Force)
      if ($children.Count -ne 1 -or $children[0].FullName -ne $marker) { throw "Refusing to use a preexisting AppData directory: $directory" }
      $existingMarker = Get-Content -LiteralPath $marker -Raw | ConvertFrom-Json
      if ($existingMarker.qaGuid -ne $qaGuid -or $existingMarker.owner -ne 'verify-installation.ps1') { throw 'AppData marker is not owned by this QA harness' }
    } else {
      [void](New-Item -ItemType Directory -Path $directory)
      Write-Json $marker @{ owner = 'verify-installation.ps1'; qaGuid = $qaGuid; purpose = 'Verify default NSIS AppData paths survive upgrade/uninstall'; createdAt = [DateTime]::UtcNow.ToString('o') }
    }
    $markers += @{ directory = $directory; marker = $marker; createdByHarness = -not $existed; sha256 = (Get-FileHash -LiteralPath $marker -Algorithm SHA256).Hash.ToLowerInvariant() }
  }
  return $markers
}
function Assert-AppData-Markers($Markers) {
  foreach ($entry in $Markers) {
    Assert-Within $entry.directory $env:APPDATA | Out-Null
    if (-not (Test-Path -LiteralPath $entry.marker) -or (Get-FileHash -LiteralPath $entry.marker -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256) { throw "Default QA AppData marker changed or disappeared: $($entry.marker)" }
  }
}

[void](New-Item -ItemType Directory -Path $qaRoot -Force)
Assert-Within $qaRoot (Join-Path $root 'dist\qa') | Out-Null
$driver = Join-Path $qaRoot 'installed-app.cjs'
$driverSource = @'
'use strict';
const [root, executablePath, profile, home, stage, expectedVersion, output] = process.argv.slice(2);
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const cli = path.join(home, 'qa-cli.js');
fs.mkdirSync(home, { recursive: true });
fs.writeFileSync(cli, `const args=process.argv.slice(2); if(args[0]==='--version') console.log('LehroSol CLI v3.2.0-beta.2'); else if(args[0]==='vault') console.log(JSON.stringify({ok:true,models:[{id:'qa-no-engine',size:'1 GB',fit:'GREAT'}],roots:[]})); else console.log(JSON.stringify({ok:false,error:'Installation QA does not start inference or write projects'}));`);
let child; let socket; let launchLog = ''; let sequence = 0;
const pending = new Map();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Page CDP timeout: ${method}`)); }, 30000);
  pending.set(id, { resolve, reject, timer });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
};
(async () => {
  const env = { ...process.env, LEHRO_HOME: home, LEHROSOL_BIN: cli, LEHRO_MODELS_DIR: home };
  delete env.NODE_OPTIONS; delete env.ELECTRON_RUN_AS_NODE;
  const endpoint = await new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => { settled = true; reject(new Error('Installed application did not expose Chromium CDP within 60 seconds')); }, 60000);
    child = spawn(executablePath, ['--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', `--user-data-dir=${profile}`], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const collect = data => {
      launchLog += data.toString();
      const match = launchLog.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[^\s]+)/);
      if (match && !settled) { settled = true; clearTimeout(timer); resolve(match[1]); }
    };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    child.once('error', error => { if (!settled) { settled = true; clearTimeout(timer); reject(error); } });
    child.once('exit', (code, signal) => { launchLog += `\nEXIT ${code} ${signal}\n`; if (!settled) { settled = true; clearTimeout(timer); reject(new Error(`Installed application exited before CDP: ${code}`)); } });
  });
  const port = new URL(endpoint).port;
  let target;
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5000) }).then(response => response.json());
    target = targets.find(item => item.type === 'page');
    if (target) break;
    await delay(200);
  }
  assert.ok(target, 'Installed application did not create a page target');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  const errors = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(message.params.exceptionDetails));
    if (!message.id || !pending.has(message.id)) return;
    const entry = pending.get(message.id); pending.delete(message.id); clearTimeout(entry.timer);
    if (message.error) entry.reject(new Error(`${message.error.code}: ${message.error.message}`)); else entry.resolve(message.result);
  });
  socket.addEventListener('close', () => { for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('Installed page CDP connection closed')); } pending.clear(); });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Installed page WebSocket did not open within 30 seconds')), 30000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener('error', error => { clearTimeout(timer); reject(error); }, { once: true });
  });
  await send('Runtime.enable');
  while (!(await evaluate('Boolean(window.lehro && typeof state !== "undefined" && state.info && (state.info.appVersion || state.info.cliVersion))'))) {
    if (Date.now() >= deadline) throw new Error('Installed renderer did not become ready');
    await delay(200);
  }
  const info = await evaluate('window.lehro.info()');
  if (stage !== 'historical') assert.equal(info.appVersion, expectedVersion);
  assert.equal(path.resolve(info.home), path.resolve(home));
  await evaluate('document.querySelector(\'[data-view="settings"]\').click()');
  if (stage === 'old' || stage === 'historical') {
    await evaluate(`document.getElementById('setAuto').checked=false;document.getElementById('setTheme').value='light';document.getElementById('setPort').value='31457';document.getElementById('btnSaveSettings').click();true`);
    assert.equal(await evaluate(`localStorage.getItem('lc.autoServe')`), '0');
  } else {
    assert.equal(await evaluate(`document.getElementById('setAuto').checked`), false);
    assert.equal(await evaluate(`document.getElementById('setTheme').value`), 'light');
    assert.equal(await evaluate(`document.getElementById('setPort').value`), '31457');
    assert.equal(await evaluate(`document.body.classList.contains('light')`), true);
  }
  const settings = await evaluate(`({autoServe:localStorage.getItem('lc.autoServe'),theme:localStorage.getItem('lc.theme'),port:localStorage.getItem('lc.port')})`);
  assert.deepEqual(errors, []);
  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(output.replace(/\.json$/, '.png'), Buffer.from(screenshot.data, 'base64'));
  fs.writeFileSync(output, JSON.stringify({ stage, version: info.appVersion, executablePath, profile, isolatedHome: info.home, settings, errors, automation: 'Normal executable launch; page-target CDP Runtime/Page commands; no Playwright browser or Node-inspector attachment', at: new Date().toISOString() }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (socket && socket.readyState === WebSocket.OPEN) { if (!process.exitCode) await evaluate('window.close()').catch(() => {}); socket.close(); }
  else if (socket) socket.close();
  if (child && child.exitCode === null) {
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 10000))]);
    if (child.exitCode === null) spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, encoding: 'utf8', timeout: 10000 });
    child.stdout.destroy(); child.stderr.destroy(); child.unref();
  }
  fs.writeFileSync(output.replace(/\.json$/, '.startup.log'), launchLog);
});
'@
[IO.File]::WriteAllText($driver, $driverSource, $utf8)
$metadataReader = Join-Path $qaRoot 'read-package.cjs'
[IO.File]::WriteAllText($metadataReader, "const asar=require(require('node:path').join(process.argv[2],'node_modules/@electron/asar'));process.stdout.write(asar.extractFile(process.argv[3],'package.json').toString('utf8'));", $utf8)

$configs = @{}
foreach ($stage in @('old', 'new')) {
  $version = if ($stage -eq 'old') { '2.4.1' } else { $pkg.version }
  $output = Assert-Within (Join-Path $root "dist\qa\installation-$stage") (Join-Path $root 'dist\qa')
  [void](New-Item -ItemType Directory -Path $output -Force)
  $config = $pkg.build | ConvertTo-Json -Depth 20 | ConvertFrom-Json
  $config.appId = 'solutions.lehro.lehrosolcode.installationqa'
  $config.productName = $qaProduct
  $config | Add-Member -NotePropertyName extraMetadata -NotePropertyValue @{ name = $qaName; productName = $qaProduct; version = $version } -Force
  $config | Add-Member -NotePropertyName directories -NotePropertyValue @{ output = $output } -Force
  $config.nsis.guid = $qaGuid
  $config.nsis | Add-Member -NotePropertyName createDesktopShortcut -NotePropertyValue $false -Force
  $config.nsis | Add-Member -NotePropertyName createStartMenuShortcut -NotePropertyValue $false -Force
  $config.nsis | Add-Member -NotePropertyName uninstallDisplayName -NotePropertyValue $qaProduct -Force
  $config.nsis.runAfterFinish = $false
  $config.nsis.deleteAppDataOnUninstall = $false
  $config.win.artifactName = 'Lehrosol.Code.Installation.QA.${version}.exe'
  $configFile = Join-Path $qaRoot "$stage-builder.json"
  Write-Json $configFile $config
  $configs[$stage] = @{ file = $configFile; output = $output; version = $version; installer = Join-Path $output "Lehrosol.Code.Installation.QA.$version.exe" }
}
if ($PrepareOnly) { Write-Host 'Prepared isolated installation QA configuration and runtime driver.'; exit 0 }

$realBefore = Registry-Snapshot $realGuid
$realFilesBefore = Registered-App-Hashes $realBefore
$qaBefore = Registry-Snapshot $qaGuid
$previousEvidence = $null
if ($ResumeExisting) {
  $receipt = Join-Path $qaRoot 'installation.json'
  if (-not (Test-Path -LiteralPath $receipt)) { throw 'Resume requires the prior installation.json receipt.' }
  $previousEvidence = Get-Content -LiteralPath $receipt -Raw | ConvertFrom-Json
  if ($previousEvidence.ok -or $previousEvidence.qaIdentity.guid -ne $qaGuid -or -not $previousEvidence.actualInstallationUnchanged) { throw 'Resume requires an incomplete, isolated QA receipt with the real installation unchanged.' }
  $recordedRealFiles = @($previousEvidence.actualInstalledFileHashes.PSObject.Properties)
  if ($recordedRealFiles.Count -eq 0 -or $realFilesBefore.Count -ne $recordedRealFiles.Count) { throw 'Real installation file inventory differs from the prior QA receipt.' }
  foreach ($entry in $recordedRealFiles) {
    if (-not $realFilesBefore.Contains($entry.Name) -or $realFilesBefore[$entry.Name] -ne $entry.Value) { throw 'Real installation files changed since the prior QA receipt.' }
  }
  if ($previousEvidence.actualRegistryAfter) {
    if (($realBefore | ConvertTo-Json -Depth 10 -Compress) -ne ($previousEvidence.actualRegistryAfter | ConvertTo-Json -Depth 10 -Compress)) { throw 'Real installation registration changed since the prior QA receipt.' }
  } else {
    $realUninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$realGuid"
    $realInstallKey = "HKCU:\Software\$realGuid"
    $recordedExecutable = @($recordedRealFiles | Where-Object { $_.Name.EndsWith('\Lehrosol Code.exe', [StringComparison]::OrdinalIgnoreCase) })
    if ($recordedExecutable.Count -ne 1 -or -not $realBefore.Contains($realUninstallKey) -or -not $realBefore.Contains($realInstallKey)) { throw 'Prior real installation identity could not be verified.' }
    $recordedLocation = [IO.Path]::GetDirectoryName($recordedExecutable[0].Name)
    $realEntry = $realBefore[$realUninstallKey]
    if ($realEntry.DisplayVersion -ne '2.3.0' -or $realEntry.DisplayName -ne 'Lehrosol Code 2.3.0' -or [IO.Path]::GetFullPath($realBefore[$realInstallKey].InstallLocation) -ne $recordedLocation -or $realEntry.UninstallString -ne ('"' + (Join-Path $recordedLocation 'Uninstall Lehrosol Code.exe') + '" /currentuser')) { throw 'The real 2.3.0 installation registration does not match the recorded file location.' }
  }
  if ($qaBefore.Count -ne 2) { throw 'Resume requires exactly the two current-user QA registry entries.' }
  $resumeUninstall = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$qaGuid"
  $resumeInstall = "HKCU:\Software\$qaGuid"
  if (-not $qaBefore.Contains($resumeUninstall) -or -not $qaBefore.Contains($resumeInstall) -or $qaBefore[$resumeUninstall].DisplayVersion -ne '2.4.1') { throw 'Resume requires the dedicated old 2.4.1 QA installation.' }
  $resumeTemp = Assert-Within $previousEvidence.temp ([IO.Path]::GetTempPath())
  if ([IO.Path]::GetFileName($resumeTemp) -notmatch '^lehrosol-installation-qa-[a-f0-9]{32}$') { throw 'Resume receipt does not identify a harness-owned temporary directory.' }
  $resumeLocation = Assert-Within $qaBefore[$resumeInstall].InstallLocation $resumeTemp
  if ($resumeLocation -ne [IO.Path]::GetFullPath((Join-Path $resumeTemp 'application with spaces'))) { throw 'Resume installation is outside the recorded QA location.' }
  $expectedUninstall = '"' + (Join-Path $resumeLocation "Uninstall $qaProduct.exe") + '" /currentuser'
  if ($qaBefore[$resumeUninstall].DisplayName -ne $qaProduct -or $qaBefore[$resumeUninstall].UninstallString -ne $expectedUninstall) { throw 'Resume QA registration identity/path mismatch.' }
  foreach ($stage in @('old', 'new')) {
    if ((Get-FileHash -LiteralPath $configs[$stage].installer -Algorithm SHA256).Hash.ToLowerInvariant() -ne $previousEvidence.installers.$stage.sha256) { throw "Resume $stage installer differs from the recorded QA artifact." }
  }
  $oldAsar = Join-Path $configs.old.output 'win-unpacked\resources\app.asar'
  $installedAsar = Join-Path $resumeLocation 'resources\app.asar'
  if ((Get-FileHash -LiteralPath $oldAsar -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $installedAsar -Algorithm SHA256).Hash) { throw 'Resume installed package differs from the recorded old QA build.' }
  $currentHashes = Source-Hashes
  foreach ($entry in $previousEvidence.sourceHashes.PSObject.Properties) {
    if (-not $currentHashes.Contains($entry.Name) -or $currentHashes[$entry.Name] -ne $entry.Value) { throw 'Source differs from the recorded QA builds; rebuild against settled source before installer QA.' }
  }
  if ($currentHashes.Count -ne @($previousEvidence.sourceHashes.PSObject.Properties).Count) { throw 'Source file inventory differs from the recorded QA builds.' }
  Assert-AppData-Markers $previousEvidence.defaultAppDataMarkers
  if ($ValidateResumeOnly) { Write-Host "PASS resume preflight; QA old 2.4.1 retained at $resumeLocation; real installation unchanged."; exit 0 }
  Write-Json (Join-Path $qaRoot ('installation-before-resume-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ') + '.json')) $previousEvidence
  $SkipBuild = $true
} elseif ($qaBefore.Count -ne 0) { throw 'The dedicated QA identity is already registered. Inspect the QA receipt, then use -ResumeExisting for an incomplete old-version run.' }
$sourceHashes = Source-Hashes
if (-not $SkipBuild) {
  foreach ($stage in @('old', 'new')) {
    $builderArguments = @((Join-Path $root 'node_modules\electron-builder\cli.js'), '--win', '--x64', '--publish=never', '--config', $configs[$stage].file)
    if ($supportsSystemCa) { $builderArguments = @('--use-system-ca') + $builderArguments }
    $arguments = $builderArguments | ForEach-Object { Quoted $_ }
    Run-Hidden $node ($arguments -join ' ') "build-$stage" 900
  }
}
if ((($sourceHashes | ConvertTo-Json -Depth 10 -Compress) -ne ((Source-Hashes) | ConvertTo-Json -Depth 10 -Compress))) { throw 'Source changed during the QA builds; rerun against a settled source revision.' }
foreach ($stage in @('old', 'new')) { if (-not (Test-Path -LiteralPath $configs[$stage].installer)) { throw "Missing $stage QA installer" } }
$tempParent = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$temp = if ($ResumeExisting) { $resumeTemp } else { Assert-Within (Join-Path $tempParent ('lehrosol-installation-qa-' + [Guid]::NewGuid().ToString('N'))) $tempParent }
if (-not $ResumeExisting) { [void](New-Item -ItemType Directory -Path $temp) }
$install = Assert-Within (Join-Path $temp 'application with spaces') $temp
$profile = Assert-Within (Join-Path $temp 'isolated profile') $temp
$qaLehroHome = Assert-Within (Join-Path $temp 'isolated lehro home') $temp
$executable = Join-Path $install "$qaProduct.exe"
$qaUninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$qaGuid"
$checks = New-Object Collections.Generic.List[string]
$evidence = [ordered]@{ ok = $false; qaIdentity = @{ appId = 'solutions.lehro.lehrosolcode.installationqa'; guid = $qaGuid; packageName = $qaName; productName = $qaProduct }; sourceHashes = $sourceHashes; windows = [Environment]::OSVersion.VersionString; processArch = $env:PROCESSOR_ARCHITECTURE; temp = $temp; checks = $checks; boundary = 'Silent current-user NSIS install/upgrade/uninstall with isolated app identity; old 2.4.1 is the current source repackaged with older version metadata. This does not establish upgrade from the historical released binary, Windows 10 acceptance, or signed publisher trust.'; at = [DateTime]::UtcNow.ToString('o') }
$evidence.sourceRevision = (& git -C $root rev-parse HEAD)
$evidence.tools = @{ node = (& $node --version); electron = (Get-Content -LiteralPath (Join-Path $root 'node_modules\electron\package.json') -Raw | ConvertFrom-Json).version; electronBuilder = (Get-Content -LiteralPath (Join-Path $root 'node_modules\electron-builder\package.json') -Raw | ConvertFrom-Json).version }
$evidence.installers = @{}
foreach ($stage in @('old', 'new')) { $evidence.installers[$stage] = @{ version = $configs[$stage].version; path = $configs[$stage].installer; sha256 = (Get-FileHash -LiteralPath $configs[$stage].installer -Algorithm SHA256).Hash.ToLowerInvariant(); bytes = (Get-Item -LiteralPath $configs[$stage].installer).Length } }
$appDataMarkers = Prepare-AppData-Markers
$evidence.defaultAppDataMarkers = $appDataMarkers
$evidence.actualRegistryBefore = $realBefore
if ($ResumeExisting) { $evidence.resumedFrom = $previousEvidence.at }
try {
  if (-not $ResumeExisting) { Run-Hidden $configs.old.installer "/S /currentuser /D=$install" 'install-old' }
  Wait-Condition { (Test-Path -LiteralPath $executable) -and (Test-Path -LiteralPath $qaUninstallKey) } 'Older application and registration'
  $registrationOld = Get-ItemProperty -LiteralPath $qaUninstallKey
  if ($registrationOld.DisplayVersion -ne '2.4.1') { throw 'Old registration version does not match' }
  $installRegistration = Get-ItemProperty -LiteralPath "HKCU:\Software\$qaGuid"
  if ([IO.Path]::GetFullPath($installRegistration.InstallLocation) -ne $install) { throw 'QA installer registered outside the allowed temporary directory' }
  $evidence.registrationOld = @{ displayName = $registrationOld.DisplayName; version = $registrationOld.DisplayVersion; location = $installRegistration.InstallLocation }
  $checks.Add('Silent 2.4.1 current-user installation and dedicated registration at a path with spaces')
  $oldMarker = Join-Path $install 'older-version-only-marker.txt'
  [IO.File]::WriteAllText($oldMarker, 'Remove this stale application file during upgrade.', $utf8)
  $arguments = @($driver, $root, $executable, $profile, $qaLehroHome, 'old', '2.4.1', (Join-Path $qaRoot 'installed-old.json')) | ForEach-Object { Quoted $_ }
  Run-Hidden $node ($arguments -join ' ') 'launch-old' 180
  $profileMarker = Join-Path $profile 'qa-settings-marker.json'
  [IO.File]::WriteAllText($profileMarker, '{"preserve":"isolated upgrade settings"}', $utf8)
  $profileMarkerHash = (Get-FileHash -LiteralPath $profileMarker -Algorithm SHA256).Hash
  Run-Hidden $configs.new.installer "/S /currentuser /D=$install" 'upgrade-new'
  Wait-Condition { (Test-Path -LiteralPath $qaUninstallKey) -and (Get-ItemProperty -LiteralPath $qaUninstallKey).DisplayVersion -eq $pkg.version } 'New registered version'
  if (Test-Path -LiteralPath $oldMarker) { throw 'Upgrade failed to remove the old application file marker' }
  if ((Get-FileHash -LiteralPath $profileMarker -Algorithm SHA256).Hash -ne $profileMarkerHash) { throw 'Upgrade modified the isolated profile marker' }
  Assert-AppData-Markers $appDataMarkers
  $checks.Add('Upgrade preserves marker bytes in both default NSIS QA AppData directories')
  $metadataArguments = @($metadataReader, $root, (Join-Path $install 'resources\app.asar')) | ForEach-Object { Quoted $_ }
  Run-Hidden $node ($metadataArguments -join ' ') 'installed-metadata'
  $packed = Get-Content -LiteralPath (Join-Path $qaRoot 'installed-metadata.stdout.log') -Raw | ConvertFrom-Json
  if ($packed.version -ne $pkg.version -or $packed.name -ne $qaName -or $packed.productName -ne $qaProduct) { throw 'Installed package metadata mismatch' }
  $evidence.installedPackage = @{ name = $packed.name; productName = $packed.productName; version = $packed.version; asarSha256 = (Get-FileHash -LiteralPath (Join-Path $install 'resources\app.asar') -Algorithm SHA256).Hash.ToLowerInvariant() }
  $checks.Add('Upgrade changes registration/package version and removes older application files')
  $arguments = @($driver, $root, $executable, $profile, $qaLehroHome, 'new', $pkg.version, (Join-Path $qaRoot 'installed-new.json')) | ForEach-Object { Quoted $_ }
  Run-Hidden $node ($arguments -join ' ') 'launch-new' 180
  $checks.Add('Installed old/new application launches; saved theme, port, and auto-start settings survive upgrade')
  $uninstaller = Assert-Within (Join-Path $install "Uninstall $qaProduct.exe") $install
  if (-not (Test-Path -LiteralPath $uninstaller)) { throw 'Dedicated QA uninstaller is missing' }
  Run-Hidden $uninstaller '/S /currentuser' 'uninstall-new'
  Wait-Condition { -not (Test-Path -LiteralPath $qaUninstallKey) -and -not (Test-Path -LiteralPath $executable) } 'QA uninstall removes application and registration'
  if ((Registry-Snapshot $qaGuid).Count -ne 0) { throw 'QA registry entries remain after uninstall' }
  if ((Get-FileHash -LiteralPath $profileMarker -Algorithm SHA256).Hash -ne $profileMarkerHash) { throw 'Uninstall removed or modified the isolated profile' }
  Assert-AppData-Markers $appDataMarkers
  $checks.Add('Uninstall preserves marker bytes in both default NSIS QA AppData directories')
  $checks.Add('Silent uninstall removes application/QA registry and preserves isolated profile')
  $evidence.ok = $true
} catch {
  $evidence.error = $_.Exception.Message
  throw
} finally {
  $realAfter = Registry-Snapshot $realGuid
  $realFilesAfter = Registered-App-Hashes $realAfter
  $evidence.actualInstallationUnchanged = (($realBefore | ConvertTo-Json -Depth 10 -Compress) -eq ($realAfter | ConvertTo-Json -Depth 10 -Compress)) -and (($realFilesBefore | ConvertTo-Json -Compress) -eq ($realFilesAfter | ConvertTo-Json -Compress))
  $evidence.actualInstalledFileHashes = $realFilesAfter
  $evidence.actualRegistryAfter = $realAfter
  $evidence.qaRegistryAfter = Registry-Snapshot $qaGuid
  $evidence.profileRetained = Test-Path -LiteralPath $profile
  Write-Json (Join-Path $qaRoot 'installation.json') $evidence
  if (-not $evidence.actualInstallationUnchanged) { throw 'The actual installation registry changed during QA; inspect evidence immediately' }
}
Write-Host "PASS $($checks.Count) isolated installation checks; artifacts and profile retained at $temp"
