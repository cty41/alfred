[CmdletBinding()]
param(
    [Parameter(Position=0,Mandatory)][ValidateSet('doctor','bootstrap','install','update')][string]$Command,
    [switch]$Quick,
    [switch]$DryRun,
    [switch]$Json,
    [ValidateSet('web','headless','all')][string]$Profile = 'all',
    [string]$ActivationRoot,
    [string]$DshCheckout
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'src/Config.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'src/Doctor.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'src/Bootstrap.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'src/Install.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'src/Update.psm1') -Force

$result = switch ($Command) {
    'doctor' { Invoke-AlfredDoctor -Quick:$Quick }
    'bootstrap' { Invoke-AlfredBootstrap -DryRun:$DryRun }
    'install' { Invoke-AlfredInstall -Profile $Profile -ActivationRoot $ActivationRoot -DshCheckout $DshCheckout -DryRun:$DryRun }
    'update' { Invoke-AlfredUpdate -DryRun:$DryRun }
}

if ($Json) { $result | ConvertTo-Json -Depth 10 } else {
    "[$($result.status)] $($result.command)"
    foreach ($change in @($result.changes)) { "  change: $change" }
    foreach ($issue in @($result.issues)) { "  issue: $issue" }
}
if ($result.status -in @('failed','issues')) { exit 1 }
