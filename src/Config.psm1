Set-StrictMode -Version Latest

function Get-KbProfilePath {
    if ($env:LIFE_KNOWLEDGE_PROFILE) { return [IO.Path]::GetFullPath($env:LIFE_KNOWLEDGE_PROFILE) }
    Join-Path $HOME '.config\life-knowledge\profile.json'
}

function Read-KbJson {
    param([Parameter(Mandatory)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    try { return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json) }
    catch { throw "Invalid JSON: $Path. $($_.Exception.Message)" }
}

function Write-KbJson {
    param([Parameter(Mandatory)]$Value,[Parameter(Mandatory)][string]$Path)
    $parent = Split-Path -Parent $Path
    if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
    $Value | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $Path -Encoding UTF8
}

function Resolve-KbVaultPath {
    param([string]$ExplicitPath)
    if ($ExplicitPath) { return [IO.Path]::GetFullPath($ExplicitPath) }
    $profile = Read-KbJson (Get-KbProfilePath)
    if ($profile -and $profile.vaultPath) { return [IO.Path]::GetFullPath([string]$profile.vaultPath) }
    if ($env:LIFE_KNOWLEDGE_HOME) { return [IO.Path]::GetFullPath($env:LIFE_KNOWLEDGE_HOME) }
    foreach ($candidate in @('D:\小米云盘\LifeKnowledge', (Join-Path $HOME 'Xiaomi Cloud\drive\LifeKnowledge'))) {
        if (Test-Path -LiteralPath $candidate) { return [IO.Path]::GetFullPath($candidate) }
    }
    return $null
}

function Assert-KbPathWithin {
    param([Parameter(Mandatory)][string]$Root,[Parameter(Mandatory)][string]$Path)
    $rootFull = [IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
    $pathFull = [IO.Path]::GetFullPath($Path)
    if (-not $pathFull.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Path escapes vault boundary: $pathFull"
    }
    return $pathFull
}

function Get-KbToolCollections {
    param([Parameter(Mandatory)][string]$VaultPath)
    $config = Read-KbJson (Join-Path $VaultPath 'knowledge-config.json')
    $profile = Read-KbJson (Get-KbProfilePath)
    $pathMap = if ($profile -and $profile.PSObject.Properties.Name -contains 'toolCollectionPaths') { $profile.toolCollectionPaths } else { $null }
    $results = [Collections.Generic.List[object]]::new()
    if (-not $config -or -not ($config.PSObject.Properties.Name -contains 'toolCollections')) { return @() }
    foreach ($collection in @($config.toolCollections)) {
        $id = [string]$collection.id
        $localPath = $null
        if ($pathMap -and $pathMap.PSObject.Properties.Name -contains $id) { $localPath = [string]$pathMap.$id }
        $configured = -not [string]::IsNullOrWhiteSpace($localPath)
        $available = $configured -and (Test-Path -LiteralPath $localPath -PathType Container)
        $state = if ($available) { 'available' } elseif ($configured) { 'unavailable' } else { 'unconfigured' }
        $entryPoints = if ($collection.PSObject.Properties.Name -contains 'entryPoints') { $collection.entryPoints } else { [pscustomobject]@{skills=@();tools=@()} }
        $intents = if ($collection.PSObject.Properties.Name -contains 'intents') { @($collection.intents) } else { @() }
        $results.Add([pscustomobject]@{
            id = $id
            repository = [string]$collection.repository
            intents = $intents
            entryPoints = $entryPoints
            state = $state
            available = [bool]$available
            recovery = if ($state -eq 'available') { $null } else { 'Configure or repair this collection through its owning installer.' }
        })
    }
    $results.ToArray()
}

function Get-KbFileTreeHash {
    param([Parameter(Mandatory)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    $lines = Get-ChildItem -LiteralPath $Path -Recurse -File -Force |
        Where-Object { $_.Name -ne 'kit-lock.json' } |
        Sort-Object FullName | ForEach-Object {
            $rootFull = [IO.Path]::GetFullPath($Path).TrimEnd('\') + '\'
            $rel = $_.FullName.Substring($rootFull.Length)
            $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
            "$rel`t$hash"
        }
    $text = [string]::Join("`n", $lines)
    $bytes = [Text.Encoding]::UTF8.GetBytes($text)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-','')) }
    finally { $sha.Dispose() }
}

Export-ModuleMember -Function Get-KbProfilePath,Read-KbJson,Write-KbJson,Resolve-KbVaultPath,Assert-KbPathWithin,Get-KbToolCollections,Get-KbFileTreeHash
