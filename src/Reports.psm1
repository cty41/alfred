Set-StrictMode -Version Latest

function New-KbResult {
    param([string]$Command,[string]$Status,[string]$State,[string]$VaultPath,[object[]]$Changes=@(),[object[]]$Issues=@(),[hashtable]$Data=@{})
    [pscustomobject]@{
        command=$Command
        status=$Status
        state=$State
        vaultPath=$VaultPath
        timestamp=(Get-Date).ToString('o')
        changes=$Changes
        issues=$Issues
        data=[pscustomobject]$Data
    }
}

function Write-KbOutput {
    param([Parameter(Mandatory)]$Result,[switch]$Json)
    if ($Json) { $Result | ConvertTo-Json -Depth 20 }
    else {
        "[$($Result.status)] $($Result.command) state=$($Result.state)"
        if ($Result.vaultPath) { "Vault: $($Result.vaultPath)" }
        foreach($c in $Result.changes){ "+ $c" }
        foreach($i in $Result.issues){ "! $i" }
    }
}

Export-ModuleMember -Function New-KbResult,Write-KbOutput
