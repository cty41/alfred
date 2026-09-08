Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'Config.psm1') -Force

function Invoke-AlfredChecked {
    param([string]$File,[string[]]$Arguments,[string]$WorkingDirectory)
    Push-Location $WorkingDirectory
    try { & $File @Arguments; if($LASTEXITCODE -ne 0){throw "$File exited with code $LASTEXITCODE"} }
    finally { Pop-Location }
}

function Invoke-AlfredBootstrap {
    [CmdletBinding()] param([switch]$DryRun)
    $root=Get-AlfredRoot
    try{$manifest=Read-AlfredManifest -Root $root}catch{return New-AlfredResult -Command 'bootstrap' -Status 'failed' -Issues @('manifest-invalid')}
    $fin=Resolve-AlfredToolPath -Tool ($manifest.tools|Where-Object id -eq 'fin-value') -Root $root
    $changes=@('sync all submodules to pinned gitlinks','npm ci and build ALF control bundle','npm ci, uv sync --frozen, and build fin-value')
    try {$dirty=@(Get-AlfredDirtyToolIds -Root $root -Manifest $manifest)} catch {return New-AlfredResult -Command 'bootstrap' -Status 'failed' -Issues @('submodule-status-unavailable')}
    if($dirty.Count){return New-AlfredResult -Command 'bootstrap' -Status 'failed' -Changes $changes -Issues @($dirty|ForEach-Object{"submodule-dirty:$_"}) -Data @{writes=$false;advancesLocks=$false}}
    if($DryRun){return New-AlfredResult -Command 'bootstrap' -Status 'planned' -Changes $changes -Data @{network=$true;writes=$true;advancesLocks=$false}}
    $components=[Collections.Generic.List[object]]::new();$issues=[Collections.Generic.List[object]]::new()
    try{Invoke-AlfredChecked git @('submodule','sync','--recursive') $root;Invoke-AlfredChecked git @('submodule','update','--init','--recursive') $root;$components.Add(@{id='submodules';status='ok'})}catch{$issues.Add('submodules-failed');$components.Add(@{id='submodules';status='failed'})}
    if($issues.Count -eq 0){
      try{Invoke-AlfredChecked npm @('ci','--ignore-scripts') $root;Invoke-AlfredChecked npm @('run','build') $root;$components.Add(@{id='alfred-control';status='ok'})}catch{$issues.Add('alfred-control-build-failed');$components.Add(@{id='alfred-control';status='failed'})}
      try{Invoke-AlfredChecked npm @('ci','--ignore-scripts') $fin;Invoke-AlfredChecked uv @('sync','--frozen','--project','data-provider') $fin;Invoke-AlfredChecked npm @('run','build') $fin;$components.Add(@{id='fin-value';status='ok'})}catch{$issues.Add('fin-value-build-failed');$components.Add(@{id='fin-value';status='failed'})}
    }
    New-AlfredResult -Command 'bootstrap' -Status $(if($issues.Count){'failed'}else{'ok'}) -Changes $changes -Issues $issues.ToArray() -Data @{advancesLocks=$false;components=$components.ToArray()}
}
Export-ModuleMember -Function Invoke-AlfredBootstrap
