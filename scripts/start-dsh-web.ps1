[CmdletBinding()]
param(
    [string]$DshCheckout = $env:DEEPSEEK_HARNESS_CHECKOUT,
    [string]$DshPackage = '@deepseek-ai/dsh@0.1.5-rc.2',
    [string]$TrustedHost = $env:DSH_TRUSTED_HOST,
    [int]$Port = 3080,
    [switch]$DryRun,
    [switch]$Json
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Test-DshWebCommandLine([string]$CommandLine) {
    if ([string]::IsNullOrWhiteSpace($CommandLine)) { return $false }
    [bool]($CommandLine -match '(?i)(apps[/\\]cli[/\\]src[/\\]bin\.ts\s+web(?:\s|$)|node_modules[/\\]@deepseek-ai[/\\]dsh[/\\]lib[/\\]bin\.js\s+web(?:\s|$)|@deepseek-ai[/\\]dsh(?:@[^\s]+)?.*\sweb(?:\s|$))')
}

function Get-DshWebProcess {
    if ($env:OS -ne 'Windows_NT') { return @() }
    if (-not (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue)) { throw 'Get-NetTCPConnection is required for safe process targeting' }
    $owners = @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object LocalPort -eq $Port | Select-Object -ExpandProperty OwningProcess -Unique)
    if ($owners.Count -eq 0) { return @() }
    @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { $owners -contains $_.ProcessId -and (Test-DshWebCommandLine ([string]$_.CommandLine)) })
}

function Write-Result([System.Collections.IDictionary]$Result) {
    if ($Json) { $Result | ConvertTo-Json -Depth 8 }
    else {
        "[$($Result.status)] $($Result.command)"
        foreach ($change in @($Result.changes)) { "  change: $change" }
        foreach ($issue in @($Result.issues)) { "  issue: $issue" }
        if ($Result.data.url) { "  url: $($Result.data.url)" }
    }
}

try {
    $checkout = if ([string]::IsNullOrWhiteSpace($DshCheckout)) { $null } else { [IO.Path]::GetFullPath($DshCheckout) }
    $launcher = if ($checkout) { 'source-checkout' } else { 'official-registry-package' }
    $url = "http://127.0.0.1:$Port"
    $running = @(Get-DshWebProcess)
    if ($running.Count -gt 0) {
        Write-Result ([ordered]@{ command='start-dsh-web';status='already-running';changes=@();issues=@();data=@{url=$url;processCount=$running.Count;launcher=$launcher} })
        exit 0
    }
    $changes = @("start the existing DSH web profile in the foreground via $launcher")
    if ($DryRun) {
        Write-Result ([ordered]@{ command='start-dsh-web';status='planned';changes=$changes;issues=@();data=@{url=$url;launcher=$launcher;dshPackage=$(if($checkout){$null}else{$DshPackage});trustedHostConfigured=[bool]$TrustedHost;writes=$false} })
        exit 0
    }
    if ($checkout) {
        if (-not (Test-Path -LiteralPath (Join-Path $checkout 'package.json') -PathType Leaf)) { throw 'dsh-checkout-invalid' }
        Push-Location $checkout
        try {
            $arguments = @('run','dsh','--','web','--port',[string]$Port)
            if (-not [string]::IsNullOrWhiteSpace($TrustedHost)) { $arguments += @('--trusted-host',$TrustedHost) }
            & npm @arguments
            $code = $LASTEXITCODE
        } finally { Pop-Location }
    } else {
        $arguments = @('--yes',$DshPackage,'web','--port',[string]$Port)
        if (-not [string]::IsNullOrWhiteSpace($TrustedHost)) { $arguments += @('--trusted-host',$TrustedHost) }
        & npx @arguments
        $code = $LASTEXITCODE
    }
    if ($code -ne 0) { throw "dsh-web-exited:$code" }
    Write-Result ([ordered]@{ command='start-dsh-web';status='stopped';changes=$changes;issues=@();data=@{url=$url;launcher=$launcher} })
} catch {
    Write-Result ([ordered]@{ command='start-dsh-web';status='failed';changes=@();issues=@($_.Exception.Message);data=@{url="http://127.0.0.1:$Port"} })
    exit 1
}
