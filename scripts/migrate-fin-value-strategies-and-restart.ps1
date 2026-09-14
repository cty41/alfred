[CmdletBinding()]
param(
    [string]$AlfredCheckout,
    [string]$DshCheckout = $env:DEEPSEEK_HARNESS_CHECKOUT,
    [string]$TrustedHost = $env:DSH_TRUSTED_HOST,
    [int]$Port = 3080,
    [switch]$DryRun,
    [switch]$ConfirmMigration,
    [switch]$Json
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Emit([System.Collections.IDictionary]$Result) {
    if ($Json) { $Result | ConvertTo-Json -Depth 8 }
    else {
        "[$($Result.status)] $($Result.command)"
        foreach ($change in @($Result.changes)) { "  change: $change" }
        foreach ($issue in @($Result.issues)) { "  issue: $issue" }
    }
}

function Get-DshProcesses {
    if ($env:OS -ne 'Windows_NT') { throw 'This migration helper currently requires Windows process inspection.' }
    @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {
        [string]$_.CommandLine -match '(apps[/\\]cli[/\\]src[/\\]bin\.ts|@deepseek-ai[/\\]dsh|deepseek-harness).*(\sweb\b|\sheadless\b)'
    })
}

function Get-FinValueDatabasePath([string]$DshHome) {
    $patch = Join-Path $DshHome 'profiles\web\cordis.patch.yml'
    if (-not (Test-Path -LiteralPath $patch -PathType Leaf)) { throw 'web-profile-patch-missing' }
    $content = Get-Content -LiteralPath $patch -Raw
    $match = [regex]::Match($content, '(?m)^\s+dbPath:\s*["'']?([^"''\r\n]+)')
    if (-not $match.Success) { throw 'fin-value-db-path-missing' }
    $path = $match.Groups[1].Value.Trim()
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw 'fin-value-db-missing' }
    return $path
}

function Invoke-Migration([string]$Node,[string]$Script,[string]$Database,[switch]$Apply) {
    $arguments = @($Script, '--source-db', $Database, '--json')
    if ($Apply) { $arguments += @('--apply', '--profiles-stopped') }
    $raw = (& $Node @arguments) -join "`n"
    if ($LASTEXITCODE -notin @(0, 2)) { throw "migration-command-failed:$LASTEXITCODE" }
    try { return $raw | ConvertFrom-Json } catch { throw 'migration-returned-invalid-json' }
}

try {
    if ([string]::IsNullOrWhiteSpace($AlfredCheckout)) { $AlfredCheckout = Split-Path -Parent $PSScriptRoot }
    if ([string]::IsNullOrWhiteSpace($DshCheckout)) { $DshCheckout = Join-Path (Split-Path -Parent $AlfredCheckout) 'deepseek-harness' }
    $alfred = [IO.Path]::GetFullPath($AlfredCheckout)
    $dsh = [IO.Path]::GetFullPath($DshCheckout)
    $dshHome = [IO.Path]::GetFullPath($(if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME '.dsh' }))
    $migrationScript = Join-Path $alfred 'repos\fin-value\scripts\migrate-portfolio-strategies.mjs'
    $startScript = Join-Path $alfred 'scripts\start-dsh-web.ps1'
    if (-not (Test-Path -LiteralPath $migrationScript -PathType Leaf)) { throw 'migration-script-missing' }
    if (-not (Test-Path -LiteralPath $startScript -PathType Leaf)) { throw 'start-script-missing' }
    $node = (Get-Command node -ErrorAction Stop).Source
    $database = Get-FinValueDatabasePath $dshHome
    $preview = Invoke-Migration $node $migrationScript $database
    $summary = [ordered]@{
        schema = $preview.data.schema
        legacyPortfolioRows = $preview.data.legacyPortfolioRows
        legacyActiveRows = $preview.data.legacyActiveRows
        plannedStrategies = @($preview.data.plannedStrategies).Count
        plannedInstrumentIds = @($preview.data.plannedStrategies | ForEach-Object { $_.instrumentId } | Sort-Object -Unique)
    }
    if ($preview.status -ne 'planned') { throw "migration-preflight-$($preview.status):$(@($preview.issues) -join ',')" }
    $changes = @('stop DSH web/headless processes','apply canonical Fin Value strategy migration with a separate backup','restart DSH Web')
    if ($DryRun) {
        Emit ([ordered]@{ command='migrate-fin-value-strategies-and-restart';status='planned';changes=$changes;issues=@();data=$summary })
        exit 0
    }
    if (-not $ConfirmMigration) {
        $answer = Read-Host 'Type YES to stop DSH, migrate the local Fin Value strategy schema, and restart'
        if ($answer -cne 'YES') {
            Emit ([ordered]@{ command='migrate-fin-value-strategies-and-restart';status='cancelled';changes=@();issues=@();data=@{modified=$false} })
            exit 0
        }
    }
    $processes = @(Get-DshProcesses)
    foreach ($process in $processes) { Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop }
    foreach ($process in $processes) { Wait-Process -Id $process.ProcessId -Timeout 15 -ErrorAction SilentlyContinue }
    if (@(Get-DshProcesses).Count -gt 0) { throw 'dsh-process-did-not-stop; migration was not started' }
    $applied = Invoke-Migration $node $migrationScript $database -Apply
    if ($applied.status -ne 'ok') { throw "migration-$($applied.status):$(@($applied.issues) -join ',')" }
    Emit ([ordered]@{ command='migrate-fin-value-strategies-and-restart';status='ok';changes=$changes;issues=@();data=$summary })
    & $startScript -DshCheckout $dsh -TrustedHost $TrustedHost -Port $Port
    if ($LASTEXITCODE -ne 0) { throw 'dsh-web-restart-failed' }
} catch {
    Emit ([ordered]@{ command='migrate-fin-value-strategies-and-restart';status='failed';changes=@();issues=@($_.Exception.Message);data=@{automaticRetry=$false} })
    exit 1
}
