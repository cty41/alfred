Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'Reports.psm1')

function Invoke-KbBackup {
    param([Parameter(Mandatory)][string]$VaultPath,[Parameter(Mandatory)][string]$Destination,[switch]$DryRun)
    if(-not (Test-Path -LiteralPath $VaultPath)){throw "Vault not found: $VaultPath"}
    $stamp=(Get-Date).ToString('yyyyMMdd-HHmmss')
    $target=Join-Path $Destination "LifeKnowledge-$stamp"
    $changes=@("copy $VaultPath -> $target")
    if($DryRun){return (New-KbResult -Command 'backup' -Status 'dry-run' -State 'HEALTHY' -VaultPath $VaultPath -Changes $changes)}
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    Copy-Item -LiteralPath $VaultPath -Destination $target -Recurse
    New-KbResult -Command 'backup' -Status 'ok' -State 'HEALTHY' -VaultPath $VaultPath -Changes $changes -Data @{backupPath=$target}
}

Export-ModuleMember -Function Invoke-KbBackup
