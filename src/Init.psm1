Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'Config.psm1')
Import-Module (Join-Path $PSScriptRoot 'Reports.psm1')

function Invoke-KbInit {
    param([Parameter(Mandatory)][string]$VaultPath,[Parameter(Mandatory)][string]$KitPath,[switch]$DryRun)
    $vault = [IO.Path]::GetFullPath($VaultPath)
    $managed = Join-Path $vault '00_System\managed'
    $local = Join-Path $vault '00_System\local'
    $reports = Join-Path $vault '00_System\reports'
    $configTarget = Join-Path $vault 'knowledge-config.json'
    $changes = [Collections.Generic.List[string]]::new()
    foreach($path in @($vault,$managed,$local,$reports,(Join-Path $vault '10_Inbox'),(Join-Path $vault '20_Projects'),(Join-Path $vault '30_Areas'),(Join-Path $vault '40_Resources'),(Join-Path $vault '90_Archive'))){
        if(-not (Test-Path -LiteralPath $path)){ $changes.Add("create directory $path") }
    }
    $changes.Add("copy managed templates to $managed")
    if(-not (Test-Path -LiteralPath $configTarget)){ $changes.Add("create $configTarget") }
    foreach($rootFile in @('README.md','AGENTS.md','RULES.md','SKILLS.md')){
        if(-not (Test-Path -LiteralPath (Join-Path $vault $rootFile))){$changes.Add("create root file $rootFile")}
    }
    $profilePath = Get-KbProfilePath
    $changes.Add("write local profile $profilePath")
    if($DryRun){ return (New-KbResult -Command 'init' -Status 'dry-run' -State 'DISCOVERED' -VaultPath $vault -Changes $changes.ToArray()) }

    New-Item -ItemType Directory -Force -Path $managed,$local,$reports,(Join-Path $vault '10_Inbox'),(Join-Path $vault '20_Projects'),(Join-Path $vault '30_Areas'),(Join-Path $vault '40_Resources'),(Join-Path $vault '90_Archive') | Out-Null
    Copy-Item -Path (Join-Path $KitPath 'templates\managed\*') -Destination $managed -Recurse -Force
    if(-not (Test-Path -LiteralPath $configTarget)){ Copy-Item -LiteralPath (Join-Path $KitPath 'templates\vault\knowledge-config.json') -Destination $configTarget }
    foreach($rootFile in @('README.md','AGENTS.md','RULES.md','SKILLS.md')){
        $target=Join-Path $vault $rootFile
        if(-not (Test-Path -LiteralPath $target)){Copy-Item -LiteralPath (Join-Path $KitPath "templates\vault\$rootFile") -Destination $target}
    }
    $profile = [ordered]@{vaultPath=$vault;kitPath=[IO.Path]::GetFullPath($KitPath);defaultProfile='family';lastVerifiedAt=(Get-Date).ToString('o')}
    Write-KbJson $profile $profilePath
    $commit = try { (git -C $KitPath rev-parse HEAD 2>$null) } catch { $null }
    if(-not $commit){$commit='uncommitted'}
    $lock = [ordered]@{kitVersion='1.0.0';gitCommit=[string]$commit;appliedAt=(Get-Date).ToString('o');schemaVersion='1.0';managedFilesChecksum=$null}
    $lockPath = Join-Path $managed 'kit-lock.json'
    Write-KbJson $lock $lockPath
    $lock.managedFilesChecksum = Get-KbFileTreeHash $managed
    Write-KbJson $lock $lockPath
    # Recalculate once with stable lock content omitted from its own checksum.
    $lock.managedFilesChecksum = Get-KbFileTreeHash $managed
    Write-KbJson $lock $lockPath
    New-KbResult -Command 'init' -Status 'ok' -State 'LINKED' -VaultPath $vault -Changes $changes.ToArray()
}

Export-ModuleMember -Function Invoke-KbInit

