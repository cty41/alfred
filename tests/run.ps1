$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Import-Module (Join-Path $root 'src/Config.psm1') -Force

$manifest = Read-AlfredManifest -Root $root
if (@($manifest.tools).Count -ne 3) { throw 'expected exactly three initial tools' }
if (@($manifest.tools.id | Sort-Object -Unique).Count -ne 3) { throw 'tool ids must be unique' }

$powerShell = if (Get-Command pwsh -ErrorAction SilentlyContinue) { 'pwsh' } else { 'powershell' }
$doctor = & $powerShell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'alfred.ps1') doctor -Quick -Json | ConvertFrom-Json
if ($doctor.command -ne 'doctor') { throw 'doctor result command mismatch' }
if (@($doctor.data.tools).Count -ne 3) { throw 'doctor did not inspect every tool' }

foreach ($command in @('bootstrap','install','update')) {
    $args = @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $root 'alfred.ps1'),$command,'-DryRun','-Json')
    if ($command -eq 'install') { $args += @('-Profile','all','-ActivationRoot',(Join-Path ([IO.Path]::GetTempPath()) 'LifeKnowledge')) }
    $result = & $powerShell @args | ConvertFrom-Json
    if ($result.status -ne 'planned') { throw "$command dry-run was not planned" }
}

$statusBefore = & git -C $root status --porcelain
& $powerShell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'alfred.ps1') bootstrap -DryRun -Json | Out-Null
$statusAfter = & git -C $root status --porcelain
if (($statusBefore -join "`n") -ne ($statusAfter -join "`n")) { throw 'bootstrap dry-run changed repository state' }

'alfred tests passed'
