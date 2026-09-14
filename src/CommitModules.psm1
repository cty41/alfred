Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'Config.psm1') -Force

function Get-AlfredSubmoduleHead {
    param([Parameter(Mandatory)][string]$Path)
    $head = (@(& git -C $Path rev-parse HEAD 2>$null) | Select-Object -First 1)
    if ($LASTEXITCODE -ne 0 -or -not $head -or $head -notmatch '^[0-9a-f]{40}$') { return $null }
    [string]$head
}

function Test-AlfredSubmoduleDetached {
    param([Parameter(Mandatory)][string]$Path)
    $branch = (@(& git -C $Path rev-parse --abbrev-ref HEAD 2>$null) | Select-Object -First 1)
    if ($LASTEXITCODE -ne 0) { return $true }
    [string]$branch -eq 'HEAD'
}

function Invoke-AlfredCommitModules {
    [CmdletBinding()]
    param(
        [switch]$DryRun,
        [string]$Message,
        [string]$RootMessage,
        [string[]]$Tools
    )
    $root = Get-AlfredRoot
    try { $manifest = Read-AlfredManifest -Root $root } catch {
        return New-AlfredResult -Command 'commit-modules' -Status 'failed' -Issues @($_.Exception.Message)
    }

    $allTools = @($manifest.tools)
    $selected = $allTools
    if ($Tools -and @($Tools).Count -gt 0) {
        $wanted = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
        foreach ($id in @($Tools)) { [void]$wanted.Add([string]$id) }
        $selected = @($allTools | Where-Object { $wanted.Contains([string]$_.id) })
        $known = @($allTools | ForEach-Object { [string]$_.id })
        $unknown = @(@($wanted) | Where-Object { $known -notcontains $_ })
        if ($unknown.Count) {
            return New-AlfredResult -Command 'commit-modules' -Status 'failed' -Issues @($unknown | ForEach-Object { "unknown-tool:$_" })
        }
    }

    $rootCommitMessage = if ($RootMessage) { [string]$RootMessage } else { 'chore: bump managed gitlinks' }
    $changes = [Collections.Generic.List[string]]::new()
    $issues = [Collections.Generic.List[string]]::new()
    $dirtyModules = [Collections.Generic.List[string]]::new()
    $skippedUninitialized = [Collections.Generic.List[string]]::new()
    $requiresMessage = $false
    $wroteSubmodule = $false

    # Pass 1a: validate only — no mutations until every dirty module is acceptable.
    $dirtyWork = [Collections.Generic.List[hashtable]]::new()
    foreach ($tool in $selected) {
        $id = [string]$tool.id
        $path = Resolve-AlfredToolPath -Tool $tool -Root $root
        if (-not (Test-Path -LiteralPath (Join-Path $path '.git'))) {
            $skippedUninitialized.Add($id)
            continue
        }

        $status = @(& git -C $path status --porcelain 2>$null)
        if ($LASTEXITCODE -ne 0) {
            $issues.Add("submodule-status-unavailable:$id")
            continue
        }
        if ($status.Count -eq 0) { continue }

        if (Test-AlfredSubmoduleDetached -Path $path) {
            $issues.Add("submodule-detached:$id")
            continue
        }

        $dirtyModules.Add($id)
        $changes.Add("commit dirty files in $id")
        if ($DryRun) {
            if (-not $Message) { $requiresMessage = $true }
            continue
        }
        if (-not $Message) {
            $issues.Add("message-required:$id")
            continue
        }
        $dirtyWork.Add(@{ id = $id; path = $path })
    }

    if ($issues.Count) {
        return New-AlfredResult -Command 'commit-modules' -Status 'failed' -Changes $changes -Issues @($issues.ToArray()) -Data @{
            dirtyModules = $dirtyModules.ToArray()
            gitlinkBumps = @()
            skippedUninitialized = $skippedUninitialized.ToArray()
            requiresMessage = $requiresMessage
            writes = $false
            network = $false
            pushes = $false
        }
    }

    # Pass 1b: mutate only after validation.
    foreach ($work in $dirtyWork) {
        $id = [string]$work.id
        $path = [string]$work.path
        & git -C $path add -A
        if ($LASTEXITCODE -ne 0) { $issues.Add("git-add-failed:$id"); break }
        & git -C $path commit -m $Message
        if ($LASTEXITCODE -ne 0) { $issues.Add("git-commit-failed:$id"); break }
        $wroteSubmodule = $true
    }

    if ($issues.Count) {
        return New-AlfredResult -Command 'commit-modules' -Status 'failed' -Changes $changes -Issues @($issues.ToArray()) -Data @{
            dirtyModules = $dirtyModules.ToArray()
            gitlinkBumps = @()
            skippedUninitialized = $skippedUninitialized.ToArray()
            requiresMessage = $requiresMessage
            writes = $wroteSubmodule
            network = $false
            pushes = $false
        }
    }

    # Pass 2: compare submodule HEAD vs root gitlink and stage/commit only gitlinks.
    $gitlinkBumps = [Collections.Generic.List[hashtable]]::new()
    foreach ($tool in $selected) {
        $id = [string]$tool.id
        if ($skippedUninitialized -contains $id) { continue }
        $path = Resolve-AlfredToolPath -Tool $tool -Root $root
        if (-not (Test-Path -LiteralPath (Join-Path $path '.git'))) { continue }

        $head = Get-AlfredSubmoduleHead -Path $path
        if (-not $head) { $issues.Add("submodule-head-unavailable:$id"); continue }
        try { $expected = Get-AlfredExpectedGitlink -Root $root -Tool $tool } catch {
            $issues.Add("gitlink-unavailable:$id")
            continue
        }
        if ($expected -ne $head) {
            $fromLabel = if ($expected) { $expected.Substring(0, 7) } else { 'none' }
            $toLabel = $head.Substring(0, 7)
            if ($dirtyModules -contains $id -and $DryRun) {
                $changes.Add("bump gitlink $id (after commit)")
            } else {
                $changes.Add("bump gitlink $id $fromLabel -> $toLabel")
            }
            $gitlinkBumps.Add(@{ id = $id; from = $expected; to = $head })
        }
    }

    if ($issues.Count) {
        return New-AlfredResult -Command 'commit-modules' -Status 'failed' -Changes $changes -Issues @($issues.ToArray()) -Data @{
            dirtyModules = $dirtyModules.ToArray()
            gitlinkBumps = @($gitlinkBumps.ToArray())
            skippedUninitialized = $skippedUninitialized.ToArray()
            requiresMessage = $requiresMessage
            writes = $wroteSubmodule
            network = $false
            pushes = $false
        }
    }

    $nothingToCommit = ($dirtyModules.Count -eq 0 -and $gitlinkBumps.Count -eq 0)
    $data = @{
        dirtyModules = $dirtyModules.ToArray()
        gitlinkBumps = @($gitlinkBumps.ToArray())
        skippedUninitialized = $skippedUninitialized.ToArray()
        requiresMessage = $requiresMessage
        nothingToCommit = $nothingToCommit
        writes = (-not $DryRun -and (-not $nothingToCommit))
        network = $false
        pushes = $false
    }

    if ($DryRun) {
        if (-not $nothingToCommit) { $changes.Add("commit root gitlinks: $rootCommitMessage") }
        return New-AlfredResult -Command 'commit-modules' -Status $(if ($nothingToCommit) { 'ok' } else { 'planned' }) -Changes $changes -Data $data
    }

    if ($nothingToCommit) {
        return New-AlfredResult -Command 'commit-modules' -Status 'ok' -Changes $changes -Data $data
    }

    try {
        if ($gitlinkBumps.Count -gt 0) {
            foreach ($bump in $gitlinkBumps) {
                $tool = @($selected | Where-Object { [string]$_.id -eq [string]$bump.id }) | Select-Object -First 1
                & git -C $root add -- ([string]$tool.path)
                if ($LASTEXITCODE -ne 0) { throw "gitlink-stage-failed:$($bump.id)" }
            }
            & git -C $root commit -m $rootCommitMessage
            if ($LASTEXITCODE -ne 0) { throw 'root-commit-failed' }
        }
        $data.writes = $true
        New-AlfredResult -Command 'commit-modules' -Status 'ok' -Changes $changes -Data $data
    } catch {
        $data.writes = $wroteSubmodule
        New-AlfredResult -Command 'commit-modules' -Status 'failed' -Changes $changes -Issues @($_.Exception.Message) -Data $data
    }
}
Export-ModuleMember -Function Invoke-AlfredCommitModules
