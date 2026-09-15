Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'Config.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'Receipt.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'AlfredScope.psm1') -Force

function Invoke-AlfredFixedProbe {
    param([Parameter(Mandatory)][string]$ProbeId,[Parameter(Mandatory)][string]$Checkout)
    switch ($ProbeId) {
        'knowledge-base-kit.probe' {
            $source=Test-Path -LiteralPath (Join-Path $Checkout 'kb.ps1') -PathType Leaf
            return @{health=$(if($source){'source-present'}else{'unavailable'});configuration='not-assessed-by-umbrella';reasonCodes=@(if(-not $source){'entrypoint-missing'})}
        }
        'skills.probe' {
            $source=Test-Path -LiteralPath (Join-Path $Checkout 'life-knowledge/SKILL.md') -PathType Leaf
            return @{health=$(if($source){'healthy'}else{'unavailable'});configuration='not-required';reasonCodes=@(if(-not $source){'entrypoint-missing'})}
        }
        'fin-value.probe' {
            $source=Test-Path -LiteralPath (Join-Path $Checkout 'packages/dsh-fin-value/src/index.ts') -PathType Leaf
            return @{health=$(if($source){'healthy'}else{'unavailable'});configuration='configured-or-fallback';reasonCodes=@(if(-not $source){'entrypoint-missing'})}
        }
        'maliang.probe' {
            $reasons=[Collections.Generic.List[string]]::new()
            $readmePath=Join-Path $Checkout 'README.md'
            $projectPath=Join-Path $Checkout 'pyproject.toml'
            $versionPath=Join-Path $Checkout 'src/maliang_art/__init__.py'
            foreach($required in @(@{path=$readmePath;reason='source-doc-missing'},@{path=$projectPath;reason='project-metadata-missing'},@{path=$versionPath;reason='version-source-missing'})){
                if(-not(Test-Path -LiteralPath $required.path -PathType Leaf)){$reasons.Add([string]$required.reason)}
            }
            $projectVersion=''
            if($reasons.Count -eq 0){
                $readme=Get-Content -LiteralPath $readmePath -Raw -Encoding UTF8
                $project=Get-Content -LiteralPath $projectPath -Raw -Encoding UTF8
                $versionSource=Get-Content -LiteralPath $versionPath -Raw -Encoding UTF8
                if($readme -notmatch '(?m)^# MaLiang\s*$' -or $readme -notmatch '(?m)^## CLI\s*$'){$reasons.Add('source-doc-invalid')}
                if($project -notmatch '(?m)^name\s*=\s*"maliang-game-art"\s*$' -or $project -notmatch '(?m)^maliang-art\s*=\s*"maliang_art\.cli:main"\s*$'){$reasons.Add('project-identity-invalid')}
                if($project -match '(?m)^version\s*=\s*"([0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?)"\s*$'){$projectVersion=$Matches[1]}else{$reasons.Add('project-version-invalid')}
                $sourceVersion=if($versionSource -match '(?m)^__version__\s*=\s*"([^"]+)"\s*$'){$Matches[1]}else{''}
                if(-not $sourceVersion -or ($projectVersion -and $sourceVersion -ne $projectVersion)){$reasons.Add('source-version-mismatch')}
            }
            return @{health=$(if($reasons.Count -eq 0){'healthy'}else{'unavailable'});configuration='not-required';version=$projectVersion;reasonCodes=$reasons.ToArray()}
        }
        default { throw "Probe is not allowlisted: $ProbeId" }
    }
}

function Get-AlfredModuleFacts {
    param([string]$Root,$Tool)
    $checkout=Resolve-AlfredToolPath -Tool $Tool -Root $Root
    $present=Test-Path -LiteralPath (Join-Path $checkout '.git')
    $expected=Get-AlfredExpectedGitlink -Root $Root -Tool $Tool
    $actual=$null;$dirty=$false
    if($present){$actual=(@(& git -C $checkout rev-parse HEAD 2>$null)|Select-Object -First 1);$dirty=@(& git -C $checkout status --porcelain 2>$null).Count -gt 0}
    $probe=if($present){Invoke-AlfredFixedProbe -ProbeId ([string]$Tool.operations.probe) -Checkout $checkout}else{@{health='unavailable';configuration='unknown';version='';reasonCodes=@('source-not-present')}}
    $sourceVersion=if($probe.ContainsKey('version')){[string]$probe.version}else{''}
    $build=if([string]$Tool.id -eq 'fin-value'){if(Test-Path -LiteralPath (Join-Path $checkout 'packages/dsh-fin-value/dist/index.js') -PathType Leaf){'built'}else{'not-built'}}else{'not-required'}
    $receipt=Read-AlfredInstallReceipt -ToolId ([string]$Tool.id)
    $installable=$Tool.operations.psobject.Properties.Name -contains 'install'
    $receiptSource=if($null -ne $receipt -and $receipt.data.psobject.Properties.Name -contains 'sourceCommit'){[string]$receipt.data.sourceCommit}else{''}
    $receiptCurrent=$null -ne $receipt -and $actual -and $receiptSource -eq [string]$actual
    [ordered]@{
        id=[string]$Tool.id
        source=[ordered]@{state=$(if(-not $present){'not-present'}elseif($expected -and $actual -eq $expected){'pinned'}else{'version-drift'});dirty=[bool]$dirty;managed=$true;version=$(if($sourceVersion){$sourceVersion}else{$null})}
        build=$build
        installation=$(if($receiptCurrent -and [string]$Tool.id -eq 'skills' -and $receipt.data.psobject.Properties.Name -contains 'enabled' -and -not [bool]$receipt.data.enabled){'disabled'}elseif($receiptCurrent){'receipt-current'}elseif($null -ne $receipt){'receipt-stale'}elseif($installable){'not-recorded'}else{'not-required'})
        configuration=[string]$probe.configuration
        health=[string]$probe.health
        freshness=$(if($receiptCurrent){'current'}elseif($null -ne $receipt){'stale'}else{'not-recorded'})
        reasonCodes=@($probe.reasonCodes)+@(if($null -ne $receipt -and -not $receiptCurrent){'receipt-source-mismatch'})
    }
}

function Invoke-AlfredCapabilities {
    [CmdletBinding()] param([switch]$Quick)
    $root=Get-AlfredRoot
    try {$manifest=Read-AlfredManifest -Root $root} catch {return New-AlfredResult -Command 'capabilities' -Status 'failed' -Issues @('manifest-invalid')}
    $moduleFacts=@{};foreach($tool in @($manifest.tools)){$moduleFacts[[string]$tool.id]=Get-AlfredModuleFacts -Root $root -Tool $tool}
    $facts=[Collections.Generic.List[object]]::new()
    foreach($capability in @($manifest.capabilities)){
        $module=$moduleFacts[[string]$capability.module]
        $action=if($module.source.state -eq 'not-present'){'unavailable'}elseif($module.source.state -ne 'pinned' -or $module.source.dirty){'source-attention-required'}elseif($module.build -eq 'not-built'){'bootstrap-required'}elseif($module.installation -in @('not-recorded','receipt-stale')){'install-status-unknown'}elseif($module.health -eq 'unavailable'){'attention-required'}elseif([string]$capability.module -eq 'maliang'){'source-ready'}else{'runtime-verification-required'}
        $facts.Add([ordered]@{
            id=[string]$capability.id;module=[string]$capability.module;summary=[string]$capability.summary
            entryPoints=$capability.entryPoints;mutationPolicy=[string]$capability.mutationPolicy
            facets=[ordered]@{declaration='declared';source=$module.source;build=$module.build;installation=$module.installation;runtimeVisibility='not-assessed-by-cli';configuration=$module.configuration;health=$module.health;freshness=$module.freshness}
            actionability=$action;reasonCodes=@($module.reasonCodes)
        })
    }
    $activation=Get-AlfredActivationStatus -Cwd ([string](Get-Location))
    New-AlfredResult -Command 'capabilities' -Status 'ok' -Data @{schemaVersion='1.0';scope='local-installation';activation=[ordered]@{state=$activation.state;enabled=$activation.enabled;source=$activation.source;reasonCode=$activation.reasonCode;activationModel=$activation.activationModel};capabilities=$facts.ToArray();privacy='local paths, receipt contents, environment values, and credentials are redacted'}
}
Export-ModuleMember -Function Invoke-AlfredCapabilities
