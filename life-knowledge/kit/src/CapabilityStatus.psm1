Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'Config.psm1')

function Invoke-KbCapabilityStatus {
    param([string]$VaultPath)

    $association = 'unassociated'
    $configuration = 'unconfigured'
    $available = $false
    $collections = @()

    try {
        $resolvedVault = Resolve-KbVaultPath $VaultPath
        if ($resolvedVault) {
            $association = 'associated'
            $available = [bool](Test-Path -LiteralPath $resolvedVault -PathType Container)
            if (-not $available) {
                $configuration = 'unavailable'
            }
            else {
                $configPath = Join-Path $resolvedVault 'knowledge-config.json'
                if (Test-Path -LiteralPath $configPath -PathType Leaf) {
                    try {
                        $null = Read-KbJson $configPath
                        $configuration = 'configured'
                        $collections = @(Get-KbToolCollections -VaultPath $resolvedVault | ForEach-Object {
                            [pscustomobject]@{
                                id = [string]$_.id
                                state = [string]$_.state
                            }
                        })
                    }
                    catch {
                        $configuration = 'invalid'
                    }
                }
            }
        }
    }
    catch {
        $association = 'invalid'
        $configuration = 'unknown'
    }

    [pscustomobject]@{
        command = 'capability-status'
        status = 'ok'
        timestamp = (Get-Date).ToString('o')
        vault = [pscustomobject]@{
            association = $association
            configuration = $configuration
            available = $available
        }
        collections = $collections
        runtimeEntryPoints = 'not-assessed'
    }
}

Export-ModuleMember -Function Invoke-KbCapabilityStatus
