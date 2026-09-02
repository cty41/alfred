Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'Config.psm1') -Force

function Invoke-AlfredUpdate {
    [CmdletBinding()]
    param([switch]$DryRun)
    $root = Get-AlfredRoot
    try { $manifest = Read-AlfredManifest -Root $root }
    catch { return New-AlfredResult -Command 'update' -Status 'failed' -Issues @($_.Exception.Message) }
    $dirty = [Collections.Generic.List[string]]::new()
    foreach ($tool in @($manifest.tools)) {
        $path = Join-Path $root ([string]$tool.path)
        if ((Test-Path -LiteralPath (Join-Path $path '.git')) -and @(& git -C $path status --porcelain 2>$null).Count -gt 0) { $dirty.Add([string]$tool.id) }
    }
    if ($dirty.Count -gt 0) { return New-AlfredResult -Command 'update' -Status 'failed' -Issues @($dirty | ForEach-Object {"submodule-dirty:$_"}) }
    $changes = @('git submodule update --remote --recursive','review and explicitly commit changed gitlinks')
    if ($DryRun) { return New-AlfredResult -Command 'update' -Status 'planned' -Changes $changes -Data @{network=$true; writes=$true} }
    try {
        & git -C $root submodule update --remote --recursive
        if ($LASTEXITCODE -ne 0) { throw "git submodule update exited with code $LASTEXITCODE" }
        New-AlfredResult -Command 'update' -Status 'ok' -Changes $changes -Data @{requiresCommit=$true}
    } catch { New-AlfredResult -Command 'update' -Status 'failed' -Changes $changes -Issues @($_.Exception.Message) }
}

Export-ModuleMember -Function Invoke-AlfredUpdate
