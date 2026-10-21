Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'Config.psm1')

function Get-KbState {
    param([string]$VaultPath,[string]$KitPath)
    $resolvedVault = Resolve-KbVaultPath $VaultPath
    $profilePath = Get-KbProfilePath
    $profile = Read-KbJson $profilePath
    if (-not $resolvedVault) {
        return [pscustomobject]@{ state='UNCONFIGURED'; vaultPath=$null; kitPath=$KitPath; issues=@('Vault not found') }
    }
    $issues = [Collections.Generic.List[string]]::new()
    $configPath = Join-Path $resolvedVault 'knowledge-config.json'
    $lockPath = Join-Path $resolvedVault '00_System\managed\kit-lock.json'
    $managedPath = Join-Path $resolvedVault '00_System\managed'
    if (-not (Test-Path -LiteralPath $resolvedVault)) {
        return [pscustomobject]@{ state='UNCONFIGURED'; vaultPath=$resolvedVault; kitPath=$KitPath; issues=@('Vault path does not exist') }
    }
    if (-not (Test-Path -LiteralPath $configPath)) { $issues.Add('knowledge-config.json missing') }
    if (-not (Test-Path -LiteralPath $lockPath)) { $issues.Add('kit-lock.json missing') }
    if (-not (Test-Path -LiteralPath $managedPath)) { $issues.Add('managed directory missing') }
    if (-not $profile) { $issues.Add('Local profile missing') }
    if ($issues.Count -gt 0) {
        $state = if ((Test-Path $configPath) -or (Test-Path $lockPath)) { 'DEGRADED' } else { 'DISCOVERED' }
        return [pscustomobject]@{ state=$state; vaultPath=$resolvedVault; kitPath=$KitPath; issues=$issues.ToArray() }
    }
    $lock = Read-KbJson $lockPath
    $actual = Get-KbFileTreeHash $managedPath
    if ($lock -and $lock.managedFilesChecksum -and $actual -ne [string]$lock.managedFilesChecksum) {
        $issues.Add('Managed files drift detected')
        return [pscustomobject]@{ state='DEGRADED'; vaultPath=$resolvedVault; kitPath=$KitPath; issues=$issues.ToArray() }
    }
    [pscustomobject]@{ state='HEALTHY'; vaultPath=$resolvedVault; kitPath=$KitPath; issues=@() }
}

Export-ModuleMember -Function Get-KbState

