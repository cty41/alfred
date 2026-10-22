Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'Config.psm1')
Import-Module (Join-Path $PSScriptRoot 'Reports.psm1')

function Invoke-KbUpgrade {
    param([Parameter(Mandatory)][string]$VaultPath,[Parameter(Mandatory)][string]$KitPath,[switch]$DryRun)
    $managed=Join-Path $VaultPath '00_System\managed'
    $lockPath=Join-Path $managed 'kit-lock.json'
    if(-not (Test-Path -LiteralPath $lockPath)){throw 'Vault is not linked; run init first.'}
    $lock=Read-KbJson $lockPath
    $actual=Get-KbFileTreeHash $managed
    if($lock.managedFilesChecksum -and $actual -ne [string]$lock.managedFilesChecksum){throw 'Managed drift detected; review before upgrade.'}
    $changes=@("replace kit-owned files in $managed","preserve runtime data in $managed\runtime-data","preserve user-owned vault content")
    if($DryRun){return (New-KbResult -Command 'upgrade' -Status 'dry-run' -State 'HEALTHY' -VaultPath $VaultPath -Changes $changes)}
    $backup=Join-Path $VaultPath "00_System\reports\managed-backup-$((Get-Date).ToString('yyyyMMdd-HHmmss'))"
    Copy-Item -LiteralPath $managed -Destination $backup -Recurse
    Get-ChildItem -LiteralPath $managed -Force | Where-Object {$_.Name -notin @('kit-lock.json','runtime-data')} | Remove-Item -Recurse -Force
    Copy-Item -Path (Join-Path $KitPath 'templates\managed\*') -Destination $managed -Recurse -Force
    $commit = try { (git -C $KitPath rev-parse HEAD 2>$null) } catch { $null }
    if(-not $commit){$commit='uncommitted'}
    $lock.kitVersion='1.0.1';$lock.gitCommit=[string]$commit;$lock.appliedAt=(Get-Date).ToString('o');$lock.managedFilesChecksum=Get-KbFileTreeHash $managed
    Write-KbJson $lock $lockPath
    New-KbResult -Command 'upgrade' -Status 'ok' -State 'HEALTHY' -VaultPath $VaultPath -Changes $changes -Data @{backupPath=$backup}
}

Export-ModuleMember -Function Invoke-KbUpgrade

