#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Validate this skills repository before pushing.

.DESCRIPTION
    - nesting audit: rejects any SKILL.md deeper than <root>/<skill-name>/
    - per-skill quick_validate (when the skill-creator validator is installed)
    - relative markdown link check inside every skill directory
    - isolated installer/install-removal tests
    - OKF-lite unit tests

    Exit code 0 = green, 1 = failures.
#>
[CmdletBinding()]
param(
    [switch]$SkipOkf
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Split-Path -Parent $PSScriptRoot)).Path
$failures = 0

function Write-Step([string]$Message) { Write-Host "[validate] $Message" }
function Test-WindowsLike {
    if ($null -ne $IsWindows) { return [bool]$IsWindows }
    return $env:OS -eq 'Windows_NT'
}

# --- 1. nesting audit -------------------------------------------------------
$nested = Get-ChildItem -Path $repoRoot -Recurse -Filter 'SKILL.md' -File | Where-Object {
    $rel = $_.FullName.Substring($repoRoot.Length + 1)
    ($rel -split '[\\/]').Count -ne 2
}
if ($nested) {
    Write-Step 'NESTING AUDIT FAILED:'
    $nested | ForEach-Object { Write-Host "  [FAIL] $($_.FullName)" -ForegroundColor Red }
    $failures++
} else {
    Write-Step 'nesting audit ok (all SKILL.md are one level deep)'
}

# --- 2. per-skill quick_validate --------------------------------------------
$skillDirs = @(
    Get-ChildItem -Path $repoRoot -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'SKILL.md') }
)
if (Test-WindowsLike) {
    $validator = Join-Path (Join-Path $HOME '.codex') 'skills\.system\skill-creator\scripts\quick_validate.py'
} else {
    $validator = Join-Path (Join-Path $HOME '.codex') 'skills/.system/skill-creator/scripts/quick_validate.py'
}
if (Test-Path $validator) {
    $previousEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    foreach ($skill in $skillDirs) {
        Write-Step "quick_validate: $($skill.Name)"
        & python $validator $skill.FullName 2>&1 | ForEach-Object { Write-Host "  $_" }
        if ($LASTEXITCODE -ne 0) { $failures++ }
    }
    $ErrorActionPreference = $previousEap
} else {
    Write-Step 'quick_validate not installed; skipped (validator path checked)'
}

# --- 3. relative markdown link check ----------------------------------------
foreach ($skill in $skillDirs) {
    $mdFiles = Get-ChildItem -Path $skill.FullName -Recurse -Filter '*.md' -File
    foreach ($file in $mdFiles) {
        $content = Get-Content -Path $file.FullName -Raw
        $matches = [regex]::Matches($content, '\]\(([^)]+)\)')
        foreach ($m in $matches) {
            $target = $m.Groups[1].Value
            if ($target -match '^(https?://|#|mailto:|/)') { continue }
            $fragment = $null
            if ($target -match '^(.*?)(#.*)$') { $target = $Matches[1]; $fragment = $Matches[2] }
            if ([string]::IsNullOrWhiteSpace($target)) { continue }
            $resolved = Join-Path $file.DirectoryName $target
            if (-not (Test-Path $resolved)) {
                Write-Host "[FAIL] $($file.FullName): broken link -> $target" -ForegroundColor Red
                $failures++
            }
        }
    }
    Write-Step "link check: $($skill.Name) ok"
}

# --- 4. isolated installer tests --------------------------------------------
Write-Step 'installer unit tests'
$previousEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
& (Join-Path $PSScriptRoot 'test-install-user.ps1') 2>&1 | ForEach-Object { Write-Host "  $_" }
$ErrorActionPreference = $previousEap
if ($LASTEXITCODE -ne 0) { $failures++ }

# --- 5. OKF-lite unit tests -------------------------------------------------
if (-not $SkipOkf) {
    $okfDir = Join-Path (Join-Path $repoRoot 'tools') 'okf-lite'
    if (Test-Path (Join-Path $okfDir 'test_validate_bundle.py')) {
        Write-Step 'OKF-lite unit tests'
        $previousEap = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        & python -m unittest discover -s $okfDir -p 'test_*.py' 2>&1 | ForEach-Object { Write-Host "  $_" }
        $errorActionPreference = $previousEap
        if ($LASTEXITCODE -ne 0) { $failures++ }
    } else {
        Write-Step 'OKF-lite tests not found; skipped'
    }
}

if ($failures -eq 0) {
    Write-Host "[validate] ALL GREEN ($($skillDirs.Count) skills)" -ForegroundColor Green
    exit 0
} else {
    Write-Host "[validate] FAILED ($failures issue groups)" -ForegroundColor Red
    exit 1
}