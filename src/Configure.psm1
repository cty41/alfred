Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'Config.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'AlfredScope.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'Receipt.psm1') -Force

function Write-AlfredActivationConfigFile {
    param([Parameter(Mandatory)][string]$Path,[Parameter(Mandatory)][bool]$Enabled)
    $parent=Split-Path -Parent $Path
    New-Item -ItemType Directory -Path $parent -Force|Out-Null
    $temporary="$Path.$([guid]::NewGuid().ToString('N')).tmp"
    try{
        $json=[ordered]@{schemaVersion='1.0';enabled=$Enabled}|ConvertTo-Json
        [IO.File]::WriteAllText($temporary,"$json`n",[Text.UTF8Encoding]::new($false))
        Move-Item -LiteralPath $temporary -Destination $Path -Force
    }
    finally{Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue}
}

function Write-AlfredConfigureLines {
    param([Parameter(Mandatory)][string]$Path,[Parameter(Mandatory)][AllowEmptyCollection()][AllowEmptyString()][string[]]$Lines)
    $temporary="$Path.$([guid]::NewGuid().ToString('N')).tmp"
    try{[IO.File]::WriteAllLines($temporary,$Lines,[Text.UTF8Encoding]::new($false));Move-Item -LiteralPath $temporary -Destination $Path -Force}
    finally{Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue}
}

function Get-AlfredPresetFinValueConfig {
    param([Parameter(Mandatory)][string]$PresetPath)
    if(-not(Test-Path -LiteralPath $PresetPath -PathType Leaf)){return @()}
    $lines=@(Get-Content -LiteralPath $PresetPath -Encoding UTF8)
    $start=-1;$end=$lines.Count
    for($i=0;$i -lt $lines.Count;$i++){if($lines[$i] -match '^\s*-\s+id:\s+fin-value\s*$'){$start=$i;break}}
    if($start -lt 0){return @()}
    for($i=$start+1;$i -lt $lines.Count;$i++){if($lines[$i] -match '^\s*-\s+(id|insert|remove|replace):'){$end=$i;break}}
    $config=-1
    for($i=$start+1;$i -lt $end;$i++){if($lines[$i] -match '^\s{2}config:\s*$'){$config=$i;break}}
    if($config -lt 0 -or $config+1 -ge $end){return @()}
    @($lines[($config+1)..($end-1)])
}

function Test-AlfredDispatchScalarConfig {
    param([string[]]$Lines,[int]$Indent)
    $keys=@{}
    foreach($line in $Lines){
        if(-not $line.Trim() -or $line -match '^\s*#'){continue}
        if($line -notmatch ('^ {'+$Indent+'}([A-Za-z][A-Za-z0-9]*):\s+(.+)$')){throw 'dispatch-config-unsupported'}
        $key=$Matches[1];$value=$Matches[2].Trim()
        if($keys.ContainsKey($key)){throw 'dispatch-config-duplicate-key'};$keys[$key]=$true
        if($value.StartsWith('"')){
            # JSON-compatible double quoted YAML scalars; never echo parser diagnostics.
            try{$decoded=ConvertFrom-Json -InputObject $value -ErrorAction Stop;if($decoded -isnot [string]){throw 'invalid'}}catch{throw 'dispatch-config-invalid'}
        }elseif($value.StartsWith("'")){
            if($value -notmatch "^'(?:[^']|'')*'$" ){throw 'dispatch-config-invalid'}
        }else{
            # Restrict automatic migration to unambiguous single-line scalar values.
            # Flow collections, tags, aliases and multiline forms need manual validation.
            if($value -match '^[!&*|>\[\]{},?%@`"'']' -or $value -match ':(?:\s|$)|\s#|[\[\]{}]' -or $value -match '^-(\s|$)'){throw 'dispatch-config-unsupported'}
        }
    }
}

function Move-AlfredFinValueConfigToDispatch {
    param([Parameter(Mandatory)][string[]]$ProfilePatches,[Parameter(Mandatory)][string]$PresetPath,[switch]$ManagedInstall)
    $fallback=@(Get-AlfredPresetFinValueConfig -PresetPath $PresetPath)
    $financeKeys=@('pythonPath','adapterPath','dbPath','metaDbPath','timeoutMs','confirmationTtlMs','snapshotDirectory','strategyReportPath','snapshotRetention','tushareToken')
    $candidates=[Collections.Generic.List[object]]::new()
    foreach($patchPath in $ProfilePatches){
        if(-not(Test-Path -LiteralPath $patchPath -PathType Leaf)){continue}
        $lines=[Collections.Generic.List[string]]::new();Get-Content -LiteralPath $patchPath -Encoding UTF8|ForEach-Object{[void]$lines.Add([string]$_)}
        $begins=@();$ends=@();$bootstrap=@();$legacy=@()
        for($i=0;$i -lt $lines.Count;$i++){
            if($lines[$i].Trim() -eq '# BEGIN managed ALF dispatch config'){$begins+= $i}
            if($lines[$i].Trim() -eq '# END managed ALF dispatch config'){$ends+= $i}
            if($lines[$i] -match '^\s*-\s+id:\s+dsh-alfred-bootstrap\s*$'){$bootstrap+= $i}
            if($lines[$i] -match '^\s*-\s+id:\s+(dsh-fin-value|dsh-alfred)\s*$'){$legacy+= $i}
        }
        if($begins.Count -or $ends.Count){
            if($begins.Count -ne 1 -or $ends.Count -ne 1 -or $begins[0] -ge $ends[0]){throw 'dispatch-markers-invalid'}
            if($bootstrap.Count -ne 1 -or $bootstrap[0] -le $begins[0] -or $bootstrap[0] -ge $ends[0]){throw 'dispatch-block-invalid'}
            if($legacy.Count){throw 'dispatch-source-conflict'}
            $body=@($lines[($begins[0]+1)..($ends[0]-1)]|Where-Object{ $_.Trim() -and $_ -notmatch '^\s*#' })
            if($body.Count -lt 3 -or $body[0] -ne '- id: dsh-alfred-bootstrap' -or $body[1] -ne '  config:' -or $body[2] -notmatch '^    finValue:(\s*|\s*\{\})$'){throw 'dispatch-block-invalid'}
            if(($body[2] -match '\{\}' -and $body.Count -ne 3) -or ($body[2] -notmatch '\{\}' -and $body.Count -eq 3)){throw 'dispatch-block-invalid'}
            for($i=3;$i -lt $body.Count;$i++){if($body[$i] -notmatch '^      \S' -and $body[$i] -notmatch '^       +\S'){throw 'dispatch-block-invalid'}}
            if($body.Count -gt 3){Test-AlfredDispatchScalarConfig -Lines $body[3..($body.Count-1)] -Indent 6}
            # Current configuration is authoritative, including an explicit empty map.
            # Do not normalize bytes or backfill intentionally removed settings.
            continue
        }
        if($bootstrap.Count){throw 'dispatch-bootstrap-unowned'}
        if($legacy.Count -gt 1){throw 'dispatch-source-conflict'}
        $local=[Collections.Generic.List[string]]::new();$ranges=[Collections.Generic.List[object]]::new()
        for($start=0;$start -lt $lines.Count;$start++){
            if($lines[$start] -notmatch '^\s*-\s+id:\s+(dsh-fin-value|dsh-alfred)\s*$'){continue}
            $rowId=$Matches[1];if(-not $ManagedInstall -or $rowId -eq 'dsh-alfred'){throw "unowned profile patch row requires manual migration: $rowId"};$end=$lines.Count;for($i=$start+1;$i -lt $lines.Count;$i++){if($lines[$i] -match '^\s*-\s+(id|insert|remove|replace):'){$end=$i;break}}
            $config=-1;for($i=$start+1;$i -lt $end;$i++){if($lines[$i] -match '^\s{2}config:\s*$'){$config=$i;continue};if($lines[$i] -match '^\s{2}\S'){throw "unowned Fin Value row shape requires manual migration"};if($lines[$i] -match '^\s{4}([^:#]+):' -and $financeKeys -notcontains $Matches[1].Trim()){throw "unowned Fin Value config key requires manual migration"}}
            if($config -ge 0 -and $rowId -eq 'dsh-fin-value'){for($i=$config+1;$i -lt $end;$i++){[void]$local.Add($lines[$i])}}
            elseif($config -ge 0){for($i=$config+1;$i -lt $end;$i++){if($lines[$i] -match '^\s{4}([^:#]+):' -and $financeKeys -contains $Matches[1].Trim()){[void]$local.Add($lines[$i])}}}
            $ranges.Add([pscustomobject]@{start=$start;count=$end-$start});$start=$end-1
        }
        $ordered=@($ranges.ToArray()|Sort-Object start -Descending);foreach($range in $ordered){$lines.RemoveRange($range.start,$range.count)}
        $selected=@($(if($local.Count){$local.ToArray()}else{$fallback}))
        if($selected.Count){
            Test-AlfredDispatchScalarConfig -Lines $selected -Indent 4
            while($lines.Count -and -not $lines[$lines.Count-1].Trim()){$lines.RemoveAt($lines.Count-1)}
            for($i=$lines.Count-1;$i -ge 0;$i--){if($lines[$i].Trim() -eq '[]'){$lines.RemoveAt($i)}}
            if($lines.Count){[void]$lines.Add('')}
            foreach($line in @('# BEGIN managed ALF dispatch config','- id: dsh-alfred-bootstrap','  config:','    finValue:')){[void]$lines.Add($line)}
            foreach($line in $selected){[void]$lines.Add("  $line")}
            [void]$lines.Add('# END managed ALF dispatch config')
        }
        if(-not($lines|Where-Object{$_ -match '^\s*-\s+'})){[void]$lines.Add('[]')}
        if($ranges.Count -or $selected.Count){$candidates.Add(@{path=$patchPath;lines=$lines.ToArray()})}
    }
    # All profiles must pass preflight before the first replacement.
    foreach($candidate in $candidates){Write-AlfredConfigureLines -Path $candidate.path -Lines $candidate.lines}
}

function Test-AlfredConfigureDshProfileRunning {
    try{
        if($env:OS -eq 'Windows_NT'){$commands=@(Get-CimInstance Win32_Process -ErrorAction Stop|ForEach-Object{[string]$_.CommandLine})}
        else{$commands=@(& ps -ax -o command= 2>$null);if($LASTEXITCODE -ne 0){throw 'ps failed'}}
        [bool]($commands|Where-Object{$_ -match '(apps[/\\]cli[/\\]src[/\\]bin\.ts|@deepseek-ai[/\\]dsh|deepseek-harness).*(\sweb\b|\sheadless\b)'})
    }catch{throw 'Unable to inspect running DSH profiles; refusing migration.'}
}

function Invoke-AlfredConfigureChild {
    param([string]$PowerShell,[string]$Script,[string[]]$Arguments)
    $text=(& $PowerShell -NoProfile -ExecutionPolicy Bypass -File $Script @Arguments -Json) -join "`n";$exitCode=$LASTEXITCODE
    try{$result=$text|ConvertFrom-Json}catch{throw "child-invalid-json:$([IO.Path]::GetFileName($Script))"}
    $accepted=($result.psobject.Properties.Name -contains 'status' -and [string]$result.status -in @('ok','planned')) -or ($result.psobject.Properties.Name -contains 'ok' -and [bool]$result.ok)
    if($exitCode -ne 0 -or -not $accepted){throw "child-failed:$([IO.Path]::GetFileName($Script))"}
    $result
}

function Invoke-AlfredConfigure {
    [CmdletBinding()] param(
        [Parameter(Mandatory)][ValidateSet('User','Project')][string]$Scope,
        [string]$ProjectRoot,
        [ValidateSet('web','headless','all')][string]$Profile='all',[string]$DshCheckout,
        [switch]$Enable,[switch]$Disable,[switch]$MigrateLegacy,[switch]$DryRun
    )
    $root=Get-AlfredRoot
    if([bool]$Enable -eq [bool]$Disable){return New-AlfredResult -Command 'configure' -Status 'failed' -Issues @('choose-exactly-one:Enable-or-Disable')}
    if($Scope -eq 'Project' -and -not $ProjectRoot){return New-AlfredResult -Command 'configure' -Status 'failed' -Issues @('project-root-required')}
    $resolvedProject=if($Scope -eq 'Project'){Find-AlfredProjectRoot -Path $ProjectRoot}else{$null}
    $configPath=if($Scope -eq 'Project'){Get-AlfredProjectConfigPath -ProjectRoot $resolvedProject}else{Get-AlfredUserConfigPath}
    $legacy=Test-AlfredLegacyGlobalInstall
    if($legacy -and -not $MigrateLegacy){return New-AlfredResult -Command 'configure' -Status 'failed' -Issues @('legacy-migration-confirmation-required') -Data @{scope=$Scope;requiredFlag='MigrateLegacy'}}
    if($MigrateLegacy -and -not $legacy){return New-AlfredResult -Command 'configure' -Status 'failed' -Issues @('legacy-install-not-detected')}
    if($legacy -and -not $DshCheckout){return New-AlfredResult -Command 'configure' -Status 'failed' -Issues @('dsh-checkout-required-for-legacy-migration')}
    $skills=Join-Path $root 'repos/skills/scripts/install-user.ps1'
    $fin=Join-Path $root 'repos/fin-value/packages/dsh-fin-value/scripts/install-dsh.ps1'
    $alf=Join-Path $root 'packages/dsh-alfred/scripts/install-dsh.ps1'
    $presetInstaller=Join-Path $root 'packages/dsh-alfred/scripts/install-preset.ps1'
    foreach($script in @($skills,$fin,$alf,$presetInstaller)){if(-not(Test-Path -LiteralPath $script -PathType Leaf)){return New-AlfredResult -Command 'configure' -Status 'failed' -Issues @("installer-missing:$([IO.Path]::GetFileName($script))")}}
    $changes=@("write $Scope Alfred activation configuration: $(if($Enable){'enable'}else{'disable'})","$(if($Enable){'install'}else{'remove'}) Alfred-managed Skills in $Scope scope")
    if($legacy){$changes+=@('remove legacy user-global Skill links when moving to project/disabled scope',"keep Fin Value as a plain profile dependency for profile:$Profile", "migrate legacy/scoped ALF activation to lazy-domain-v1 for profile:$Profile")}
    if($DryRun){return New-AlfredResult -Command 'configure' -Status 'planned' -Changes $changes -Data @{scope=$Scope;enabled=[bool]$Enable;legacyMigration=$legacy;profile=$Profile;activationModel='lazy-domain-v1';writes=$true;restartRequired=$legacy}}
    if($legacy -and (Test-AlfredConfigureDshProfileRunning)){return New-AlfredResult -Command 'configure' -Status 'failed' -Issues @('dsh-profile-running')}

    $oldExists=Test-Path -LiteralPath $configPath -PathType Leaf;$oldContent=if($oldExists){Get-Content -LiteralPath $configPath -Raw -Encoding UTF8}else{$null}
    $powerShell=if(Get-Command pwsh -ErrorAction SilentlyContinue){'pwsh'}else{'powershell'}
    $profileBackups=@()
    if($legacy){
        $dshHome=if($env:DSH_HOME){$env:DSH_HOME}else{Join-Path $HOME '.dsh'}
        foreach($name in $(if($Profile -eq 'all'){@('web','headless')}else{@($Profile)})){
            $profilePath=Join-Path $dshHome "profiles/$name";$backupPath=Join-Path ([IO.Path]::GetTempPath()) "alfred-profile-$name-$([guid]::NewGuid())"
            New-Item -ItemType Directory -Path $backupPath -Force|Out-Null;$entries=@()
            foreach($file in @('package.json','pnpm-lock.yaml','pnpm-workspace.yaml','cordis.patch.yml')){
                $source=Join-Path $profilePath $file;$exists=Test-Path -LiteralPath $source -PathType Leaf
                if($exists){Copy-Item -LiteralPath $source -Destination (Join-Path $backupPath $file)}
                $entries+=@{name=$file;exists=$exists}
            }
            $profileBackups+=@{profilePath=$profilePath;backupPath=$backupPath;entries=$entries}
        }
    }
    $presetTarget=if($legacy){Join-Path $dshHome '.agent-presets/alfred'}else{$null};$presetExisted=$legacy -and (Test-Path -LiteralPath $presetTarget -PathType Container);$presetBackup=$null
    if($presetExisted){$presetBackup=Join-Path ([IO.Path]::GetTempPath()) "alfred-preset-$([guid]::NewGuid())";Copy-Item -LiteralPath $presetTarget -Destination $presetBackup -Recurse}
    $receiptRoot=Get-AlfredReceiptRoot;$receiptSnapshots=@{}
    foreach($toolId in @('skills','alfred-control')){$receiptPath=Join-Path $receiptRoot "$toolId.json";$receiptSnapshots[$toolId]=@{path=$receiptPath;exists=(Test-Path -LiteralPath $receiptPath -PathType Leaf);content=$(if(Test-Path -LiteralPath $receiptPath -PathType Leaf){Get-Content -LiteralPath $receiptPath -Raw -Encoding UTF8}else{$null})}}
    try{
        Write-AlfredActivationConfigFile -Path $configPath -Enabled ([bool]$Enable)
        if($legacy){
            Invoke-AlfredConfigureChild -PowerShell $powerShell -Script $presetInstaller -Arguments @('-DshHome',$dshHome)|Out-Null
            $profileNames=@($(if($Profile -eq 'all'){@('web','headless')}else{@($Profile)}))
            $profilePatches=@($profileNames|ForEach-Object{Join-Path $dshHome "profiles/$_/cordis.patch.yml"})
            Invoke-AlfredConfigureChild -PowerShell $powerShell -Script $alf -Arguments @('-Profile',$Profile,'-DshCheckout',$DshCheckout,'-MigrateScoped')|Out-Null
            Invoke-AlfredConfigureChild -PowerShell $powerShell -Script $fin -Arguments @('-Profile',$Profile,'-DshCheckout',$DshCheckout,'-RuntimeOnly')|Out-Null
            $configPreset=if($presetBackup){Join-Path $presetBackup 'agent.cordis.yml'}else{Join-Path $presetTarget 'agent.cordis.yml'}
            $managedProfiles=@()
            if($receiptSnapshots['alfred-control'].exists){$prior=$receiptSnapshots['alfred-control'].content|ConvertFrom-Json;if($prior.data.psobject.Properties.Name -contains 'managedProfiles'){$managedProfiles=@($prior.data.managedProfiles)}elseif($prior.data.psobject.Properties.Name -contains 'profiles'){$managedProfiles=@($prior.data.profiles)}elseif([string]$prior.data.profile -eq 'all'){$managedProfiles=@('web','headless')}elseif($prior.data.profile){$managedProfiles=@([string]$prior.data.profile)}}
            $managedInstall=@($profileNames|Where-Object{$_ -notin $managedProfiles}).Count -eq 0
            Move-AlfredFinValueConfigToDispatch -ProfilePatches $profilePatches -PresetPath $configPreset -ManagedInstall:$managedInstall
            Push-Location $DshCheckout
            try{foreach($name in $profileNames){$null=& npm run dsh -- --profile $name --dump-config 2>&1;if($LASTEXITCODE -ne 0){throw "dispatch profile validation failed: $name"}}}
            finally{Pop-Location}
            if($Scope -eq 'Project' -or $Disable){Invoke-AlfredConfigureChild -PowerShell $powerShell -Script $skills -Arguments @('-Scope','User','-Remove')|Out-Null}
        }
        $skillArgs=@('-Scope',$Scope);if($resolvedProject){$skillArgs+=@('-ProjectRoot',$resolvedProject)};if($Disable){$skillArgs+='-Remove'}
        Invoke-AlfredConfigureChild -PowerShell $powerShell -Script $skills -Arguments $skillArgs|Out-Null
        $skillsCheckout=Join-Path $root 'repos/skills'
        Write-AlfredInstallReceipt -ToolId 'skills' -Data @{rootCommit=(@(& git -C $root rev-parse HEAD)|Select-Object -First 1);sourceCommit=(@(& git -C $skillsCheckout rev-parse HEAD)|Select-Object -First 1);profile='filesystem';activationModel='lazy-domain-v1';scope=$Scope;enabled=[bool]$Enable;restartRequired=$false}|Out-Null
        if($legacy){
            $migratedProfiles=@($profileNames)
            try{$priorReceipt=Read-AlfredInstallReceipt -ToolId 'alfred-control';if([string]$priorReceipt.data.activationModel -in @('dispatch-v1','lazy-domain-v1')){$migratedProfiles=@($migratedProfiles+@($priorReceipt.data.profiles)|Sort-Object -Unique)}}catch{}
            Write-AlfredInstallReceipt -ToolId 'alfred-control' -Data @{rootCommit=(@(& git -C $root rev-parse HEAD)|Select-Object -First 1);sourceCommit=(@(& git -C $root rev-parse HEAD)|Select-Object -First 1);profile=$Profile;profiles=$migratedProfiles;managedProfiles=$managedProfiles;activationModel='lazy-domain-v1';restartRequired=$true}|Out-Null
        }
        foreach($backup in $profileBackups){Remove-Item -LiteralPath $backup.backupPath -Recurse -Force -ErrorAction SilentlyContinue}
        if($presetBackup){Remove-Item -LiteralPath $presetBackup -Recurse -Force -ErrorAction SilentlyContinue}
        New-AlfredResult -Command 'configure' -Status 'ok' -Changes $changes -Data @{scope=$Scope;enabled=[bool]$Enable;legacyMigration=$legacy;profile=$Profile;activationModel='lazy-domain-v1';restartRequired=$legacy}
    }catch{
        if($legacy){
            try{
                $projectArgs=@('-Scope','Project','-ProjectRoot',$resolvedProject,'-Remove');if($Scope -eq 'Project'){Invoke-AlfredConfigureChild -PowerShell $powerShell -Script $skills -Arguments $projectArgs|Out-Null}
                Invoke-AlfredConfigureChild -PowerShell $powerShell -Script $skills -Arguments @('-Scope','User')|Out-Null
            }catch{}
            try{if(Test-Path -LiteralPath $presetTarget -PathType Container){Remove-Item -LiteralPath $presetTarget -Recurse -Force};if($presetExisted){Move-Item -LiteralPath $presetBackup -Destination $presetTarget}}catch{}
        }
        foreach($snapshot in $receiptSnapshots.Values){try{if($snapshot.exists){New-Item -ItemType Directory -Path (Split-Path -Parent $snapshot.path) -Force|Out-Null;$snapshot.content|Set-Content -LiteralPath $snapshot.path -Encoding UTF8 -NoNewline}else{Remove-Item -LiteralPath $snapshot.path -Force -ErrorAction SilentlyContinue}}catch{}}
        $recoveryBackups=[Collections.Generic.List[string]]::new()
        foreach($backup in $profileBackups){
            $restored=$false
            try{
                New-Item -ItemType Directory -Path $backup.profilePath -Force|Out-Null
                foreach($entry in $backup.entries){$destination=Join-Path $backup.profilePath $entry.name;if($entry.exists){Copy-Item -LiteralPath (Join-Path $backup.backupPath $entry.name) -Destination $destination -Force}else{Remove-Item -LiteralPath $destination -Force -ErrorAction SilentlyContinue}}
                $restored=$true
            }catch{[void]$recoveryBackups.Add([IO.Path]::GetFileName([string]$backup.backupPath))}
            if($restored){Remove-Item -LiteralPath $backup.backupPath -Recurse -Force -ErrorAction SilentlyContinue}
        }
        try{if($oldExists){$oldContent|Set-Content -LiteralPath $configPath -Encoding UTF8 -NoNewline}else{Remove-Item -LiteralPath $configPath -Force -ErrorAction SilentlyContinue}}catch{}
        New-AlfredResult -Command 'configure' -Status 'failed' -Changes $changes -Issues @($_.Exception.Message) -Data @{scope=$Scope;enabled=[bool]$Enable;legacyMigration=$legacy;recoveryBackups=$recoveryBackups.ToArray()}
    }
}

Export-ModuleMember -Function Invoke-AlfredConfigure
