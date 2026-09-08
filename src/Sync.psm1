Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'Config.psm1') -Force

function Invoke-AlfredSync {
    [CmdletBinding()] param([switch]$DryRun)
    $root=Get-AlfredRoot
    try {$manifest=Read-AlfredManifest -Root $root} catch {return New-AlfredResult -Command 'sync' -Status 'failed' -Issues @($_.Exception.Message)}
    $changes=@('git submodule sync --recursive','git submodule update --init --recursive (pinned gitlinks only)')
    try {$dirty=@(Get-AlfredDirtyToolIds -Root $root -Manifest $manifest)} catch {return New-AlfredResult -Command 'sync' -Status 'failed' -Issues @('submodule-status-unavailable')}
    if($dirty.Count){return New-AlfredResult -Command 'sync' -Status 'failed' -Changes $changes -Issues @($dirty|ForEach-Object{"submodule-dirty:$_"}) -Data @{writes=$false;advancesLocks=$false}}
    if ($DryRun) {return New-AlfredResult -Command 'sync' -Status 'planned' -Changes $changes -Data @{network=$true;writes=$true;advancesLocks=$false;tools=@($manifest.tools.id)}}
    try {
        & git -C $root submodule sync --recursive
        if ($LASTEXITCODE -ne 0) {throw "git submodule sync exited with code $LASTEXITCODE"}
        & git -C $root submodule update --init --recursive
        if ($LASTEXITCODE -ne 0) {throw "git submodule update exited with code $LASTEXITCODE"}
        New-AlfredResult -Command 'sync' -Status 'ok' -Changes $changes -Data @{advancesLocks=$false}
    } catch {New-AlfredResult -Command 'sync' -Status 'failed' -Changes $changes -Issues @($_.Exception.Message)}
}
Export-ModuleMember -Function Invoke-AlfredSync
