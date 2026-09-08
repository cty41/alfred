Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'Config.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'Receipt.psm1') -Force

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
    $probe=if($present){Invoke-AlfredFixedProbe -ProbeId ([string]$Tool.operations.probe) -Checkout $checkout}else{@{health='unavailable';configuration='unknown';reasonCodes=@('source-not-present')}}
    $build=if([string]$Tool.id -eq 'fin-value'){if(Test-Path -LiteralPath (Join-Path $checkout 'packages/dsh-fin-value/dist/index.js') -PathType Leaf){'built'}else{'not-built'}}else{'not-required'}
    $receipt=Read-AlfredInstallReceipt -ToolId ([string]$Tool.id)
    $installable=$Tool.operations.psobject.Properties.Name -contains 'install'
    $receiptSource=if($null -ne $receipt -and $receipt.data.psobject.Properties.Name -contains 'sourceCommit'){[string]$receipt.data.sourceCommit}else{''}
    $receiptCurrent=$null -ne $receipt -and $actual -and $receiptSource -eq [string]$actual
    [ordered]@{
        id=[string]$Tool.id
        source=[ordered]@{state=$(if(-not $present){'not-present'}elseif($expected -and $actual -eq $expected){'pinned'}else{'version-drift'});dirty=[bool]$dirty;managed=$true}
        build=$build
        installation=$(if($receiptCurrent){'receipt-current'}elseif($null -ne $receipt){'receipt-stale'}elseif($installable){'not-recorded'}else{'not-required'})
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
        $action=if($module.source.state -eq 'not-present'){'unavailable'}elseif($module.source.state -ne 'pinned' -or $module.source.dirty){'source-attention-required'}elseif($module.build -eq 'not-built'){'bootstrap-required'}elseif($module.installation -in @('not-recorded','receipt-stale')){'install-status-unknown'}elseif($module.health -eq 'unavailable'){'attention-required'}else{'runtime-verification-required'}
        $facts.Add([ordered]@{
            id=[string]$capability.id;module=[string]$capability.module;summary=[string]$capability.summary
            entryPoints=$capability.entryPoints;mutationPolicy=[string]$capability.mutationPolicy
            facets=[ordered]@{declaration='declared';source=$module.source;build=$module.build;installation=$module.installation;runtimeVisibility='not-assessed-by-cli';configuration=$module.configuration;health=$module.health;freshness=$module.freshness}
            actionability=$action;reasonCodes=@($module.reasonCodes)
        })
    }
    New-AlfredResult -Command 'capabilities' -Status 'ok' -Data @{schemaVersion='1.0';scope='local-installation';capabilities=$facts.ToArray();privacy='local paths, receipt contents, environment values, and credentials are redacted'}
}
Export-ModuleMember -Function Invoke-AlfredCapabilities
