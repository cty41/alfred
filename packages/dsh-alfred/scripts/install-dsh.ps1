[CmdletBinding()]
param(
  [ValidateSet('web','headless','all')][string]$Profile='all',
  [string]$DshHome=$(if($env:DSH_HOME){$env:DSH_HOME}else{Join-Path $HOME '.dsh'}),
  [string]$DshCheckout=$env:ALFRED_DSH_CHECKOUT,
  [switch]$DryRun,[switch]$Json
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$package=Join-Path $root 'packages\dsh-alfred'
$profiles=if($Profile -eq 'all'){@('web','headless')}else{@($Profile)}
$changes=@('npm ci --ignore-scripts','npm run build')+@($profiles|ForEach-Object{"link dsh-alfred control bundle to profile:$_"})+@('install Alfred persona preset')
function Invoke-Checked([string]$File,[string[]]$Arguments,[string]$WorkingDirectory){Push-Location $WorkingDirectory;try{& $File @Arguments;if($LASTEXITCODE -ne 0){throw "$File exited with code $LASTEXITCODE"}}finally{Pop-Location}}
if($DryRun){$result=[ordered]@{command='install-dsh-alfred';status='planned';changes=$changes;issues=@();data=@{profiles=$profiles;network=$true;writes=$true}}}
else{
  $old=$env:DSH_HOME
  try{
    $env:DSH_HOME=[IO.Path]::GetFullPath($DshHome)
    Invoke-Checked npm @('ci','--ignore-scripts','--no-audit') $root
    Invoke-Checked npm @('run','build') $root
    foreach($name in $profiles){
      if($DshCheckout){$checkout=[IO.Path]::GetFullPath($DshCheckout);Invoke-Checked npm @('run','dsh','--','plugin','--profile',$name,'add',$package) $checkout}
      else{Invoke-Checked npx @('--yes','@deepseek-ai/dsh@0.1.0-rc.7','plugin','--profile',$name,'add',$package) $root}
    }
    $powerShell=if(Get-Command pwsh -ErrorAction SilentlyContinue){'pwsh'}else{'powershell'}
    & $powerShell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'install-preset.ps1') -DshHome $env:DSH_HOME
    if($LASTEXITCODE -ne 0){throw "preset installer exited with code $LASTEXITCODE"}
    $result=[ordered]@{command='install-dsh-alfred';status='ok';changes=$changes;issues=@();data=@{profiles=$profiles;restartRequired=$true}}
  }catch{$result=[ordered]@{command='install-dsh-alfred';status='failed';changes=$changes;issues=@($_.Exception.Message);data=@{profiles=$profiles}}}
  finally{if($null -eq $old){Remove-Item Env:DSH_HOME -ErrorAction SilentlyContinue}else{$env:DSH_HOME=$old}}
}
if($Json){$result|ConvertTo-Json -Depth 8}else{"[$($result.status)] $($result.command)";$result.issues|ForEach-Object{"  issue: $_"}}
if($result.status -eq 'failed'){exit 1}
