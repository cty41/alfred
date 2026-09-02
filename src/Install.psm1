Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'Config.psm1') -Force

function Invoke-AlfredInstall {
    [CmdletBinding()]
    param(
        [ValidateSet('web','headless','all')][string]$Profile = 'all',
        [string]$ActivationRoot,
        [switch]$DryRun
    )
    $root = Get-AlfredRoot
    $skillsScript = Join-Path $root 'repos/skills/scripts/install-user.ps1'
    $finScript = Join-Path $root 'repos/fin-alfred/packages/dsh-alfred/scripts/install-dsh.ps1'
    $changes = @(
        'install user-level skills from repos/skills',
        "install dsh-alfred bundle for profile:$Profile",
        $(if ($ActivationRoot) { 'configure one non-secret activation root' } else { 'leave proactive activation roots unchanged' })
    )
    if ($DryRun) {
        return New-AlfredResult -Command 'install' -Status 'planned' -Changes $changes -Data @{ profile=$Profile; activationRootConfigured=[bool]$ActivationRoot; writes=$true }
    }
    $issues = [Collections.Generic.List[object]]::new()
    if (-not (Test-Path -LiteralPath $skillsScript -PathType Leaf)) { $issues.Add("installer-missing:skills") }
    if (-not (Test-Path -LiteralPath $finScript -PathType Leaf)) { $issues.Add("installer-missing:fin-alfred") }
    if ($issues.Count -gt 0) { return New-AlfredResult -Command 'install' -Status 'failed' -Changes $changes -Issues $issues.ToArray() }
    try {
        $powerShell = if (Get-Command pwsh -ErrorAction SilentlyContinue) { 'pwsh' } else { 'powershell' }
        & $powerShell -NoProfile -ExecutionPolicy Bypass -File $skillsScript
        if ($LASTEXITCODE -ne 0) { throw "skills installer exited with code $LASTEXITCODE" }
        $args = @('-NoProfile','-ExecutionPolicy','Bypass','-File',$finScript,'-Profile',$Profile)
        if ($ActivationRoot) { $args += @('-ActivationRoot',$ActivationRoot) }
        & $powerShell @args
        if ($LASTEXITCODE -ne 0) { throw "fin-alfred installer exited with code $LASTEXITCODE" }
        New-AlfredResult -Command 'install' -Status 'ok' -Changes $changes -Data @{profile=$Profile; activationRootConfigured=[bool]$ActivationRoot}
    } catch { New-AlfredResult -Command 'install' -Status 'failed' -Changes $changes -Issues @($_.Exception.Message) }
}

Export-ModuleMember -Function Invoke-AlfredInstall
