param([Parameter(Mandatory = $true)][string]$Path)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1') -ErrorAction Stop
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1') -ErrorAction Stop
$signature = Get-AuthenticodeSignature -LiteralPath $Path
@{ status = $signature.Status.ToString(); statusMessage = $signature.StatusMessage } | ConvertTo-Json -Compress
