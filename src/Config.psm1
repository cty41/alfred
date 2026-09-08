Set-StrictMode -Version Latest

function Get-AlfredRoot { [CmdletBinding()] param() [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')) }

function New-AlfredResult {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Command,[Parameter(Mandatory)][ValidateSet('ok','planned','issues','failed')][string]$Status,[object[]]$Changes=@(),[object[]]$Issues=@(),[hashtable]$Data=@{})
    [ordered]@{ command=$Command; status=$Status; timestamp=(Get-Date).ToString('o'); changes=@($Changes); issues=@($Issues); data=$Data }
}

function Get-AlfredExpectedGitlink {
    [CmdletBinding()] param([Parameter(Mandatory)][string]$Root,[Parameter(Mandatory)]$Tool)
    $row=@(& git -C $Root ls-tree HEAD -- ([string]$Tool.path) 2>$null)
    if($LASTEXITCODE -ne 0){throw "Unable to inspect gitlink: $($Tool.id)"}
    if($row.Count -and $row[0] -match '^160000 commit ([0-9a-f]{40})'){return $Matches[1]}
    $null
}

function Test-AlfredRelativeRepoPath {
    param([Parameter(Mandatory)][string]$Path)
    $normalized = $Path.Replace('\','/')
    $normalized -match '^repos/[a-z0-9][a-z0-9-]*$' -and -not [IO.Path]::IsPathRooted($Path) -and -not $normalized.Contains('..')
}

function Read-AlfredManifest {
    [CmdletBinding()] param([string]$Root=(Get-AlfredRoot))
    $path = Join-Path $Root 'alfred.tools.json'
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Manifest missing: $path" }
    $manifest = Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($manifest.schemaVersion -ne '2.0') { throw "Unsupported manifest schemaVersion: $($manifest.schemaVersion)" }
    $ids = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
    $paths = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    $allowedRoles = @('control-kit','skill-pack','dsh-domain-tool')
    $allowedCapabilities = @('vault-control','user-skills','dsh-bundle-web','dsh-bundle-headless')
    $allowedMappings = @{
        'knowledge-base-kit'=@('knowledge-base-kit.bootstrap','knowledge-base-kit.verify','knowledge-base-kit.probe')
        'skills'=@('skills.bootstrap','skills.verify','skills.install','skills.probe')
        'fin-value'=@('fin-value.bootstrap','fin-value.verify','fin-value.install','fin-value.probe')
    }
    if(@($manifest.tools).Count -ne $allowedMappings.Count){throw 'Manifest must declare exactly the managed tool set'}
    foreach ($tool in @($manifest.tools)) {
        $id = [string]$tool.id
        if (-not $allowedMappings.ContainsKey($id) -or -not $ids.Add($id)) { throw "Unknown or duplicate tool id: $id" }
        if (-not (Test-AlfredRelativeRepoPath ([string]$tool.path)) -or ([string]$tool.path).Replace('\','/') -ne "repos/$id") { throw "Tool $id path must be repos/$id" }
        if (-not $paths.Add([string]$tool.path)) { throw "Duplicate tool path: $($tool.path)" }
        if ([string]$tool.repository -notmatch '^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+\.git$') { throw "Invalid repository URL for $id" }
        if ([string]$tool.role -notin $allowedRoles) { throw "Invalid role for $id" }
        $operationNames = @($tool.operations.psobject.Properties.Name)
        foreach ($name in $operationNames) {
            if ($name -notin @('bootstrap','verify','install','probe')) { throw "Invalid operation for ${id}: $name" }
            $mapping = [string]$tool.operations.$name
            if ($mapping -notin $allowedMappings[$id] -or $mapping -ne "$id.$name") { throw "Unsupported operation mapping: $mapping" }
        }
        $actualMappings=@($operationNames|ForEach-Object{[string]$tool.operations.$_}|Sort-Object)
        if(($actualMappings -join "`n") -ne (@($allowedMappings[$id]|Sort-Object) -join "`n")){throw "Incomplete operation mapping for $id"}
        foreach ($capability in @($tool.provides)) { if ([string]$capability -notin $allowedCapabilities) { throw "Invalid capability for ${id}: $capability" } }
    }
    $capabilityIds = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
    $allowedEntries = @{
        'life-knowledge'=@{module='knowledge-base-kit';skills=@('life-knowledge');tools=@();commands=@();mutation='workflow-dependent'}
        'project-knowledge'=@{module='skills';skills=@('knowledge-maintenance');tools=@();commands=@();mutation='workflow-dependent'}
        'development-design'=@{module='skills';skills=@('brainstorming','make-dev-plan','plan-mode-plan-writer');tools=@();commands=@();mutation='workflow-dependent'}
        'manual-qa'=@{module='skills';skills=@('manual-qa-handoff');tools=@();commands=@();mutation='workflow-dependent'}
        'project-documentation'=@{module='skills';skills=@('project-doc-organization');tools=@();commands=@();mutation='workflow-dependent'}
        'skill-authoring'=@{module='skills';skills=@('skill-writing');tools=@();commands=@();mutation='workflow-dependent'}
        'hk-equity-research'=@{module='fin-value';skills=@('fin-value-investment-research');tools=@('fin_value_stock_quote','fin_value_stock_fundamentals','fin_value_financial_statements','fin_value_value_strategy');commands=@();mutation='read-only'}
        'investment-portfolio'=@{module='fin-value';skills=@('fin-value-investment-research');tools=@('fin_value_portfolio_context');commands=@();mutation='read-only'}
        'investment-strategy-write'=@{module='fin-value';skills=@('fin-value-investment-research');tools=@('fin_value_save_portfolio_strategy');commands=@();mutation='workflow-dependent'}
        'investment-ledger'=@{module='fin-value';skills=@('fin-value-investment-research');tools=@('fin_value_prepare_execution','fin_value_commit_execution','fin_value_prepare_initial_position','fin_value_commit_initial_position');commands=@();mutation='confirm-before-write'}
    }
    foreach ($capability in @($manifest.capabilities)) {
        $capabilityId = [string]$capability.id
        if ($capabilityId -notmatch '^[a-z0-9][a-z0-9-]*$' -or -not $capabilityIds.Add($capabilityId) -or -not $allowedEntries.ContainsKey($capabilityId)) { throw "Invalid or duplicate capability id: $capabilityId" }
        $allowed=$allowedEntries[$capabilityId]
        if ([string]$capability.module -ne [string]$allowed.module) { throw "Capability $capabilityId references unsupported module: $($capability.module)" }
        foreach($kind in @('skills','tools','commands')){
            $actualEntry=@($capability.entryPoints.$kind|ForEach-Object{[string]$_}|Sort-Object)
            $allowedEntry=@($allowed.$kind|ForEach-Object{[string]$_}|Sort-Object)
            if(($actualEntry -join "`n") -ne ($allowedEntry -join "`n")){throw "Capability $capabilityId has unsupported ${kind} entry points"}
        }
        $summary = [string]$capability.summary
        if ([string]::IsNullOrWhiteSpace($summary) -or $summary.Length -gt 160 -or $summary -match '[\r\n\0]') { throw "Invalid capability summary: $capabilityId" }
        if (@($capability.keywords).Count -gt 16) { throw "Too many capability keywords: $capabilityId" }
        foreach ($keyword in @($capability.keywords)) { if ([string]::IsNullOrWhiteSpace([string]$keyword) -or ([string]$keyword).Length -gt 40 -or [string]$keyword -match '[\r\n\0]') { throw "Invalid capability keyword: $capabilityId" } }
        if ([string]$capability.mutationPolicy -ne [string]$allowed.mutation) { throw "Invalid mutation policy: $capabilityId" }
    }
    if($capabilityIds.Count -ne $allowedEntries.Count){throw 'Manifest must declare exactly the managed capability set'}
    $manifest
}

function Resolve-AlfredToolPath {
    [CmdletBinding()] param([Parameter(Mandatory)]$Tool,[string]$Root=(Get-AlfredRoot))
    $relative=[string]$Tool.path
    $candidate = [IO.Path]::GetFullPath((Join-Path $Root $relative))
    $reposRoot = [IO.Path]::GetFullPath((Join-Path $Root 'repos')) + [IO.Path]::DirectorySeparatorChar
    if (-not $candidate.StartsWith($reposRoot,[StringComparison]::OrdinalIgnoreCase)) { throw "Tool path escapes repos: $relative" }
    $candidate
}

function Get-AlfredDirtyToolIds {
    [CmdletBinding()] param([Parameter(Mandatory)][string]$Root,[Parameter(Mandatory)]$Manifest)
    $dirty = [Collections.Generic.List[string]]::new()
    foreach ($tool in @($Manifest.tools)) {
        $path = Resolve-AlfredToolPath -Tool $tool -Root $Root
        if (-not (Test-Path -LiteralPath (Join-Path $path '.git'))) { continue }
        $status = @(& git -C $path status --porcelain 2>$null)
        if ($LASTEXITCODE -ne 0) { throw "Unable to inspect submodule: $($tool.id)" }
        if ($status.Count -gt 0) { $dirty.Add([string]$tool.id) }
    }
    $dirty.ToArray()
}

function ConvertTo-AlfredJson { [CmdletBinding()] param([Parameter(Mandatory,ValueFromPipeline)][object]$InputObject) process {$InputObject | ConvertTo-Json -Depth 12} }
Export-ModuleMember -Function Get-AlfredRoot,New-AlfredResult,Read-AlfredManifest,Resolve-AlfredToolPath,Get-AlfredExpectedGitlink,Get-AlfredDirtyToolIds,ConvertTo-AlfredJson
