$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Import-Module (Join-Path $root 'src/Config.psm1') -Force
Import-Module (Join-Path $root 'src/Receipt.psm1') -Force
Import-Module (Join-Path $root 'src/AlfredScope.psm1') -Force
$manifest=Read-AlfredManifest -Root $root
if(@($manifest.tools).Count -ne 4){throw 'expected exactly four managed modules'}
$maliang=@($manifest.tools|Where-Object id -eq 'maliang')
if($maliang.Count -ne 1 -or [string]$maliang[0].path -ne 'repos/maliang' -or [string]$maliang[0].repository -ne 'https://github.com/cty41/maliang.git'){throw 'MaLiang source declaration mismatch'}
if((@($maliang[0].operations.psobject.Properties.Name|Sort-Object) -join ',') -ne 'probe,verify'){throw 'MaLiang must expose verify and probe operations only'}
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
 $tampered=Get-Content -LiteralPath (Join-Path $root 'alfred.tools.json') -Raw|ConvertFrom-Json
 ($tampered.capabilities|Where-Object id -eq 'game-art-production').entryPoints.commands=@('powershell -Command arbitrary')
 $tampered|ConvertTo-Json -Depth 12|Set-Content -LiteralPath (Join-Path $tempManifestRoot 'alfred.tools.json') -Encoding UTF8
 $rejected=$false
 try{Read-AlfredManifest -Root $tempManifestRoot|Out-Null}catch{$rejected=$true}
 if(-not $rejected){throw 'manifest accepted an arbitrary MaLiang command'}
}finally{Remove-Item -LiteralPath $tempManifestRoot -Recurse -Force -ErrorAction SilentlyContinue}
$powerShell=if(Get-Command pwsh -ErrorAction SilentlyContinue){'pwsh'}else{'powershell'}
$doctor=& $powerShell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'alfred.ps1') doctor -Quick -Json|ConvertFrom-Json
if($doctor.command -ne 'doctor' -or @($doctor.data.tools).Count -ne 4){throw 'doctor did not inspect every module'}
$capabilitySource=Get-Content -LiteralPath (Join-Path $root 'src/Capabilities.psm1') -Raw
if($capabilitySource -match 'ExecutionPolicy|Invoke-Expression|Start-Process'){throw 'read-only capability probe may not execute submodule code'}
$capabilityModule=Import-Module (Join-Path $root 'src/Capabilities.psm1') -Force -PassThru
$maliangProbeTemp=Join-Path ([IO.Path]::GetTempPath()) "alfred-maliang-probe-$([guid]::NewGuid())"
try{
 New-Item -ItemType Directory -Path (Join-Path $maliangProbeTemp 'src/maliang_art') -Force|Out-Null
 "# MaLiang`n`n## CLI`n"|Set-Content -LiteralPath (Join-Path $maliangProbeTemp 'README.md') -Encoding UTF8
 "[project]`nname = `"maliang-game-art`"`nversion = `"0.1.0`"`n[project.scripts]`nmaliang-art = `"maliang_art.cli:main`"`n"|Set-Content -LiteralPath (Join-Path $maliangProbeTemp 'pyproject.toml') -Encoding UTF8
 "__version__ = `"0.1.0`"`n"|Set-Content -LiteralPath (Join-Path $maliangProbeTemp 'src/maliang_art/__init__.py') -Encoding UTF8
 $maliangProbe=& $capabilityModule {param($checkout) Invoke-AlfredFixedProbe -ProbeId 'maliang.probe' -Checkout $checkout} $maliangProbeTemp
 if($maliangProbe.health -ne 'healthy' -or $maliangProbe.version -ne '0.1.0'){throw 'MaLiang fixed source/version probe failed'}
 "__version__ = `"9.9.9`"`n"|Set-Content -LiteralPath (Join-Path $maliangProbeTemp 'src/maliang_art/__init__.py') -Encoding UTF8
 $maliangProbe=& $capabilityModule {param($checkout) Invoke-AlfredFixedProbe -ProbeId 'maliang.probe' -Checkout $checkout} $maliangProbeTemp
 if($maliangProbe.health -ne 'unavailable' -or 'source-version-mismatch' -notin @($maliangProbe.reasonCodes)){throw 'MaLiang probe accepted mismatched source version'}
}finally{Remove-Item -LiteralPath $maliangProbeTemp -Recurse -Force -ErrorAction SilentlyContinue}
Import-Module (Join-Path $root 'src/Receipt.psm1') -Force
Import-Module (Join-Path $root 'src/AlfredScope.psm1') -Force
$capabilities=& $powerShell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'alfred.ps1') capabilities -Quick -Json|ConvertFrom-Json
if($capabilities.command -ne 'capabilities' -or @($capabilities.data.capabilities).Count -ne @($manifest.capabilities).Count){throw 'capability output mismatch'}
$maliangCapability=@($capabilities.data.capabilities|Where-Object id -eq 'game-art-production')
if($maliangCapability.Count -ne 1 -or [string]$maliangCapability[0].mutationPolicy -ne 'read-only'){throw 'MaLiang read-only capability missing'}
if(-not(Test-Path -LiteralPath (Join-Path $root 'repos/maliang')) -and ($maliangCapability[0].actionability -ne 'unavailable' -or 'source-not-present' -notin @($maliangCapability[0].reasonCodes))){throw 'missing MaLiang source was not reported as expected'}
$capJson=$capabilities|ConvertTo-Json -Depth 14
if($capJson -match [regex]::Escape($HOME)){throw 'capability output leaked home path'}
$dryRunStatusBefore=& git -C $root status --porcelain
foreach($command in @('bootstrap','sync','install','update-locks','commit-modules')){
 $args=@('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $root 'alfred.ps1'),$command,'-DryRun','-Json')
 if($command -eq 'install'){$args+=@('-Profile','all')}
 $result=& $powerShell @args|ConvertFrom-Json
 if($command -eq 'commit-modules'){
  if($result.status -notin @('ok','planned')){throw "commit-modules dry-run was not ok/planned"}
  if($result.data.pushes -ne $false){throw 'commit-modules dry-run must not push'}
  continue
 }
 if($result.status -ne 'planned' -and -not ($result.status -eq 'failed' -and (@($result.issues) -join ',') -match 'submodule-(dirty|status-unavailable)')){throw "$command dry-run was not planned or safely blocked"}
}
$configureArgs=@('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $root 'alfred.ps1'),'configure','-Scope','Project','-ProjectRoot',$root,'-Profile','web','-DshCheckout',$root,'-Enable','-DryRun','-Json')
if(Test-AlfredLegacyGlobalInstall){$configureArgs+='-MigrateLegacy'}
$configure=& $powerShell @configureArgs|ConvertFrom-Json
if($configure.status -ne 'planned'){throw 'configure dry-run was not planned'}
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
Import-Module (Join-Path $root 'src/AlfredScope.psm1') -Force
Import-Module (Join-Path $root 'src/Receipt.psm1') -Force
$scopeTemp=Join-Path ([IO.Path]::GetTempPath()) "alfred-scope-$([guid]::NewGuid())"
try{
 New-Item -ItemType Directory -Path (Join-Path $scopeTemp 'project/.git') -Force|Out-Null
 New-Item -ItemType Directory -Path (Join-Path $scopeTemp 'project/.agents') -Force|Out-Null
 '{"schemaVersion":"1.0","enabled":true}'|Set-Content -LiteralPath (Join-Path $scopeTemp 'project/.agents/alfred.json') -Encoding UTF8
 $scopeStatus=Get-AlfredActivationStatus -Cwd (Join-Path $scopeTemp 'project') -HomePath (Join-Path $scopeTemp 'home') -ReceiptRoot (Join-Path $scopeTemp 'receipts')
 if($scopeStatus.state -ne 'configured-project' -or -not $scopeStatus.enabled){throw 'project activation config was not resolved'}
 '{"schemaVersion":"1.0","enabled":true,"extra":1}'|Set-Content -LiteralPath (Join-Path $scopeTemp 'project/.agents/alfred.json') -Encoding UTF8
 if((Read-AlfredActivationConfig -Path (Join-Path $scopeTemp 'project/.agents/alfred.json')).state -ne 'invalid'){throw 'unknown activation config field was accepted'}
 New-Item -ItemType Directory -Path (Join-Path $scopeTemp 'dsh/profiles/web') -Force|Out-Null
 '{"dsh":{"profile":{"bundles":["dsh-fin-value"],"inactiveBundles":[]}}}'|Set-Content -LiteralPath (Join-Path $scopeTemp 'dsh/profiles/web/package.json') -Encoding UTF8
 if(Test-AlfredLegacyGlobalInstall -ReceiptRoot (Join-Path $scopeTemp 'empty-receipts') -DshHome (Join-Path $scopeTemp 'dsh')){throw 'independent Fin Value install was misclassified as Alfred legacy'}
 '{"dsh":{"profile":{"bundles":["dsh-alfred","dsh-fin-value"],"inactiveBundles":[]}}}'|Set-Content -LiteralPath (Join-Path $scopeTemp 'dsh/profiles/web/package.json') -Encoding UTF8
 if(-not(Test-AlfredLegacyGlobalInstall -ReceiptRoot (Join-Path $scopeTemp 'empty-receipts') -DshHome (Join-Path $scopeTemp 'dsh'))){throw 'legacy Alfred plus Fin Value bundles were not detected'}
 $receiptRoot=Join-Path $scopeTemp 'receipts';Write-AlfredInstallReceipt -ToolId 'alfred-control' -ReceiptRoot $receiptRoot -Data @{activationModel='dispatch-v1';profile='web';profiles=@('web')}|Out-Null
 '{"dsh":{"profile":{"bundles":["dsh-alfred"],"inactiveBundles":["dsh-fin-value"]}}}'|Set-Content -LiteralPath (Join-Path $scopeTemp 'dsh/profiles/web/package.json') -Encoding UTF8
 New-Item -ItemType Directory -Path (Join-Path $scopeTemp 'dsh/profiles/headless') -Force|Out-Null
 '{"dsh":{"profile":{"bundles":["dsh-alfred"],"inactiveBundles":["dsh-fin-value"]}}}'|Set-Content -LiteralPath (Join-Path $scopeTemp 'dsh/profiles/headless/package.json') -Encoding UTF8
 if(-not(Test-AlfredLegacyGlobalInstall -ReceiptRoot $receiptRoot -DshHome (Join-Path $scopeTemp 'dsh'))){throw 'partial dispatch receipt masked an unmigrated profile'}
 Write-AlfredInstallReceipt -ToolId 'alfred-control' -ReceiptRoot $receiptRoot -Data @{activationModel='dispatch-v1';profile='all';profiles=@('web','headless')}|Out-Null
 if(Test-AlfredLegacyGlobalInstall -ReceiptRoot $receiptRoot -DshHome (Join-Path $scopeTemp 'dsh')){throw 'complete dispatch receipt was misclassified as legacy'}
 Write-AlfredInstallReceipt -ToolId 'alfred-control' -ReceiptRoot $receiptRoot -Data @{activationModel='lazy-domain-v1';profile='all';profiles=@('web','headless')}|Out-Null
 '{"dependencies":{"dsh-alfred":"link:alfred","dsh-fin-value":"link:fin"},"dsh":{"profile":{"bundles":["dsh-alfred"]}}}'|Set-Content -LiteralPath (Join-Path $scopeTemp 'dsh/profiles/web/package.json') -Encoding UTF8
 '{"dependencies":{"dsh-alfred":"link:alfred","dsh-fin-value":"link:fin"},"dsh":{"profile":{"bundles":["dsh-alfred"]}}}'|Set-Content -LiteralPath (Join-Path $scopeTemp 'dsh/profiles/headless/package.json') -Encoding UTF8
 if(Test-AlfredLegacyGlobalInstall -ReceiptRoot $receiptRoot -DshHome (Join-Path $scopeTemp 'dsh')){throw 'lazy runtime dependency was misclassified as legacy'}
}finally{Remove-Item -LiteralPath $scopeTemp -Recurse -Force -ErrorAction SilentlyContinue}
$mac=Get-AlfredReceiptRoot -Platform macos
if($mac -notmatch 'Library[\\/]Application Support[\\/]alfred'){throw 'macOS receipt path mismatch'}
$configureModule=Import-Module (Join-Path $root 'src/Configure.psm1') -Force -PassThru
$activationWriteTemp=Join-Path ([IO.Path]::GetTempPath()) "alfred-activation-write-$([guid]::NewGuid())/.agents/alfred.json"
try{
 & $configureModule {param($path) Write-AlfredActivationConfigFile -Path $path -Enabled $true} $activationWriteTemp
 $activationBytes=[IO.File]::ReadAllBytes($activationWriteTemp)
 if($activationBytes.Length -ge 3 -and $activationBytes[0] -eq 0xEF -and $activationBytes[1] -eq 0xBB -and $activationBytes[2] -eq 0xBF){throw 'activation config writer emitted a UTF-8 BOM'}
}finally{Remove-Item -LiteralPath (Split-Path -Parent (Split-Path -Parent $activationWriteTemp)) -Recurse -Force -ErrorAction SilentlyContinue}
$configMigrationTemp=Join-Path ([IO.Path]::GetTempPath()) "alfred-config-migration-$([guid]::NewGuid())"
try{
 New-Item -ItemType Directory -Path $configMigrationTemp|Out-Null
 $webPatch=Join-Path $configMigrationTemp 'web.yml';$headlessPatch=Join-Path $configMigrationTemp 'headless.yml';$presetPath=Join-Path $configMigrationTemp 'agent.cordis.yml'
 "- id: dsh-fin-value`n  config:`n    timeoutMs: 12345`n    tushareToken: local-secret`n"|Set-Content -LiteralPath $webPatch -Encoding UTF8 -NoNewline
 "# headless`n"|Set-Content -LiteralPath $headlessPatch -Encoding UTF8 -NoNewline
 "- id: fin-value`n  name: dsh-fin-value`n  config:`n    timeoutMs: 22222`n"|Set-Content -LiteralPath $presetPath -Encoding UTF8 -NoNewline
 & $configureModule {param($patches,$preset) Move-AlfredFinValueConfigToDispatch -ProfilePatches $patches -PresetPath $preset -ManagedInstall} @($webPatch,$headlessPatch) $presetPath
 $webMigrated=Get-Content -LiteralPath $webPatch -Raw;$headlessMigrated=Get-Content -LiteralPath $headlessPatch -Raw
 if($webMigrated -notmatch 'finValue:' -or $webMigrated -notmatch 'timeoutMs: 12345' -or $webMigrated -notmatch 'tushareToken: local-secret'){throw 'profile Fin Value settings were not moved into dispatch bootstrap config'}
 if($headlessMigrated -notmatch 'finValue:' -or $headlessMigrated -notmatch 'timeoutMs: 22222'){throw 'preset Fin Value settings were not preserved as dispatch fallback'}
 if($webMigrated -match '(?m)^- id: dsh-fin-value$' -or $headlessMigrated -match '(?m)^- id: dsh-alfred$'){throw 'legacy profile patch rows survived dispatch migration'}
}finally{Remove-Item -LiteralPath $configMigrationTemp -Recurse -Force -ErrorAction SilentlyContinue}
& $powerShell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'dispatch-migration.ps1')
if($LASTEXITCODE -ne 0){throw 'dispatch migration regression suite failed'}
$presetTemp=Join-Path ([IO.Path]::GetTempPath()) "alfred-preset-$([guid]::NewGuid())"
$alfredInstallerSource=Get-Content -LiteralPath (Join-Path $root 'packages/dsh-alfred/scripts/install-dsh.ps1') -Raw
if($alfredInstallerSource -notmatch '\[Console\]::Error\.WriteLine' -or $alfredInstallerSource -notmatch 'dump-config.*-Silent' -or $alfredInstallerSource -notmatch '\$null=& \$powerShell @presetArgs'){throw 'Alfred installer does not keep child logs and results out of its JSON stream'}
try{
 & $powerShell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'packages/dsh-alfred/scripts/install-preset.ps1') -DshHome $presetTemp -LegacyGlobal -Json|Out-Null
 $legacyPreset=Get-Content -LiteralPath (Join-Path $presetTemp '.agent-presets/alfred/agent.cordis.yml') -Raw
 if($legacyPreset -match '(?m)^- id: (alf-control|fin-value)$'){throw 'legacy preset duplicated scoped plugins'}
 & $powerShell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'packages/dsh-alfred/scripts/install-preset.ps1') -DshHome $presetTemp -Json|Out-Null
 $scopedPresetPath=Join-Path $presetTemp '.agent-presets/alfred/agent.cordis.yml'
 $scopedPreset=Get-Content -LiteralPath $scopedPresetPath -Raw
 if((Get-Content -LiteralPath (Join-Path $presetTemp '.agent-presets/alfred/preset.yml') -Raw) -notmatch '(?m)^hidden: true$'){throw 'historical Alfred compatibility preset is visible in new-session roster'}
 if($scopedPreset -notmatch '(?m)^- id: alf-control$' -or $scopedPreset -notmatch '(?m)^- id: fin-value$'){throw 'scoped preset plugins missing'}
 $localBlock="# BEGIN managed local Fin Value config`n  config:`n    timeoutMs: 12345`n# END managed local Fin Value config`n"
 $scopedPreset=[regex]::Replace($scopedPreset,'(?m)^(  name: dsh-fin-value\r?\n)',{param($m) $m.Value+$localBlock},1)
 $scopedPreset|Set-Content -LiteralPath $scopedPresetPath -Encoding UTF8 -NoNewline
 & $powerShell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'packages/dsh-alfred/scripts/install-preset.ps1') -DshHome $presetTemp -Json|Out-Null
 if((Get-Content -LiteralPath $scopedPresetPath -Raw) -notmatch 'timeoutMs: 12345'){throw 'scoped preset update discarded local Fin Value settings'}
}finally{Remove-Item -LiteralPath $presetTemp -Recurse -Force -ErrorAction SilentlyContinue}
$statusBefore=& git -C $root status --porcelain
& $powerShell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'alfred.ps1') bootstrap -DryRun -Json|Out-Null
$statusAfter=& git -C $root status --porcelain
if(($statusBefore -join "`n") -ne ($statusAfter -join "`n")){throw 'bootstrap dry-run changed repository state'}
$launcherPreview=(& $powerShell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'scripts/start-dsh-web.ps1') -Port 31999 -DryRun -Json|ConvertFrom-Json)
if($launcherPreview.status -ne 'planned' -or $launcherPreview.data.launcher -ne 'official-registry-package' -or $launcherPreview.data.dshPackage -ne '@deepseek-ai/dsh@0.1.5-rc.2'){throw 'official DSH launcher preview mismatch'}
$upgradePreview=(& $powerShell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'scripts/upgrade-and-restart-dsh.ps1') -Port 31999 -DryRun -Json|ConvertFrom-Json)
if($upgradePreview.status -ne 'planned' -or $upgradePreview.data.launcher -ne 'official-registry-package'){throw 'official DSH upgrade preview mismatch'}
$recoveryTests=@('preview-alfred-session-events.test.ts','alfred-session-repair-codec.test.ts','alfred-session-repair.test.ts','windows-session-repair-safety.test.ts')|ForEach-Object{Join-Path $PSScriptRoot $_}
& node --test @recoveryTests
if($LASTEXITCODE -ne 0){throw 'offline session recovery regression suite failed'}
'alfred tests passed'
