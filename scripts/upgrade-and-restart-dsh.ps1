[CmdletBinding()]
param(
    [string]$AlfredCheckout,
    [string]$DshCheckout = $env:DEEPSEEK_HARNESS_CHECKOUT,
    [string]$TrustedHost = $env:DSH_TRUSTED_HOST,
    [int]$Port = 3080,
    [switch]$DryRun,
    [switch]$ConfirmUpgrade,
    [switch]$Json
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-AllDshProcesses {
    if ($env:OS -ne 'Windows_NT') { throw 'upgrade-and-restart currently requires Windows process inspection' }
    @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {
        [string]$_.CommandLine -match '(apps[/\\]cli[/\\]src[/\\]bin\.ts|@deepseek-ai[/\\]dsh|deepseek-harness).*(\sweb\b|\sheadless\b)'
    })
}

function Get-DshWebProcess {
    if ($env:OS -ne 'Windows_NT') { throw 'upgrade-and-restart currently requires Windows process inspection' }
    if (-not (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue)) { throw 'Get-NetTCPConnection is required for safe process targeting' }
    $owners = @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object LocalPort -eq $Port | Select-Object -ExpandProperty OwningProcess -Unique)
    if ($owners.Count -eq 0) { return @() }
    @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {
        $owners -contains $_.ProcessId -and [string]$_.CommandLine -match 'apps[/\\]cli[/\\]src[/\\]bin\.ts\s+web(?:\s|$)'
    })
}

function Emit([System.Collections.IDictionary]$Result) {
    if ($Json) { $Result | ConvertTo-Json -Depth 8 }
    else {
        "[$($Result.status)] $($Result.command)"
        foreach ($change in @($Result.changes)) { "  change: $change" }
        foreach ($issue in @($Result.issues)) { "  issue: $issue" }
    }
}

$restartNeeded = $false
$launchArguments = $null
try {
    if ([string]::IsNullOrWhiteSpace($AlfredCheckout)) { $AlfredCheckout = Split-Path -Parent $PSScriptRoot }
    if ([string]::IsNullOrWhiteSpace($DshCheckout)) { $DshCheckout = Join-Path (Split-Path -Parent $AlfredCheckout) 'deepseek-harness' }
    $alfred = [IO.Path]::GetFullPath($AlfredCheckout)
    $dsh = [IO.Path]::GetFullPath($DshCheckout)
    $alfredScript = Join-Path $alfred 'alfred.ps1'
    $startScript = Join-Path $alfred 'scripts/start-dsh-web.ps1'
    if (-not (Test-Path -LiteralPath $alfredScript -PathType Leaf)) { throw 'alfred-checkout-invalid' }
    if (-not (Test-Path -LiteralPath $startScript -PathType Leaf)) { throw 'start-script-missing' }
    $quotedStartScript = $startScript.Replace("'", "''")
    $quotedDsh = $dsh.Replace("'", "''")
    $quotedTrustedHost = ([string]$TrustedHost).Replace("'", "''")
    $launchCommand = "& '$quotedStartScript' -DshCheckout '$quotedDsh' -TrustedHost '$quotedTrustedHost' -Port $Port"
    $encodedLaunchCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($launchCommand))
    $launchArguments = @('-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand',$encodedLaunchCommand)

    $changes = @('stop only matching DSH web processes','install Alfred and Fin Value into the web profile','restart the existing DSH web profile')
    $previewText = (& powershell -NoProfile -ExecutionPolicy Bypass -File $alfredScript install -Profile web -DshCheckout $dsh -DryRun -Json) -join "`n"
    if ($LASTEXITCODE -ne 0) { throw 'install-dry-run-failed' }
    try { $preview = $previewText | ConvertFrom-Json } catch { throw 'install-dry-run-returned-invalid-json' }
    if (-not $Json) { $previewText | Write-Host }
    if ($DryRun) {
        Emit ([ordered]@{command='upgrade-and-restart-dsh';status='planned';changes=$changes;issues=@();data=@{confirmationRequired=$true;restartRequired=$true;installPreviewStatus=$preview.status}})
        exit 0
    }
    if (-not (Test-Path -LiteralPath (Join-Path $dsh 'package.json') -PathType Leaf)) { throw 'dsh-checkout-invalid' }

    if (-not $ConfirmUpgrade) {
        $answer = Read-Host 'Type YES to stop DSH Web, install, and restart'
        if ($answer -cne 'YES') {
            Emit ([ordered]@{command='upgrade-and-restart-dsh';status='cancelled';changes=@();issues=@();data=@{modified=$false}})
            exit 0
        }
    }

    $processes = @(Get-DshWebProcess)
    $targetIds=@($processes|ForEach-Object{$_.ProcessId})
    $otherProfiles=@(Get-AllDshProcesses|Where-Object{$targetIds -notcontains $_.ProcessId})
    if($otherProfiles.Count){throw 'other-dsh-profiles-running; nothing was stopped'}
    foreach ($process in $processes) { Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop }
    foreach ($process in $processes) { Wait-Process -Id $process.ProcessId -Timeout 15 -ErrorAction SilentlyContinue }
    if (@(Get-DshWebProcess).Count -gt 0) { throw 'dsh-web-did-not-stop; install was not started' }
    $restartNeeded=$processes.Count -gt 0
    $installText = (& powershell -NoProfile -ExecutionPolicy Bypass -File $alfredScript install -Profile web -DshCheckout $dsh -Json) -join "`n"
    $installExitCode = $LASTEXITCODE
    try { $installResult = $installText | ConvertFrom-Json } catch { throw 'install-returned-invalid-json; DSH Web was not restarted' }
    if ($installExitCode -ne 0) {
        $detail = @($installResult.issues) -join ','
        $exception = [InvalidOperationException]::new("$detail; DSH Web was not restarted")
        $exception.Data['Failure'] = $installResult.data.failure
        throw $exception
    }

    $started = Start-Process -FilePath 'powershell' -ArgumentList $launchArguments -WindowStyle Hidden -PassThru
    $restarted = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        if (@(Get-DshWebProcess).Count -gt 0) { $restarted = $true; break }
        if ($started.HasExited) { break }
        Start-Sleep -Milliseconds 250
    }
    if (-not $restarted) {
        $restartExitCode = if ($started.HasExited) { $started.ExitCode } else { $null }
        throw "restart-failed:$restartExitCode"
    }
    $restartNeeded=$false
    Emit ([ordered]@{command='upgrade-and-restart-dsh';status='ok';changes=$changes;issues=@();data=@{port=$Port;trustedHostConfigured=[bool]$TrustedHost;failure=$null}})
} catch {
    $failure = if ($_.Exception.Data.Contains('Failure')) { $_.Exception.Data['Failure'] } else { $null }
    $restartRecovery='not-required'
    if($restartNeeded -and $launchArguments){
        try{Start-Process -FilePath 'powershell' -ArgumentList $launchArguments -WindowStyle Hidden|Out-Null;$restartRecovery='attempted'}catch{$restartRecovery='failed'}
    }
    Emit ([ordered]@{command='upgrade-and-restart-dsh';status='failed';changes=@();issues=@($_.Exception.Message);data=@{automaticRetry=$false;failure=$failure;restartRecovery=$restartRecovery}})
    exit 1
}
