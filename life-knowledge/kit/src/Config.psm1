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
    $separators = [char[]]@([IO.Path]::DirectorySeparatorChar,[IO.Path]::AltDirectorySeparatorChar)
    $rootFull = [IO.Path]::GetFullPath($Root).TrimEnd($separators) + [IO.Path]::DirectorySeparatorChar
    $pathFull = [IO.Path]::GetFullPath($Path)
    $comparison = if ($env:OS -eq 'Windows_NT') { [StringComparison]::OrdinalIgnoreCase } else { [StringComparison]::Ordinal }
    if (-not $pathFull.StartsWith($rootFull, $comparison)) {
        throw "Path escapes vault boundary: $pathFull"
    }
    return $pathFull
}

function Get-KbFileTreeHash {
    param([Parameter(Mandatory)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    $lines = Get-ChildItem -LiteralPath $Path -Recurse -File -Force |
        Where-Object { $_.Name -ne 'kit-lock.json' -and $_.FullName -notmatch '[\\/]runtime-data[\\/]' } |
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

Export-ModuleMember -Function Get-KbProfilePath,Read-KbJson,Write-KbJson,Resolve-KbVaultPath,Assert-KbPathWithin,Get-KbFileTreeHash
