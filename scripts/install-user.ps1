#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Link every flat skill into a user or project skill root.

.DESCRIPTION
    User scope (the default) installs into ~/.agents/skills. Project scope installs
    into <project>/.agents/skills, using -ProjectRoot or the nearest .git ancestor.
    Windows uses directory junctions; macOS/Linux use symbolic links.

    The installer is idempotent and never replaces a real directory/file or a
    link owned by another checkout. It only repairs or prunes links whose targets
    are inside this checkout. -Remove safely removes only links into this checkout.
#>
[CmdletBinding()]
param(
    [ValidateSet('User', 'Project')]
    [string]$Scope = 'User',
    [string]$ProjectRoot,
    [switch]$Remove,
    [switch]$DryRun,
    [switch]$Json
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Split-Path -Parent $PSScriptRoot)).Path
$events = [System.Collections.Generic.List[object]]::new()

function Test-WindowsLike {
    if ($null -ne $IsWindows) { return [bool]$IsWindows }
    return $env:OS -eq 'Windows_NT'
}

function Get-NormalizedPath {
    param([Parameter(Mandatory)][string]$Path, [string]$BasePath)
    if (-not [System.IO.Path]::IsPathRooted($Path) -and $BasePath) {
        $Path = Join-Path $BasePath $Path
    }
    return [System.IO.Path]::GetFullPath($Path).TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
}

function Test-PathInsideCheckout {
    param([Parameter(Mandatory)][string]$Path)
    $candidate = Get-NormalizedPath $Path
    $root = Get-NormalizedPath $repoRoot
    $comparison = if (Test-WindowsLike) { [System.StringComparison]::OrdinalIgnoreCase } else { [System.StringComparison]::Ordinal }
    return $candidate.Equals($root, $comparison) -or $candidate.StartsWith($root + [System.IO.Path]::DirectorySeparatorChar, $comparison)
}

function Add-Event {
    param([string]$Action, [string]$Name, [string]$Path, [string]$Target, [string]$Reason)
    $event = [ordered]@{ action = $Action; name = $Name; path = $Path }
    if ($Target) { $event.target = $Target }
    if ($Reason) { $event.reason = $Reason }
    $events.Add([pscustomobject]$event)
    if (-not $Json) {
        $label = ('[{0,-5}]' -f $Action)
        $detail = if ($Reason) { "$Name ($Reason)" } elseif ($Target) { "$Name -> $Target" } else { $Name }
        Write-Host "$label $detail"
    }
}

function Remove-SkillLink {
    param([Parameter(Mandatory)][string]$Path)
    if ($DryRun) { return }
    if (Test-WindowsLike) {
        & cmd.exe /d /c rmdir "`"$Path`""
        if ($LASTEXITCODE -ne 0) { throw "Failed to remove junction: $Path" }
    } else {
        Remove-Item -LiteralPath $Path -Force
    }
}

function Find-ProjectRoot {
    param([string]$ExplicitRoot)
    if ($ExplicitRoot) {
        return (Resolve-Path -LiteralPath $ExplicitRoot -ErrorAction Stop).Path
    }
    $cursor = (Get-Location).ProviderPath
    while ($cursor) {
        if (Test-Path -LiteralPath (Join-Path $cursor '.git')) { return $cursor }
        $parent = Split-Path -Parent $cursor
        if (-not $parent -or $parent -eq $cursor) { break }
        $cursor = $parent
    }
    throw 'Project scope requires -ProjectRoot or a current directory beneath a .git project.'
}

try {
    if ($Scope -eq 'User' -and $ProjectRoot) {
        throw '-ProjectRoot is only valid with -Scope Project.'
    }
    $resolvedProjectRoot = $null
    if ($Scope -eq 'Project') {
        $resolvedProjectRoot = Find-ProjectRoot $ProjectRoot
        $skillsDir = Join-Path (Join-Path $resolvedProjectRoot '.agents') 'skills'
    } else {
        $skillsDir = Join-Path (Join-Path $HOME '.agents') 'skills'
    }

    if ($Remove) {
        if (Test-Path -LiteralPath $skillsDir) {
            Get-ChildItem -LiteralPath $skillsDir -Force | ForEach-Object {
                if ($null -eq $_.LinkType) {
                    Add-Event 'skip' $_.Name $_.FullName '' 'existing item is not a link'
                    return
                }
                $rawTarget = ($_.Target -join '')
                $target = Get-NormalizedPath $rawTarget (Split-Path -Parent $_.FullName)
                if (Test-PathInsideCheckout $target) {
                    Add-Event 'remove' $_.Name $_.FullName $target 'checkout-owned link'
                    Remove-SkillLink $_.FullName
                } else {
                    Add-Event 'skip' $_.Name $_.FullName $target 'link target is outside this checkout'
                }
            }
        }

        $result = [ordered]@{
            ok = $true
            mode = 'remove'
            scope = $Scope
            projectRoot = $resolvedProjectRoot
            targetRoot = $skillsDir
            dryRun = [bool]$DryRun
            removedCount = @($events | Where-Object { $_.action -eq 'remove' }).Count
            events = @($events)
        }
        if ($Json) { $result | ConvertTo-Json -Depth 6 } else { Write-Host "`n[done ] checkout-owned skill link(s) removed from $skillsDir" -ForegroundColor Green }
        exit 0
    }

    $skills = @(Get-ChildItem -LiteralPath $repoRoot -Directory | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'SKILL.md') } | Sort-Object Name)
    if ($skills.Count -eq 0) { throw 'No flat skills found in repository root.' }

    if (-not (Test-Path -LiteralPath $skillsDir)) {
        Add-Event 'mkdir' '' $skillsDir '' 'skill root missing'
        if (-not $DryRun) { New-Item -ItemType Directory -Path $skillsDir -Force | Out-Null }
    }

    $existingByName = @{}
    if (Test-Path -LiteralPath $skillsDir) {
        Get-ChildItem -LiteralPath $skillsDir -Force | ForEach-Object { $existingByName[$_.Name] = $_ }
    }

    foreach ($skill in $skills) {
        $linkPath = Join-Path $skillsDir $skill.Name
        $existing = $existingByName[$skill.Name]
        if ($existing) {
            if ($null -eq $existing.LinkType) {
                Add-Event 'skip' $skill.Name $linkPath '' 'existing item is not a link'
                continue
            }
            $rawTarget = ($existing.Target -join '')
            $target = Get-NormalizedPath $rawTarget (Split-Path -Parent $existing.FullName)
            $expected = Get-NormalizedPath $skill.FullName
            $comparison = if (Test-WindowsLike) { [System.StringComparison]::OrdinalIgnoreCase } else { [System.StringComparison]::Ordinal }
            if ($target.Equals($expected, $comparison)) {
                Add-Event 'keep' $skill.Name $linkPath $target ''
                continue
            }
            if (-not (Test-PathInsideCheckout $target)) {
                Add-Event 'skip' $skill.Name $linkPath $target 'link target is outside this checkout'
                continue
            }
            Add-Event 'fix' $skill.Name $linkPath $target 'checkout-owned target changed'
            Remove-SkillLink $linkPath
        }

        Add-Event 'link' $skill.Name $linkPath $skill.FullName ''
        if (-not $DryRun) {
            if (Test-WindowsLike) {
                New-Item -ItemType Junction -Path $linkPath -Target $skill.FullName | Out-Null
            } else {
                New-Item -ItemType SymbolicLink -Path $linkPath -Target $skill.FullName | Out-Null
            }
        }
    }

    if (Test-Path -LiteralPath $skillsDir) {
        $known = @($skills | ForEach-Object { $_.Name })
        Get-ChildItem -LiteralPath $skillsDir -Force | Where-Object { $null -ne $_.LinkType -and $known -notcontains $_.Name } | ForEach-Object {
            $rawTarget = ($_.Target -join '')
            $target = Get-NormalizedPath $rawTarget (Split-Path -Parent $_.FullName)
            if (Test-PathInsideCheckout $target) {
                Add-Event 'prune' $_.Name $_.FullName $target 'stale checkout-owned link'
                Remove-SkillLink $_.FullName
            }
        }
    }

    $result = [ordered]@{
        ok = $true
        mode = 'install'
        scope = $Scope
        projectRoot = $resolvedProjectRoot
        targetRoot = $skillsDir
        dryRun = [bool]$DryRun
        skillCount = $skills.Count
        events = @($events)
    }
    if ($Json) { $result | ConvertTo-Json -Depth 6 } else { Write-Host "`n[done ] $($skills.Count) skill link(s) ensured in $skillsDir" -ForegroundColor Green }
    exit 0
} catch {
    if ($Json) {
        [ordered]@{ ok = $false; scope = $Scope; dryRun = [bool]$DryRun; error = $_.Exception.Message; events = @($events) } | ConvertTo-Json -Depth 6
    } else {
        Write-Host "[error] $($_.Exception.Message)" -ForegroundColor Red
    }
    exit 1
}
