Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'Config.psm1') -Force

function Invoke-AlfredUpdateLocks {
    [CmdletBinding()] param([switch]$DryRun)
    $root=Get-AlfredRoot
    try {$manifest=Read-AlfredManifest -Root $root} catch {return New-AlfredResult -Command 'update-locks' -Status 'failed' -Issues @($_.Exception.Message)}
    try {$dirty=@(Get-AlfredDirtyToolIds -Root $root -Manifest $manifest)} catch {return New-AlfredResult -Command 'update-locks' -Status 'failed' -Issues @('submodule-status-unavailable')}
    if ($dirty.Count) {return New-AlfredResult -Command 'update-locks' -Status 'failed' -Issues @($dirty | ForEach-Object {"submodule-dirty:$_"})}
    $changes=@('update each managed top-level submodule from its configured remote','roll back every managed checkout if any update fails','review and explicitly commit changed gitlinks')
    if ($DryRun) {return New-AlfredResult -Command 'update-locks' -Status 'planned' -Changes $changes -Data @{maintainerOnly=$true;network=$true;writes=$true;recursiveRemoteUpdate=$false}}

    $original=@{}
    try {
        foreach($tool in @($manifest.tools)){
            $path=Resolve-AlfredToolPath -Tool $tool -Root $root
            $head=(@(& git -C $path rev-parse HEAD 2>$null)|Select-Object -First 1)
            if($LASTEXITCODE -ne 0 -or $head -notmatch '^[0-9a-f]{40}$'){throw "submodule-head-unavailable:$($tool.id)"}
            $original[[string]$tool.id]=[string]$head
        }
        foreach($tool in @($manifest.tools)){
            & git -C $root submodule update --remote -- ([string]$tool.path)
            if($LASTEXITCODE -ne 0){throw "submodule-update-failed:$($tool.id):$LASTEXITCODE"}
        }
        New-AlfredResult -Command 'update-locks' -Status 'ok' -Changes $changes -Data @{requiresCommit=$true;maintainerOnly=$true;recursiveRemoteUpdate=$false}
    } catch {
        $failure=$_.Exception.Message
        $rollbackIssues=[Collections.Generic.List[string]]::new()
        foreach($tool in @($manifest.tools)){
            $id=[string]$tool.id
            if(-not $original.ContainsKey($id)){continue}
            $path=Resolve-AlfredToolPath -Tool $tool -Root $root
            & git -C $path checkout --detach $original[$id] *> $null
            if($LASTEXITCODE -ne 0){$rollbackIssues.Add("rollback-failed:$id");continue}
            & git -C $root submodule update --init --recursive -- ([string]$tool.path) *> $null
            if($LASTEXITCODE -ne 0){$rollbackIssues.Add("nested-rollback-failed:$id")}
        }
        $allIssues=@($failure)+@($rollbackIssues.ToArray())
        New-AlfredResult -Command 'update-locks' -Status 'failed' -Changes $changes -Issues $allIssues -Data @{rolledBack=($rollbackIssues.Count -eq 0)}
    }
}
Export-ModuleMember -Function Invoke-AlfredUpdateLocks
