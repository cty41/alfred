Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'Config.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'Receipt.psm1') -Force

function Test-AlfredDshProfileRunning {
    try {
        if($env:OS -eq 'Windows_NT'){$commands=@(Get-CimInstance Win32_Process -ErrorAction Stop|ForEach-Object{[string]$_.CommandLine})}
        else{$commands=@(& ps -ax -o command= 2>$null);if($LASTEXITCODE -ne 0){throw "ps exited with code $LASTEXITCODE"}}
        return [bool]($commands|Where-Object{$_ -match '(apps[/\\]cli[/\\]src[/\\]bin\.ts|@deepseek-ai[/\\]dsh|deepseek-harness).*(\sweb\b|\sheadless\b)'})
    } catch { throw 'Unable to inspect running DSH profiles; refusing installation.' }
}

function Invoke-AlfredJsonInstaller {
    param([string]$PowerShell,[string[]]$Arguments)
    $text = (& $PowerShell @Arguments) -join "`n"
    $exitCode = $LASTEXITCODE
    try { $result = $text | ConvertFrom-Json }
    catch { throw 'installer returned invalid JSON' }
    [pscustomobject]@{exitCode=$exitCode;result=$result}
}

function Invoke-AlfredLoggedInstaller {
    param([string]$PowerShell,[string[]]$Arguments)
    $output = @(& $PowerShell @Arguments 2>&1)
    $exitCode = $LASTEXITCODE
    foreach($line in $output){[Console]::Error.WriteLine([string]$line)}
    $exitCode
}

function Invoke-AlfredInstall {
    [CmdletBinding()] param([ValidateSet('web','headless','all')][string]$Profile='all',[string]$DshCheckout,[switch]$DryRun)
    $root=Get-AlfredRoot
    try{$manifest=Read-AlfredManifest -Root $root}catch{return New-AlfredResult -Command 'install' -Status 'failed' -Issues @('manifest-invalid')}
    $skills=Resolve-AlfredToolPath -Tool ($manifest.tools|Where-Object id -eq 'skills') -Root $root
    $fin=Resolve-AlfredToolPath -Tool ($manifest.tools|Where-Object id -eq 'fin-value') -Root $root
    $scripts=@(
      @{id='skills';checkout=$skills;path=(Join-Path $skills 'scripts/install-user.ps1');args=@()},
      @{id='fin-value';checkout=$fin;path=(Join-Path $fin 'packages/dsh-fin-value/scripts/install-dsh.ps1');args=@('-Profile',$Profile)},
      @{id='alfred-control';checkout=$root;path=(Join-Path $root 'packages/dsh-alfred/scripts/install-dsh.ps1');args=@('-Profile',$Profile)}
    )
    $changes=@('install shared user skills',"install dsh-alfred control bundle for profile:$Profile", "install dsh-fin-value bundle for profile:$Profile",'write non-secret minimal receipts; restart DSH manually')
    if($DryRun){return New-AlfredResult -Command 'install' -Status 'planned' -Changes $changes -Data @{profile=$Profile;localDshCheckout=[bool]$DshCheckout;privatePersistenceConfigured='not-managed-by-alfred-install';writes=$true;restartRequired=$true}}
    if(-not $DshCheckout){return New-AlfredResult -Command 'install' -Status 'failed' -Issues @('dsh-checkout-required')}
    foreach($tool in @($manifest.tools|Where-Object id -in @('skills','fin-value'))){
      $checkout=Resolve-AlfredToolPath -Tool $tool -Root $root
      $expected=Get-AlfredExpectedGitlink -Root $root -Tool $tool
      if(-not $expected -or -not(Test-Path -LiteralPath (Join-Path $checkout '.git'))){return New-AlfredResult -Command 'install' -Status 'failed' -Issues @("submodule-unavailable:$($tool.id)")}
      $actual=(@(& git -C $checkout rev-parse HEAD 2>$null)|Select-Object -First 1)
      $dirty=@(& git -C $checkout status --porcelain 2>$null)
      if($LASTEXITCODE -ne 0){return New-AlfredResult -Command 'install' -Status 'failed' -Issues @("submodule-status-unavailable:$($tool.id)")}
      if($dirty.Count){return New-AlfredResult -Command 'install' -Status 'failed' -Issues @("submodule-dirty:$($tool.id)")}
      if($actual -ne $expected){return New-AlfredResult -Command 'install' -Status 'failed' -Issues @("submodule-version-drift:$($tool.id)")}
    }
    if(Test-AlfredDshProfileRunning){return New-AlfredResult -Command 'install' -Status 'failed' -Issues @('dsh-profile-running') -Data @{requiredAction='stop relevant DSH profiles before install or migration'}}
    $powerShell=if(Get-Command pwsh -ErrorAction SilentlyContinue){'pwsh'}else{'powershell'}
    $results=[Collections.Generic.List[object]]::new();$issues=[Collections.Generic.List[object]]::new()
    foreach($component in $scripts){
      if(-not(Test-Path -LiteralPath $component.path -PathType Leaf)){$issues.Add("installer-missing:$($component.id)");$results.Add(@{id=$component.id;status='failed'});continue}
      $args=@('-NoProfile','-ExecutionPolicy','Bypass','-File',$component.path)+@($component.args)
      if($DshCheckout -and $component.id -ne 'skills'){$args+=@('-DshCheckout',$DshCheckout)}
      try{
        if($component.id -eq 'fin-value'){
          $execution=Invoke-AlfredJsonInstaller -PowerShell $powerShell -Arguments ($args+@('-Json'))
          if($execution.exitCode -ne 0 -or [string]$execution.result.status -ne 'ok'){
            $childIssue=@($execution.result.issues)|Select-Object -First 1
            $suffix=if($childIssue){([string]$childIssue -replace '^install-failed:?','')}else{"status-$([string]$execution.result.status)"}
            $failure=$execution.result.data.failure
            $issues.Add("install-failed:fin-value:$suffix")
            $results.Add(@{id='fin-value';status='failed';failure=$failure})
            continue
          }
        }else{
          $exitCode=Invoke-AlfredLoggedInstaller -PowerShell $powerShell -Arguments $args
          if($exitCode -ne 0){throw 'installer failed'}
        }
        $sourceCommit=(@(& git -C $component.checkout rev-parse HEAD 2>$null)|Select-Object -First 1)
        Write-AlfredInstallReceipt -ToolId $component.id -Data @{rootCommit=(@(& git -C $root rev-parse HEAD)|Select-Object -First 1);sourceCommit=$sourceCommit;profile=$Profile;restartRequired=($component.id -ne 'skills')}|Out-Null
        $results.Add(@{id=$component.id;status='ok'})
      }
      catch{$issues.Add("install-failed:$($component.id)");$results.Add(@{id=$component.id;status='failed'})}
    }
    $failedComponent=@($results.ToArray()|Where-Object status -eq 'failed'|Select-Object -First 1)
    $failure=if($failedComponent.Count -and $failedComponent[0].failure){$failedComponent[0].failure}else{$null}
    New-AlfredResult -Command 'install' -Status $(if($issues.Count){'issues'}else{'ok'}) -Changes $changes -Issues $issues.ToArray() -Data @{profile=$Profile;components=$results.ToArray();privatePersistenceConfigured='not-managed-by-alfred-install';restartRequired=$true;failure=$failure}
}
Export-ModuleMember -Function Invoke-AlfredInstall
