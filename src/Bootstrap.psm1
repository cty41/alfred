Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'Config.psm1') -Force

function Invoke-Checked {
    param([Parameter(Mandatory)][string]$FilePath,[Parameter(Mandatory)][string[]]$Arguments,[Parameter(Mandatory)][string]$WorkingDirectory)
    Push-Location $WorkingDirectory
    try {
        & $FilePath @Arguments
        if ($LASTEXITCODE -ne 0) { throw "$FilePath exited with code $LASTEXITCODE" }
    } finally { Pop-Location }
}

function Invoke-AlfredBootstrap {
    [CmdletBinding()]
    param([switch]$DryRun)
    $root = Get-AlfredRoot
    $changes = @(
        'git submodule sync --recursive',
        'git submodule update --init --recursive',
        'npm ci (repos/fin-alfred)',
        'uv sync --frozen --project data-provider (repos/fin-alfred)',
        'npm run build (repos/fin-alfred)'
    )
    if ($DryRun) { return New-AlfredResult -Command 'bootstrap' -Status 'planned' -Changes $changes -Data @{network=$true; writes=$true} }
    try {
        Invoke-Checked git @('submodule','sync','--recursive') $root
        Invoke-Checked git @('submodule','update','--init','--recursive') $root
        $fin = Join-Path $root 'repos/fin-alfred'
        Invoke-Checked npm @('ci') $fin
        Invoke-Checked uv @('sync','--frozen','--project','data-provider') $fin
        Invoke-Checked npm @('run','build') $fin
        New-AlfredResult -Command 'bootstrap' -Status 'ok' -Changes $changes
    } catch { New-AlfredResult -Command 'bootstrap' -Status 'failed' -Changes $changes -Issues @($_.Exception.Message) }
}

Export-ModuleMember -Function Invoke-AlfredBootstrap
