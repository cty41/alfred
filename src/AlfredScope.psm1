Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'Receipt.psm1') -Force

function Get-AlfredUserConfigPath {
    [CmdletBinding()] param([string]$HomePath=$HOME)
    [IO.Path]::GetFullPath((Join-Path $HomePath '.agents/alfred.json'))
}

function Find-AlfredProjectRoot {
    [CmdletBinding()] param([Parameter(Mandatory)][string]$Path)
    $current=[IO.Path]::GetFullPath($Path)
    if(Test-Path -LiteralPath $current -PathType Leaf){$current=Split-Path -Parent $current}
    while($true){
        if(Test-Path -LiteralPath (Join-Path $current '.git')){return $current}
        $parent=Split-Path -Parent $current
        if(-not $parent -or $parent -eq $current){return [IO.Path]::GetFullPath($Path)}
        $current=$parent
    }
}

function Get-AlfredProjectConfigPath {
    [CmdletBinding()] param([Parameter(Mandatory)][string]$ProjectRoot)
    Join-Path (Find-AlfredProjectRoot -Path $ProjectRoot) '.agents/alfred.json'
}

function Read-AlfredActivationConfig {
    [CmdletBinding()] param([Parameter(Mandatory)][string]$Path)
    if(-not(Test-Path -LiteralPath $Path -PathType Leaf)){return [pscustomobject]@{state='not-configured';enabled=$false;reasonCode=$null}}
    try{$value=Get-Content -LiteralPath $Path -Raw -Encoding UTF8|ConvertFrom-Json}
    catch{return [pscustomobject]@{state='invalid';enabled=$false;reasonCode='config-json-invalid'}}
    $names=@($value.psobject.Properties.Name)
    $allowed=@('$schema','schemaVersion','enabled')
    if(@($names|Where-Object{$_ -notin $allowed}).Count){return [pscustomobject]@{state='invalid';enabled=$false;reasonCode='config-unknown-field'}}
    if([string]$value.schemaVersion -ne '1.0'){return [pscustomobject]@{state='invalid';enabled=$false;reasonCode='config-version-unsupported'}}
    if($value.psobject.Properties.Name -notcontains 'enabled' -or $value.enabled -isnot [bool]){return [pscustomobject]@{state='invalid';enabled=$false;reasonCode='config-enabled-invalid'}}
    [pscustomobject]@{state=$(if($value.enabled){'enabled'}else{'disabled'});enabled=[bool]$value.enabled;reasonCode=$null}
}

function Test-AlfredLegacyGlobalInstall {
    [CmdletBinding()] param([string]$ReceiptRoot,[string]$DshHome=$(if($env:DSH_HOME){$env:DSH_HOME}else{Join-Path $HOME '.dsh'}))
    try{$receipt=Read-AlfredInstallReceipt -ToolId 'alfred-control' -ReceiptRoot $ReceiptRoot}catch{$receipt=$null}
    $managedProfiles=@()
    if($null -ne $receipt -and $receipt.data.psobject.Properties.Name -contains 'activationModel' -and [string]$receipt.data.activationModel -in @('dispatch-v1','lazy-domain-v1')){
        if($receipt.data.psobject.Properties.Name -contains 'profiles'){$managedProfiles=@($receipt.data.profiles)}
        elseif([string]$receipt.data.profile -eq 'all'){$managedProfiles=@('web','headless')}
        elseif($receipt.data.profile){$managedProfiles=@([string]$receipt.data.profile)}
    }elseif($null -ne $receipt){return $true}
    foreach($profile in @('web','headless')){
        $manifestPath=Join-Path $DshHome "profiles/$profile/package.json"
        if(-not(Test-Path -LiteralPath $manifestPath -PathType Leaf)){continue}
        try{$manifest=Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8|ConvertFrom-Json}catch{continue}
        $active=@($manifest.dsh.profile.bundles);$inactive=if($manifest.dsh.profile.psobject.Properties.Name -contains 'inactiveBundles'){@($manifest.dsh.profile.inactiveBundles)}else{@()}
        if($active -contains 'dsh-alfred' -and $active -contains 'dsh-fin-value' -and $inactive -notcontains 'dsh-fin-value'){return $true}
        if($profile -notin $managedProfiles -and $active -contains 'dsh-alfred'){return $true}
    }
    $false
}

function Get-AlfredActivationStatus {
    [CmdletBinding()] param([string]$Cwd,[string]$HomePath=$HOME,[string]$ReceiptRoot)
    try{$receipt=Read-AlfredInstallReceipt -ToolId 'alfred-control' -ReceiptRoot $ReceiptRoot}catch{$receipt=$null}
    $activationModel=if($null -ne $receipt -and $receipt.data.psobject.Properties.Name -contains 'activationModel'){[string]$receipt.data.activationModel}else{'unrecorded'}
    $migrationReason=if($activationModel -notin @('lazy-domain-v1','unrecorded')){'activation-migration-required'}else{$null}
    $userPath=Get-AlfredUserConfigPath -HomePath $HomePath
    $user=Read-AlfredActivationConfig -Path $userPath
    $project=$null
    if($Cwd){$project=Read-AlfredActivationConfig -Path (Get-AlfredProjectConfigPath -ProjectRoot $Cwd)}
    $invalid=@($project,$user|Where-Object{$null -ne $_ -and $_.state -eq 'invalid'}|Select-Object -First 1)
    if($invalid.Count){return [pscustomobject]@{state='config-invalid';enabled=$false;source='configuration';reasonCode=$invalid[0].reasonCode;activationModel=$activationModel}}
    if($null -ne $project -and $project.enabled){return [pscustomobject]@{state='configured-project';enabled=$true;source='project';reasonCode=$migrationReason;activationModel=$activationModel}}
    if($user.enabled){return [pscustomobject]@{state='configured-user';enabled=$true;source='user';reasonCode=$migrationReason;activationModel=$activationModel}}
    if(Test-AlfredLegacyGlobalInstall -ReceiptRoot $ReceiptRoot){return [pscustomobject]@{state='legacy-global';enabled=$true;source='legacy';reasonCode='legacy-migration-available';activationModel=$activationModel}}
    [pscustomobject]@{state='not-configured';enabled=$false;source='none';reasonCode=$migrationReason;activationModel=$activationModel}
}

Export-ModuleMember -Function Get-AlfredUserConfigPath,Find-AlfredProjectRoot,Get-AlfredProjectConfigPath,Read-AlfredActivationConfig,Test-AlfredLegacyGlobalInstall,Get-AlfredActivationStatus
