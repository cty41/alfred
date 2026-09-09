[CmdletBinding()]
param(
  [ValidateSet('web','headless','all')][string]$Profile='all',
  [string]$DshHome=$(if($env:DSH_HOME){$env:DSH_HOME}else{Join-Path $HOME '.dsh'}),
  [string]$DshCheckout=$env:ALFRED_DSH_CHECKOUT,
  [switch]$LegacyGlobal,[switch]$MigrateScoped,
  [switch]$DryRun,[switch]$Json
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$package=Join-Path $root 'packages\dsh-alfred'
$profiles=if($Profile -eq 'all'){@('web','headless')}else{@($Profile)}
if($LegacyGlobal -and $MigrateScoped){throw 'LegacyGlobal and MigrateScoped are mutually exclusive'}
$changes=@('npm ci --ignore-scripts','npm run build')+@($profiles|ForEach-Object{"link dsh-alfred per-Agent dispatch bootstrap to profile:$_"})+@('install hidden Alfred historical-session compatibility preset')
if($LegacyGlobal){$changes+=@($profiles|ForEach-Object{"preserve legacy global ALF control in profile:$_"})}
if($MigrateScoped){$changes+=@($profiles|ForEach-Object{"remove managed legacy global ALF control from profile:$_"})}
function Invoke-Checked([string]$File,[string[]]$Arguments,[string]$WorkingDirectory,[switch]$Silent){
  Push-Location $WorkingDirectory
  try{
    $savedErrorActionPreference=$ErrorActionPreference
    try{$ErrorActionPreference='Continue';$output=@(& $File @Arguments 2>&1);$exitCode=$LASTEXITCODE}
    finally{$ErrorActionPreference=$savedErrorActionPreference}
    if(-not $Silent){foreach($line in $output){[Console]::Error.WriteLine([string]$line)}}
    if($exitCode -ne 0){throw "$File exited with code $exitCode"}
  }finally{Pop-Location}
}
function Set-LegacyProfileOverride([string]$Name,[bool]$Enabled){
  $profile=Join-Path $env:DSH_HOME "profiles/$Name";$patch=Join-Path $profile 'cordis.patch.yml'
  if(-not(Test-Path -LiteralPath $patch -PathType Leaf)){throw "profile patch missing: $Name"}
  $begin='# BEGIN managed by dsh-alfred legacy-global';$end='# END managed by dsh-alfred legacy-global'
  $text=Get-Content -LiteralPath $patch -Raw -Encoding UTF8
  $pattern="(?ms)\r?\n?"+[regex]::Escape($begin)+".*?"+[regex]::Escape($end)+"\r?\n?"
  $text=[regex]::Replace($text,$pattern,"`n").TrimEnd()
  if($Enabled){
    $block="$begin`n- insert:`n    - id: dsh-alfred-legacy-control`n      name: dsh-alfred`n      config:`n        legacyGlobal: true`n$end"
    if($text.Trim() -eq '[]'){$text=$block}else{$text="$text`n`n$block"}
  }elseif(-not $text.Trim()){$text='[]'}
  $temp="$patch.$([guid]::NewGuid().ToString('N')).tmp"
  try{$text+"`n"|Set-Content -LiteralPath $temp -Encoding UTF8 -NoNewline;Move-Item -LiteralPath $temp -Destination $patch -Force}
  finally{Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue}
}
if($DryRun){$result=[ordered]@{command='install-dsh-alfred';status='planned';changes=$changes;issues=@();data=@{profiles=$profiles;activationMode=$(if($LegacyGlobal){'legacy-global'}else{'dispatch-v1'});network=$true;writes=$true}}}
else{
  $old=$env:DSH_HOME;$backups=@()
  try{
    $env:DSH_HOME=[IO.Path]::GetFullPath($DshHome)
    Invoke-Checked npm @('ci','--ignore-scripts','--no-audit') $root
    Invoke-Checked npm @('run','build') $root
    foreach($name in $profiles){
      $profilePath=Join-Path $env:DSH_HOME "profiles/$name";$backupPath=Join-Path ([IO.Path]::GetTempPath()) "dsh-alfred-$name-$([guid]::NewGuid())";New-Item -ItemType Directory -Path $backupPath -Force|Out-Null;$entries=@()
      foreach($file in @('package.json','pnpm-lock.yaml','pnpm-workspace.yaml','cordis.patch.yml')){$source=Join-Path $profilePath $file;$exists=Test-Path -LiteralPath $source -PathType Leaf;if($exists){Copy-Item -LiteralPath $source -Destination (Join-Path $backupPath $file)};$entries+=@{name=$file;exists=$exists}}
      $backups+=@{profilePath=$profilePath;backupPath=$backupPath;entries=$entries}
      if($DshCheckout){$checkout=[IO.Path]::GetFullPath($DshCheckout);Invoke-Checked npm @('run','dsh','--','plugin','--profile',$name,'add',$package) $checkout}
      else{Invoke-Checked npx @('--yes','@deepseek-ai/dsh@0.1.0-rc.7','plugin','--profile',$name,'add',$package) $root}
      if($LegacyGlobal){Set-LegacyProfileOverride -Name $name -Enabled $true}
      elseif($MigrateScoped){Set-LegacyProfileOverride -Name $name -Enabled $false}
      if($DshCheckout){Invoke-Checked npm @('run','dsh','--','--profile',$name,'--dump-config') $checkout -Silent}
    }
    $powerShell=if(Get-Command pwsh -ErrorAction SilentlyContinue){'pwsh'}else{'powershell'}
    $presetArgs=@('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $PSScriptRoot 'install-preset.ps1'),'-DshHome',$env:DSH_HOME)
    if($LegacyGlobal){$presetArgs+='-LegacyGlobal'}
    $null=& $powerShell @presetArgs
    if($LASTEXITCODE -ne 0){throw "preset installer exited with code $LASTEXITCODE"}
    $result=[ordered]@{command='install-dsh-alfred';status='ok';changes=$changes;issues=@();data=@{profiles=$profiles;activationMode=$(if($LegacyGlobal){'legacy-global'}else{'dispatch-v1'});restartRequired=$true}}
  }catch{
    foreach($backup in $backups){try{New-Item -ItemType Directory -Path $backup.profilePath -Force|Out-Null;foreach($entry in $backup.entries){$destination=Join-Path $backup.profilePath $entry.name;if($entry.exists){Copy-Item -LiteralPath (Join-Path $backup.backupPath $entry.name) -Destination $destination -Force}else{Remove-Item -LiteralPath $destination -Force -ErrorAction SilentlyContinue}}}catch{}}
    $result=[ordered]@{command='install-dsh-alfred';status='failed';changes=$changes;issues=@($_.Exception.Message);data=@{profiles=$profiles}}
  }
  finally{foreach($backup in $backups){Remove-Item -LiteralPath $backup.backupPath -Recurse -Force -ErrorAction SilentlyContinue};if($null -eq $old){Remove-Item Env:DSH_HOME -ErrorAction SilentlyContinue}else{$env:DSH_HOME=$old}}
}
if($Json){$result|ConvertTo-Json -Depth 8}else{"[$($result.status)] $($result.command)";$result.issues|ForEach-Object{"  issue: $_"}}
if($result.status -eq 'failed'){exit 1}
