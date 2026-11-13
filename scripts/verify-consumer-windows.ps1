param(
  [Parameter(Mandatory = $true)][string]$CandidateDirectory,
  [Parameter(Mandatory = $true)][string]$CliEntry,
  [Parameter(Mandatory = $true)][string]$HistoricalInstaller,
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$HistoricalSha256,
  [Parameter(Mandatory = $true)][string]$ModelRoot,
  [ValidateSet('CurrentUser', 'AllUsers')][string]$Scope = 'CurrentUser',
  [string]$OutputDirectory,
  [switch]$DisposableEnvironment,
  [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$candidate = (Resolve-Path -LiteralPath $CandidateDirectory).Path
$cli = (Resolve-Path -LiteralPath $CliEntry).Path
$historical = (Resolve-Path -LiteralPath $HistoricalInstaller).Path
$models = (Resolve-Path -LiteralPath $ModelRoot).Path
$os = Get-CimInstance Win32_OperatingSystem
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$elevated = ([Security.Principal.WindowsPrincipal]$identity).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$node = (Get-Command node.exe -ErrorAction Stop).Source
$guid = 'f487ccb7-2921-5fe7-8c43-cc99c9874470'
$scopeFlag = if ($Scope -eq 'AllUsers') { 'allusers' } else { 'currentuser' }
$hive = if ($Scope -eq 'AllUsers') { 'HKLM:' } else { 'HKCU:' }
$manifestPath = Join-Path $candidate 'release.json'
if (-not (Test-Path -LiteralPath $manifestPath)) { $manifestPath = Join-Path $candidate 'candidate.json' }
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.installer -ne "Lehrosol.Code.Setup.$($manifest.version).exe") { throw 'Unexpected candidate installer filename' }
$installer = Join-Path $candidate $manifest.installer
$runId = [Guid]::NewGuid().ToString('N')
$output = if ($OutputDirectory) { [IO.Path]::GetFullPath($OutputDirectory) } else { Join-Path $root "dist\windows-acceptance\consumer-$($os.BuildNumber)-$Scope-$runId" }
if (Test-Path -LiteralPath (Join-Path $output 'acceptance.json')) { throw 'Use a new output directory; existing acceptance evidence is preserved.' }
[void](New-Item -ItemType Directory -Path $output -Force)
$utf8 = New-Object Text.UTF8Encoding($false)
$checks = New-Object Collections.Generic.List[string]
$receipt = [ordered]@{ ok = $false; os = $os.Caption; build = $os.Version; arch = $env:PROCESSOR_ARCHITECTURE; scope = $Scope; elevated = $elevated; candidateVersion = $manifest.version; installerSha256 = $manifest.sha256; sourceRevision = $manifest.source.revision; sourceFingerprint = $manifest.sourceFingerprint; at = [DateTime]::UtcNow.ToString('o'); checks = $checks; manualChecksPending = @('Interactive installer wizard and observed Windows trust warning', 'Representative coding-model output and additional hardware/antivirus profiles') }
$install = Join-Path $output 'application with spaces'
$executable = Join-Path $install 'Lehrosol Code.exe'
$profile = Join-Path $output 'historical-profile'
$home = Join-Path $output 'historical-home'
$owned = $false
$markers = @()
$previousTemp = $env:TEMP
$previousTmp = $env:TMP

function Write-Receipt {
  [IO.File]::WriteAllText((Join-Path $output 'acceptance.json'), ($receipt | ConvertTo-Json -Depth 15), $utf8)
}
function Hash([string]$Path) { return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() }
function Quote([string]$Value) {
  if ($Value.Contains('"') -or $Value.Contains("`n") -or $Value.Contains("`r")) { throw 'Invalid process argument' }
  return '"' + $Value + '"'
}
function Registrations {
  foreach ($registryHive in @('HKCU:', 'HKLM:')) {
    foreach ($prefix in @('Software', 'Software\WOW6432Node')) {
      $key = "$registryHive\$prefix\Microsoft\Windows\CurrentVersion\Uninstall\$guid"
      if (Test-Path -LiteralPath $key) { Get-ItemProperty -LiteralPath $key }
    }
  }
}
function Run([string]$File, [string]$Arguments, [string]$Name, [int]$TimeoutSeconds = 300) {
  if ($Name -match '^(fresh-install|install-historical|upgrade-candidate|uninstall-)') {
    [IO.File]::WriteAllText((Join-Path $output "$Name.stdout.log"), 'Native GUI installer; no redirected console output.', $utf8)
    [IO.File]::WriteAllText((Join-Path $output "$Name.stderr.log"), '', $utf8)
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = $File
    $info.Arguments = $Arguments
    $info.WorkingDirectory = $root
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $info
    if (-not $process.Start()) { throw "Could not start $Name" }
  } else {
    $process = Start-Process -FilePath $File -ArgumentList $Arguments -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $output "$Name.stdout.log") -RedirectStandardError (Join-Path $output "$Name.stderr.log")
  }
  $null = $process.Handle
  if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
    & (Join-Path $env:SystemRoot 'System32\taskkill.exe') /PID $process.Id /T /F | Out-Null
    throw "$Name timed out; inspect its retained logs"
  }
  if ($null -eq $process.ExitCode -or $process.ExitCode -ne 0) { throw "$Name failed ($($process.ExitCode)); inspect its retained logs" }
}
function Node([string[]]$Arguments, [string]$Name, [int]$TimeoutSeconds = 300) {
  Run $node (($Arguments | ForEach-Object { Quote $_ }) -join ' ') $Name $TimeoutSeconds
}
function Check-Installed([string]$Version, [switch]$ExactCandidate) {
  $key = "$hive\Software\Microsoft\Windows\CurrentVersion\Uninstall\$guid"
  if (-not (Test-Path -LiteralPath $key)) { throw 'Installer did not register in the selected scope' }
  if ((Get-ItemProperty -LiteralPath $key).DisplayVersion -ne $Version) { throw 'Installed registration has the wrong version' }
  if (@(Registrations).Count -ne 1) { throw 'Unexpected installation registration or scope' }
  if (-not (Test-Path -LiteralPath $executable)) { throw 'Installed executable missing' }
  if ($ExactCandidate) {
    if ((Hash $executable) -ne $manifest.executableSha256 -or (Hash (Join-Path $install 'resources\app.asar')) -ne $manifest.appAsarSha256) { throw 'Installed payload differs from the verified candidate bytes' }
  }
}
function Uninstall([string]$Name) {
  if (-not $owned) { return }
  $absolute = [IO.Path]::GetFullPath($install)
  if (-not $absolute.StartsWith([IO.Path]::GetFullPath($output).TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Refusing unsafe uninstall target' }
  $owner = Get-Content -LiteralPath (Join-Path $output 'owner.json') -Raw | ConvertFrom-Json
  if ($owner.runId -ne $runId -or $owner.installation -ne $absolute) { throw 'Installation ownership does not match this acceptance run' }
  Check-Installed (Get-ItemProperty -LiteralPath "$hive\Software\Microsoft\Windows\CurrentVersion\Uninstall\$guid").DisplayVersion
  Run (Join-Path $install 'Uninstall Lehrosol Code.exe') "/S /$scopeFlag" $Name 180
  $deadline = [DateTime]::UtcNow.AddSeconds(60)
  while ((Test-Path -LiteralPath $executable) -or @(Registrations).Count) {
    if ([DateTime]::UtcNow -gt $deadline) { throw 'Uninstall did not remove application files and registration' }
    Start-Sleep -Milliseconds 250
  }
}

try {
  if ($os.Caption -notmatch 'Windows 11' -or -not [Environment]::Is64BitOperatingSystem) { throw 'Acceptance requires a consumer Windows 11 x64 system' }
  if ((Hash $installer) -ne $manifest.sha256 -or (Get-Item -LiteralPath $installer).Length -ne $manifest.bytes) { throw 'Candidate checksum or size mismatch' }
  if ((Hash $historical) -ne $HistoricalSha256.ToLowerInvariant()) { throw 'Historical installer checksum mismatch' }
  $signature = Get-AuthenticodeSignature -LiteralPath $installer
  $receipt.signature = $signature.Status.ToString()
  if ($receipt.signature -notin @('Valid', 'NotSigned')) { throw 'Installer has an invalid signature' }
  $receipt.prerequisites = @{ originalInstallationPresent = [bool](@(Registrations).Count); allUsersPermitted = $elevated; disposableEnvironmentConfirmed = [bool]$DisposableEnvironment }
  if ($ValidateOnly) {
    $receipt.validated = $true
    Write-Receipt
    exit 0
  }
  if (-not $DisposableEnvironment) { throw 'Confirm -DisposableEnvironment; the original installer identity is tested only in a disposable environment' }
  if (@(Registrations).Count) { throw 'An original-identity installation already exists; refusing to replace it' }
  if ($Scope -eq 'AllUsers' -and -not $elevated) { throw 'AllUsers acceptance must run as administrator' }
  if (Test-Path -LiteralPath $install) { throw 'Acceptance installation directory already exists' }
  $driver = Join-Path $candidate 'qa\installation\installed-app.cjs'
  if (-not (Test-Path -LiteralPath $driver)) { throw 'Candidate runtime driver is missing' }
  $temp = Join-Path $output 'temp'
  [void](New-Item -ItemType Directory -Path $temp -Force)
  $env:TEMP = $temp
  $env:TMP = $temp
  [IO.File]::WriteAllText((Join-Path $output 'owner.json'), (@{ runId = $runId; installation = [IO.Path]::GetFullPath($install) } | ConvertTo-Json), $utf8)
  foreach ($name in @('Lehrosol Code', 'lehrosol-code')) {
    $directory = Join-Path $env:APPDATA $name
    [void](New-Item -ItemType Directory -Path $directory -Force)
    $marker = Join-Path $directory "consumer-acceptance-$runId.json"
    [IO.File]::WriteAllText($marker, $runId, $utf8)
    $markers += $marker
  }
  $checks.Add('Consumer Windows, exact candidate/historical checksums and observed signature verified')
  $owned = $true
  Run $installer "/S /$scopeFlag /D=$install" 'fresh-install' 180
  Check-Installed $manifest.version -ExactCandidate
  Node @((Join-Path $root 'scripts\smoke.cjs'), '--packaged', '--packaged-dir', $install, '--qa-dir', (Join-Path $output 'fresh-workflows')) 'fresh-workflows' 480
  $checks.Add('Exact installed candidate passed 21 sandboxed application workflows and cold reopening')
  Node @((Join-Path $root 'scripts\verify-cli.cjs'), '--cli', $cli) 'published-cli-contracts' 300
  Copy-Item -LiteralPath (Join-Path $root 'dist\qa\cli-contract.json') -Destination (Join-Path $output 'cli-contract.json')
  Node @((Join-Path $root 'scripts\verify-engine.cjs'), '--cli', $cli, '--model-root', $models) 'real-engine' 300
  Copy-Item -LiteralPath (Join-Path $root 'dist\qa\engine-check.json') -Destination (Join-Path $output 'engine-check.json')
  $checks.Add('Paired CLI contracts and actual small-GGUF startup, completion and stop passed')
  Uninstall 'uninstall-fresh'
  $owned = $false
  $checks.Add('Fresh installed application uninstalled without remaining registration')
  $owned = $true
  Run $historical "/S /$scopeFlag /D=$install" 'install-historical' 180
  Check-Installed '2.4.1'
  Node @($driver, $root, $executable, $profile, $home, 'historical', '2.4.1', (Join-Path $output 'historical.json')) 'historical-launch' 180
  $stale = Join-Path $install 'historical-only-marker.txt'
  [IO.File]::WriteAllText($stale, 'Remove during upgrade', $utf8)
  Run $installer "/S /$scopeFlag /D=$install" 'upgrade-candidate' 180
  Check-Installed $manifest.version -ExactCandidate
  if (Test-Path -LiteralPath $stale) { throw 'Upgrade retained obsolete application files' }
  Node @($driver, $root, $executable, $profile, $home, 'new', $manifest.version, (Join-Path $output 'upgraded.json')) 'upgraded-launch' 180
  $checks.Add('Exact historical 2.4.1 upgraded to candidate bytes, removed stale files and retained settings')
} catch {
  $receipt.error = $_.Exception.Message
} finally {
  if ($owned) {
    try { Uninstall 'uninstall-final'; $checks.Add('Final candidate uninstalled and original-identity registration removed') }
    catch { $receipt.error = @($receipt.error, $_.Exception.Message) -join '; ' }
  }
  foreach ($marker in $markers) {
    if (-not (Test-Path -LiteralPath $marker) -or [IO.File]::ReadAllText($marker) -ne $runId) { $receipt.error = @($receipt.error, 'Default AppData marker was not preserved') -join '; ' }
  }
  $receipt.defaultAppDataPreserved = $markers.Count -gt 0 -and -not $receipt.error
  $receipt.ok = -not $receipt.error -and -not $ValidateOnly -and $checks.Count -ge 6
  $receipt.finishedAt = [DateTime]::UtcNow.ToString('o')
  Write-Receipt
  $env:TEMP = $previousTemp
  $env:TMP = $previousTmp
}
if (-not $receipt.ok) { throw $receipt.error }
Write-Host "PASS $($os.Caption) ${Scope}: $($checks.Count) acceptance groups"
