[CmdletBinding()]
param(
    [Parameter(Position=0,Mandatory)][ValidateSet('doctor','capabilities','bootstrap','sync','install','update-locks')][string]$Command,
    [switch]$Quick,[switch]$DryRun,[switch]$Json,
    [ValidateSet('web','headless','all')][string]$Profile='all',
    [string]$DshCheckout
)
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'src/Config.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'src/Doctor.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'src/Capabilities.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'src/Bootstrap.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'src/Sync.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'src/Install.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'src/UpdateLocks.psm1') -Force
$result=switch($Command){
 'doctor'{Invoke-AlfredDoctor -Quick:$Quick}
 'capabilities'{Invoke-AlfredCapabilities -Quick:$Quick}
 'bootstrap'{Invoke-AlfredBootstrap -DryRun:$DryRun}
 'sync'{Invoke-AlfredSync -DryRun:$DryRun}
 'install'{Invoke-AlfredInstall -Profile $Profile -DshCheckout $DshCheckout -DryRun:$DryRun}
 'update-locks'{Invoke-AlfredUpdateLocks -DryRun:$DryRun}
}
if($Json){$result|ConvertTo-Json -Depth 14}else{"[$($result.status)] $($result.command)";foreach($change in @($result.changes)){"  change: $change"};foreach($issue in @($result.issues)){"  issue: $issue"}}
if($result.status -in @('failed','issues')){exit 1}
