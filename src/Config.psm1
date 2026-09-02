Set-StrictMode -Version Latest

function Get-AlfredRoot {
    [CmdletBinding()]
    param()
    [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
}

function New-AlfredResult {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Command,
        [Parameter(Mandatory)][ValidateSet('ok','planned','issues','failed')][string]$Status,
        [object[]]$Changes = @(),
        [object[]]$Issues = @(),
        [hashtable]$Data = @{}
    )
    [ordered]@{
        command = $Command
        status = $Status
        timestamp = (Get-Date).ToString('o')
        changes = @($Changes)
        issues = @($Issues)
        data = $Data
    }
}

function Read-AlfredManifest {
    [CmdletBinding()]
    param([string]$Root = (Get-AlfredRoot))
    $path = Join-Path $Root 'alfred.tools.json'
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Manifest missing: $path" }
    $manifest = Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($manifest.schemaVersion -ne '1.0') { throw "Unsupported manifest schemaVersion: $($manifest.schemaVersion)" }
    $ids = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
    $allowedRoles = @('control-kit','skill-pack','dsh-domain-tool')
    $allowedVerify = @('kit-tests','skills-validate','fin-tests')
    $allowedCapabilities = @('vault-control','user-skills','dsh-bundle-web','dsh-bundle-headless')
    foreach ($tool in @($manifest.tools)) {
        $id = [string]$tool.id
        if ($id -notmatch '^[a-z0-9][a-z0-9-]*$') { throw "Invalid tool id: $id" }
        if (-not $ids.Add($id)) { throw "Duplicate tool id: $id" }
        $relative = ([string]$tool.path).Replace('\','/')
        if ($relative -ne "repos/$id") { throw "Tool $id path must be repos/$id" }
        if ([IO.Path]::IsPathRooted([string]$tool.path) -or $relative.Contains('..')) { throw "Tool $id path escapes repository" }
        $full = [IO.Path]::GetFullPath((Join-Path $Root ([string]$tool.path)))
        $reposRoot = [IO.Path]::GetFullPath((Join-Path $Root 'repos')) + [IO.Path]::DirectorySeparatorChar
        if (-not $full.StartsWith($reposRoot, [StringComparison]::OrdinalIgnoreCase)) { throw "Tool $id path escapes repos" }
        if ([string]$tool.repository -notmatch '^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+\.git$') { throw "Invalid repository URL for $id" }
        if ([string]$tool.role -notin $allowedRoles) { throw "Invalid role for $id" }
        if ([string]$tool.verify -notin $allowedVerify) { throw "Invalid verify id for $id" }
        foreach ($capability in @($tool.installCapabilities)) {
            if ([string]$capability -notin $allowedCapabilities) { throw "Invalid install capability for ${id}: $capability" }
        }
    }
    $manifest
}

function ConvertTo-AlfredJson {
    [CmdletBinding()]
    param([Parameter(Mandatory, ValueFromPipeline)][object]$InputObject)
    process { $InputObject | ConvertTo-Json -Depth 10 }
}

Export-ModuleMember -Function Get-AlfredRoot,New-AlfredResult,Read-AlfredManifest,ConvertTo-AlfredJson
