Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'Config.psm1')
Import-Module (Join-Path $PSScriptRoot 'Discovery.psm1')
Import-Module (Join-Path $PSScriptRoot 'Reports.psm1')
Import-Module (Join-Path $PSScriptRoot 'PrivacyScan.psm1')

function Invoke-KbDoctor {
    param([string]$VaultPath,[string]$KitPath,[switch]$Quick)
    $state = Get-KbState -VaultPath $VaultPath -KitPath $KitPath
    $issues = [Collections.Generic.List[object]]::new()
    foreach($i in $state.issues){$issues.Add($i)}
    if($state.vaultPath -and (Test-Path -LiteralPath $state.vaultPath)){
        foreach($name in @('README.md','AGENTS.md','RULES.md','SKILLS.md')){
            if(-not (Test-Path -LiteralPath (Join-Path $state.vaultPath $name))){$issues.Add("Missing root file: $name")}
        }
        $conflicts=Get-ChildItem -LiteralPath $state.vaultPath -Recurse -File -ErrorAction SilentlyContinue | Where-Object {
            $_.FullName -notmatch '[\\/]00_System[\\/]reports[\\/]conflicts[\\/]' -and $_.BaseName -match '_\d+月\d+日\d+时\d+分\d+秒$'
        }
        foreach($conflict in $conflicts){$issues.Add("Possible Xiaomi sync conflict: $($conflict.FullName)")}
        if(-not $Quick){
            $scan = Invoke-KbPrivacyScan -Path $state.vaultPath
            foreach($f in $scan.findings){$issues.Add("Privacy finding [$($f.category)] $($f.file):$($f.line) $($f.preview)")}
        }
    }
    $toolCollections = if($state.vaultPath -and (Test-Path -LiteralPath $state.vaultPath)){@(Get-KbToolCollections -VaultPath $state.vaultPath)}else{@()}
    $finalState = if($issues.Count -eq 0 -and $state.state -eq 'HEALTHY'){'HEALTHY'}elseif($state.state -eq 'UNCONFIGURED'){'UNCONFIGURED'}else{'DEGRADED'}
    New-KbResult -Command 'doctor' -Status $(if($finalState -eq 'HEALTHY'){'ok'}else{'issues'}) -State $finalState -VaultPath $state.vaultPath -Issues $issues.ToArray() -Data @{quick=[bool]$Quick;toolCollections=$toolCollections}
}

Export-ModuleMember -Function Invoke-KbDoctor

