Set-StrictMode -Version Latest

function Get-AlfredReceiptRoot {
    [CmdletBinding()] param([string]$Override,[ValidateSet('windows','macos','linux')][string]$Platform)
    if ($Override) { return [IO.Path]::GetFullPath($Override) }
    if (-not $Platform) {
        $onWindows = $env:OS -eq 'Windows_NT'
        if (Get-Variable -Name IsWindows -ErrorAction SilentlyContinue) { $onWindows = [bool](Get-Variable -Name IsWindows -ValueOnly) }
        $onMac = $false
        if (Get-Variable -Name IsMacOS -ErrorAction SilentlyContinue) { $onMac = [bool](Get-Variable -Name IsMacOS -ValueOnly) }
        $Platform = if($onWindows){'windows'}elseif($onMac){'macos'}else{'linux'}
    }
    if ($Platform -eq 'windows') {
        $base = if ($env:LOCALAPPDATA) {$env:LOCALAPPDATA} elseif ($env:APPDATA) {$env:APPDATA} else {$HOME}
        return Join-Path $base 'Alfred/receipts'
    }
    if ($Platform -eq 'macos') { return Join-Path $HOME 'Library/Application Support/alfred/receipts' }
    $base = if ($env:XDG_STATE_HOME) {$env:XDG_STATE_HOME} else {Join-Path $HOME '.local/state'}
    Join-Path $base 'alfred/receipts'
}

function Write-AlfredInstallReceipt {
    [CmdletBinding(SupportsShouldProcess)]
    param([Parameter(Mandatory)][ValidatePattern('^[a-z0-9][a-z0-9-]*$')][string]$ToolId,[Parameter(Mandatory)][hashtable]$Data,[string]$ReceiptRoot)
    $root = Get-AlfredReceiptRoot -Override $ReceiptRoot
    $path = Join-Path $root "$ToolId.json"
    if ($PSCmdlet.ShouldProcess($path,'write install receipt')) {
        New-Item -ItemType Directory -Path $root -Force | Out-Null
        $receipt = [ordered]@{schemaVersion='1.0';toolId=$ToolId;installedAt=(Get-Date).ToUniversalTime().ToString('o');data=$Data}
        $temp = "$path.$([guid]::NewGuid().ToString('N')).tmp"
        try {
            $receipt | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $temp -Encoding UTF8
            Move-Item -LiteralPath $temp -Destination $path -Force
        } finally { Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue }
    }
    $path
}

function Read-AlfredInstallReceipt {
    [CmdletBinding()] param([Parameter(Mandatory)][ValidatePattern('^[a-z0-9][a-z0-9-]*$')][string]$ToolId,[string]$ReceiptRoot)
    $path = Join-Path (Get-AlfredReceiptRoot -Override $ReceiptRoot) "$ToolId.json"
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return $null }
    $receipt = Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($receipt.schemaVersion -ne '1.0' -or $receipt.toolId -ne $ToolId) { throw "Invalid install receipt: $ToolId" }
    $receipt
}
Export-ModuleMember -Function Get-AlfredReceiptRoot,Write-AlfredInstallReceipt,Read-AlfredInstallReceipt
