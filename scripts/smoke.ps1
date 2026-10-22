#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Verify a user- or project-scoped installation of this skill pack.
#>
[CmdletBinding()]
param(
    [ValidateSet('User', 'Project')]
    [string]$Scope = 'User',
    [string]$ProjectRoot,
    [switch]$IncludeClaude,
    [switch]$Json
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Split-Path -Parent $PSScriptRoot)).Path
$results = [System.Collections.Generic.List[object]]::new()

function Test-WindowsLike {
    if ($null -ne $IsWindows) { return [bool]$IsWindows }
    return $env:OS -eq 'Windows_NT'
}

function Get-NormalizedPath {
    param([Parameter(Mandatory)][string]$Path, [string]$BasePath)
    if (-not [System.IO.Path]::IsPathRooted($Path) -and $BasePath) { $Path = Join-Path $BasePath $Path }
    return [System.IO.Path]::GetFullPath($Path).TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
}

function Find-ProjectRoot {
    param([string]$ExplicitRoot)
    if ($ExplicitRoot) { return (Resolve-Path -LiteralPath $ExplicitRoot -ErrorAction Stop).Path }
    $cursor = (Get-Location).ProviderPath
    while ($cursor) {
        if (Test-Path -LiteralPath (Join-Path $cursor '.git')) { return $cursor }
        $parent = Split-Path -Parent $cursor
        if (-not $parent -or $parent -eq $cursor) { break }
        $cursor = $parent
    }
    throw 'Project scope requires -ProjectRoot or a current directory beneath a .git project.'
}

function Get-SkillTargetRoots {
    param(
        [Parameter(Mandatory)][string]$Base,
        [Parameter(Mandatory)][string]$ScopeName,
        [bool]$WithClaude
    )
    $roots = [System.Collections.Generic.List[string]]::new()
    $roots.Add((Join-Path (Join-Path $Base '.agents') 'skills'))
    if ($ScopeName -eq 'User' -and $WithClaude) {
        $roots.Add((Join-Path (Join-Path $Base '.claude') 'skills'))
    }
    return @($roots)
}

try {
    if ($Scope -eq 'User' -and $ProjectRoot) { throw '-ProjectRoot is only valid with -Scope Project.' }
    if ($Scope -eq 'Project' -and $IncludeClaude) { throw '-IncludeClaude is only valid with -Scope User.' }
    $resolvedProjectRoot = $null
    $userHome = if (-not [string]::IsNullOrWhiteSpace($env:HOME)) { $env:HOME } else { $HOME }
    $base = if ($Scope -eq 'Project') { $resolvedProjectRoot = Find-ProjectRoot $ProjectRoot; $resolvedProjectRoot } else { $userHome }
    $skillsDirs = Get-SkillTargetRoots -Base $base -ScopeName $Scope -WithClaude ([bool]$IncludeClaude)

    $skills = @(Get-ChildItem -LiteralPath $repoRoot -Directory | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'SKILL.md') } | Sort-Object Name)
    $comparison = if (Test-WindowsLike) { [System.StringComparison]::OrdinalIgnoreCase } else { [System.StringComparison]::Ordinal }

    foreach ($skillsDir in $skillsDirs) {
        if (-not (Test-Path -LiteralPath $skillsDir)) { throw "Skill root does not exist: $skillsDir" }
        foreach ($skill in $skills) {
            $linkPath = Join-Path $skillsDir $skill.Name
            $entry = Get-ChildItem -LiteralPath $skillsDir -Force | Where-Object Name -eq $skill.Name | Select-Object -First 1
            $errorMessage = $null
            $target = $null
            if (-not $entry) { $errorMessage = 'missing link' }
            elseif ($null -eq $entry.LinkType) { $errorMessage = 'not a link' }
            else {
                $target = Get-NormalizedPath ($entry.Target -join '') (Split-Path -Parent $entry.FullName)
                $expected = Get-NormalizedPath $skill.FullName
                if (-not $target.Equals($expected, $comparison)) { $errorMessage = "target mismatch (expected $expected)" }
                elseif (-not (Test-Path -LiteralPath (Join-Path $linkPath 'SKILL.md'))) { $errorMessage = 'SKILL.md unreachable' }
            }
            $ok = $null -eq $errorMessage
            $results.Add([pscustomobject][ordered]@{ name = $skill.Name; ok = $ok; root = $skillsDir; path = $linkPath; target = $target; error = $errorMessage })
            if (-not $Json) {
                $label = if ($skillsDirs.Count -gt 1) { "$($skill.Name) @ $skillsDir" } else { $skill.Name }
                if ($ok) { Write-Host "[ OK ] $label" } else { Write-Host "[FAIL] ${label}: $errorMessage" -ForegroundColor Red }
            }
        }
    }

    $failures = @($results | Where-Object { -not $_.ok }).Count
    $output = [ordered]@{
        ok = $failures -eq 0
        scope = $Scope
        projectRoot = $resolvedProjectRoot
        includeClaude = [bool]$IncludeClaude
        targetRoots = @($skillsDirs)
        skillCount = $skills.Count
        failureCount = $failures
        results = @($results)
    }
    if ($Json) {
        $output | ConvertTo-Json -Depth 6
    } elseif ($failures -eq 0) {
        Write-Host "[smoke] all $($skills.Count) links are valid in $($skillsDirs -join ', ')" -ForegroundColor Green
    }
    if ($failures -gt 0) { exit 1 }
    exit 0
} catch {
    if ($Json) { [ordered]@{ ok = $false; scope = $Scope; includeClaude = [bool]$IncludeClaude; error = $_.Exception.Message; results = @($results) } | ConvertTo-Json -Depth 6 } else { Write-Host "[smoke] $($_.Exception.Message)" -ForegroundColor Red }
    exit 1
}
