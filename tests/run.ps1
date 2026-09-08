$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Import-Module (Join-Path $root 'src/Config.psm1') -Force
Import-Module (Join-Path $root 'src/Receipt.psm1') -Force
$manifest=Read-AlfredManifest -Root $root
if(@($manifest.tools).Count -ne 3){throw 'expected exactly three pinned modules'}
if(@($manifest.capabilities).Count -lt 8){throw 'operation-level capability catalog is incomplete'}
if(@($manifest.capabilities.id|Sort-Object -Unique).Count -ne @($manifest.capabilities).Count){throw 'capability ids must be unique'}
$tempManifestRoot=Join-Path ([IO.Path]::GetTempPath()) "alfred-manifest-$([guid]::NewGuid())"
try{
 New-Item -ItemType Directory -Path $tempManifestRoot|Out-Null
 $tampered=Get-Content -LiteralPath (Join-Path $root 'alfred.tools.json') -Raw|ConvertFrom-Json
 ($tampered.capabilities|Where-Object id -eq 'investment-ledger').entryPoints.tools=@('arbitrary_tool')
 $tampered|ConvertTo-Json -Depth 12|Set-Content -LiteralPath (Join-Path $tempManifestRoot 'alfred.tools.json') -Encoding UTF8
 $rejected=$false
 try{Read-AlfredManifest -Root $tempManifestRoot|Out-Null}catch{$rejected=$true}
 if(-not $rejected){throw 'manifest accepted a non-allowlisted tool entry point'}
}finally{Remove-Item -LiteralPath $tempManifestRoot -Recurse -Force -ErrorAction SilentlyContinue}
$powerShell=if(Get-Command pwsh -ErrorAction SilentlyContinue){'pwsh'}else{'powershell'}
$doctor=& $powerShell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'alfred.ps1') doctor -Quick -Json|ConvertFrom-Json
if($doctor.command -ne 'doctor' -or @($doctor.data.tools).Count -ne 3){throw 'doctor did not inspect every module'}
$capabilitySource=Get-Content -LiteralPath (Join-Path $root 'src/Capabilities.psm1') -Raw
if($capabilitySource -match 'ExecutionPolicy|Invoke-Expression'){throw 'read-only capability probe may not execute submodule code'}
$capabilities=& $powerShell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'alfred.ps1') capabilities -Quick -Json|ConvertFrom-Json
if($capabilities.command -ne 'capabilities' -or @($capabilities.data.capabilities).Count -ne @($manifest.capabilities).Count){throw 'capability output mismatch'}
$capJson=$capabilities|ConvertTo-Json -Depth 14
if($capJson -match [regex]::Escape($HOME)){throw 'capability output leaked home path'}
$dryRunStatusBefore=& git -C $root status --porcelain
foreach($command in @('bootstrap','sync','install','update-locks')){
 $args=@('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $root 'alfred.ps1'),$command,'-DryRun','-Json')
 if($command -eq 'install'){$args+=@('-Profile','all')}
 $result=& $powerShell @args|ConvertFrom-Json
 if($result.status -ne 'planned' -and -not ($result.status -eq 'failed' -and (@($result.issues) -join ',') -match 'submodule-(dirty|status-unavailable)')){throw "$command dry-run was not planned or safely blocked"}
}
$dryRunStatusAfter=& git -C $root status --porcelain
if(($dryRunStatusBefore -join "`n") -ne ($dryRunStatusAfter -join "`n")){throw 'a command dry-run changed repository state'}
$missingDsh=Join-Path ([IO.Path]::GetTempPath()) "alfred-missing-dsh-$([guid]::NewGuid())"
$launcher=& $powerShell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'scripts/start-dsh-web.ps1') -DshCheckout $missingDsh -DryRun -Json|ConvertFrom-Json
if($launcher.status -notin @('planned','already-running')){throw 'start launcher dry-run failed'}
$upgrade=& $powerShell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'scripts/upgrade-and-restart-dsh.ps1') -DshCheckout $missingDsh -DryRun -Json|ConvertFrom-Json
if($upgrade.status -ne 'planned' -or $upgrade.data.installPreviewStatus -ne 'planned'){throw 'upgrade launcher dry-run failed'}
$installModule=Import-Module (Join-Path $root 'src/Install.psm1') -Force -PassThru
$tempInstaller=Join-Path ([IO.Path]::GetTempPath()) "alfred-installer-$([guid]::NewGuid()).ps1"
try{
 @'
param([switch]$Json)
[ordered]@{command='fixture';status='failed';issues=@('install-failed:build');data=@{failure=@{component='fin-value';stage='build';command='npm run build';exitCode=7}}}|ConvertTo-Json -Depth 6
exit 7
'@|Set-Content -LiteralPath $tempInstaller -Encoding UTF8
 $execution=& $installModule {param($shell,$script) Invoke-AlfredJsonInstaller -PowerShell $shell -Arguments @('-NoProfile','-ExecutionPolicy','Bypass','-File',$script,'-Json')} $powerShell $tempInstaller
 if($execution.exitCode -ne 7 -or $execution.result.data.failure.stage -ne 'build'){throw 'installer failure JSON was not preserved'}
 if(($execution.result|ConvertTo-Json -Depth 8) -match [regex]::Escape($HOME)){throw 'installer failure JSON leaked home path'}
 $logged=& $installModule {param($shell,$script) Invoke-AlfredLoggedInstaller -PowerShell $shell -Arguments @('-NoProfile','-ExecutionPolicy','Bypass','-File',$script)} $powerShell $tempInstaller
 if(@($logged).Count -ne 1 -or $logged -ne 7){throw 'installer logs polluted the result stream'}
}finally{Remove-Item -LiteralPath $tempInstaller -Force -ErrorAction SilentlyContinue}
Import-Module (Join-Path $root 'src/Receipt.psm1') -Force
$mac=Get-AlfredReceiptRoot -Platform macos
if($mac -notmatch 'Library[\\/]Application Support[\\/]alfred'){throw 'macOS receipt path mismatch'}
$statusBefore=& git -C $root status --porcelain
& $powerShell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'alfred.ps1') bootstrap -DryRun -Json|Out-Null
$statusAfter=& git -C $root status --porcelain
if(($statusBefore -join "`n") -ne ($statusAfter -join "`n")){throw 'bootstrap dry-run changed repository state'}
'alfred tests passed'
