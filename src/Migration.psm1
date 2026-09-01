Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'Config.psm1')
Import-Module (Join-Path $PSScriptRoot 'Reports.psm1')

function Invoke-KbNewProject {
    param([Parameter(Mandatory)][string]$VaultPath,[Parameter(Mandatory)][string]$Name,[switch]$DryRun)
    if($Name -notmatch '^[a-z0-9][a-z0-9-]{1,80}$'){throw 'Project name must be a lowercase slug.'}
    $target = Assert-KbPathWithin $VaultPath (Join-Path $VaultPath "20_Projects\$Name")
    if(Test-Path -LiteralPath $target){throw "Project already exists: $target"}
    $changes=@("create project $target","create README.md")
    if($DryRun){return (New-KbResult -Command 'new-project' -Status 'dry-run' -State 'HEALTHY' -VaultPath $VaultPath -Changes $changes)}
    New-Item -ItemType Directory -Force -Path $target | Out-Null
    "# $Name`n`n- Status: Active`n- Created: $((Get-Date).ToString('yyyy-MM-dd'))`n" | Set-Content -LiteralPath (Join-Path $target 'README.md') -Encoding UTF8
    New-KbResult -Command 'new-project' -Status 'ok' -State 'HEALTHY' -VaultPath $VaultPath -Changes $changes
}

function Invoke-KbIngest {
    param([Parameter(Mandatory)][string]$VaultPath,[Parameter(Mandatory)][string]$Source,[Parameter(Mandatory)][string]$Target,[switch]$DryRun)
    if(-not (Test-Path -LiteralPath $Source)){throw "Source not found: $Source"}
    $targetFull=Assert-KbPathWithin $VaultPath (Join-Path $VaultPath $Target)
    $changes=@("copy $Source -> $targetFull")
    if($DryRun){return (New-KbResult -Command 'ingest' -Status 'dry-run' -State 'HEALTHY' -VaultPath $VaultPath -Changes $changes)}
    $parent=Split-Path -Parent $targetFull; New-Item -ItemType Directory -Force -Path $parent | Out-Null
    if(Test-Path -LiteralPath $targetFull){throw "Target already exists: $targetFull"}
    Copy-Item -LiteralPath $Source -Destination $targetFull -Recurse
    New-KbResult -Command 'ingest' -Status 'ok' -State 'HEALTHY' -VaultPath $VaultPath -Changes $changes
}

function Invoke-KbArchive {
    param([Parameter(Mandatory)][string]$VaultPath,[Parameter(Mandatory)][string]$Project,[switch]$DryRun)
    $source=Assert-KbPathWithin $VaultPath (Join-Path $VaultPath "20_Projects\$Project")
    if(-not (Test-Path -LiteralPath $source)){throw "Project not found: $source"}
    $dest=Assert-KbPathWithin $VaultPath (Join-Path $VaultPath "90_Archive\$((Get-Date).Year)\$Project")
    if(Test-Path -LiteralPath $dest){throw "Archive target exists: $dest"}
    $changes=@("move $source -> $dest")
    if($DryRun){return (New-KbResult -Command 'archive' -Status 'dry-run' -State 'HEALTHY' -VaultPath $VaultPath -Changes $changes)}
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null
    Move-Item -LiteralPath $source -Destination $dest
    New-KbResult -Command 'archive' -Status 'ok' -State 'HEALTHY' -VaultPath $VaultPath -Changes $changes
}

Export-ModuleMember -Function Invoke-KbNewProject,Invoke-KbIngest,Invoke-KbArchive

