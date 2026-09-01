[CmdletBinding()]
param(
    [Parameter(Position=0,Mandatory)][ValidateSet('init','doctor','upgrade','new-project','ingest','archive','scan-private','backup')][string]$Command,
    [string]$VaultPath,
    [string]$Name,
    [string]$Source,
    [string]$Target,
    [string]$Project,
    [string]$Path,
    [string]$Destination,
    [switch]$Quick,
    [switch]$DryRun,
    [switch]$Json
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$kitPath=$PSScriptRoot
Import-Module (Join-Path $kitPath 'src\Config.psm1') -Force
Import-Module (Join-Path $kitPath 'src\Discovery.psm1') -Force
Import-Module (Join-Path $kitPath 'src\Reports.psm1') -Force
Import-Module (Join-Path $kitPath 'src\Init.psm1') -Force
Import-Module (Join-Path $kitPath 'src\Doctor.psm1') -Force
Import-Module (Join-Path $kitPath 'src\Upgrade.psm1') -Force
Import-Module (Join-Path $kitPath 'src\Migration.psm1') -Force
Import-Module (Join-Path $kitPath 'src\PrivacyScan.psm1') -Force
Import-Module (Join-Path $kitPath 'src\Backup.psm1') -Force

try {
    $vault=Resolve-KbVaultPath $VaultPath
    switch($Command){
        'init' {
            if(-not $VaultPath){throw 'init requires -VaultPath'}
            $result=Invoke-KbInit -VaultPath $VaultPath -KitPath $kitPath -DryRun:$DryRun
        }
        'doctor' {$result=Invoke-KbDoctor -VaultPath $vault -KitPath $kitPath -Quick:$Quick}
        'upgrade' {
            if(-not $vault){throw 'Vault not found'}
            $result=Invoke-KbUpgrade -VaultPath $vault -KitPath $kitPath -DryRun:$DryRun
        }
        'new-project' {
            if(-not $vault -or -not $Name){throw 'new-project requires a vault and -Name'}
            $result=Invoke-KbNewProject -VaultPath $vault -Name $Name -DryRun:$DryRun
        }
        'ingest' {
            if(-not $vault -or -not $Source -or -not $Target){throw 'ingest requires -Source and -Target'}
            $result=Invoke-KbIngest -VaultPath $vault -Source $Source -Target $Target -DryRun:$DryRun
        }
        'archive' {
            if(-not $vault -or -not $Project){throw 'archive requires -Project'}
            $result=Invoke-KbArchive -VaultPath $vault -Project $Project -DryRun:$DryRun
        }
        'scan-private' {
            $scanPath=if($Path){$Path}elseif($vault){$vault}else{throw 'scan-private requires -Path or a configured vault'}
            $scan=Invoke-KbPrivacyScan -Path $scanPath
            $result=New-KbResult -Command 'scan-private' -Status $(if($scan.findings.Count -eq 0){'ok'}else{'issues'}) -State 'N/A' -VaultPath $vault -Issues $scan.findings -Data @{manualReview=$scan.manualReview}
        }
        'backup' {
            if(-not $vault -or -not $Destination){throw 'backup requires -Destination'}
            $result=Invoke-KbBackup -VaultPath $vault -Destination $Destination -DryRun:$DryRun
        }
    }
    Write-KbOutput -Result $result -Json:$Json
    if($result.status -eq 'issues'){exit 2}
}
catch {
    $failure=New-KbResult -Command $Command -Status 'error' -State 'UNKNOWN' -VaultPath $VaultPath -Issues @($_.Exception.Message)
    Write-KbOutput -Result $failure -Json:$Json
    exit 1
}
