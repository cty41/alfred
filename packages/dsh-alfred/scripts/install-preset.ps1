[CmdletBinding()]
param([string]$DshHome = $(if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME '.dsh' }),[switch]$LegacyGlobal,[switch]$DryRun,[switch]$Json)
$ErrorActionPreference='Stop'
$source = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\presets\alfred'))
$target = Join-Path $DshHome '.agent-presets\alfred'
$targetFile=Join-Path $target 'agent.cordis.yml'
$localFinValueConfig=$null
$result=[ordered]@{command='install-alfred-preset';status=$(if($DryRun){'planned'}else{'ok'});changes=@('atomically install hidden Alfred historical-session compatibility preset');issues=@();data=@{writes=$true;mode=$(if($LegacyGlobal){'legacy-global'}else{'compatibility-hidden'})}}
if(-not $DryRun){
  if(Test-Path -LiteralPath $targetFile -PathType Leaf){
    $existing=Get-Content -LiteralPath $targetFile -Raw
    $managed=$existing -match '(?m)^# Managed by dsh-alfred\.'
    $legacyManaged=$existing -match 'You are Alfred \(short name ALF\)' -and $existing -match "(?m)^- id: tool-skill\s*$"
    if(-not $managed -and -not $legacyManaged){throw 'refusing to overwrite an unmanaged Alfred preset'}
    $match=[regex]::Match($existing,'(?ms)^# BEGIN managed local Fin Value config\r?\n.*?^# END managed local Fin Value config\r?\n?')
    if($match.Success){$localFinValueConfig=$match.Value.TrimEnd()}
  }
  $parent=Split-Path -Parent $target;New-Item -ItemType Directory -Force -Path $parent|Out-Null
  $suffix=[guid]::NewGuid().ToString('N');$stage="$target.stage-$suffix";$backup="$target.backup-$suffix"
  try{
    if(Test-Path -LiteralPath $target -PathType Container){Copy-Item -LiteralPath $target -Destination $stage -Recurse}else{New-Item -ItemType Directory -Path $stage|Out-Null}
    foreach($name in @('agent.cordis.yml','preset.yml')){
      $destination=Join-Path $stage $name
      if($LegacyGlobal -and $name -eq 'agent.cordis.yml'){
        $content=Get-Content -LiteralPath (Join-Path $source $name) -Raw -Encoding UTF8
        $content=[regex]::Replace($content,'(?ms)^# BEGIN dsh-alfred scoped capabilities\r?\n.*?^# END dsh-alfred scoped capabilities\r?\n?','')
        $content|Set-Content -LiteralPath $destination -Encoding UTF8 -NoNewline
      }else{
        Copy-Item -LiteralPath (Join-Path $source $name) -Destination $destination -Force
        if($name -eq 'agent.cordis.yml' -and $localFinValueConfig){
          $content=Get-Content -LiteralPath $destination -Raw -Encoding UTF8
          $needle="  name: dsh-fin-value`r?`n"
          if($content -notmatch $needle){throw 'managed Alfred preset has no Fin Value row for local configuration'}
          $content=[regex]::Replace($content,$needle,{param($m) $m.Value+$localFinValueConfig+"`n"},1)
          $content|Set-Content -LiteralPath $destination -Encoding UTF8 -NoNewline
        }
      }
    }
    if(Test-Path -LiteralPath $target -PathType Container){Move-Item -LiteralPath $target -Destination $backup}
    try{Move-Item -LiteralPath $stage -Destination $target}catch{if(Test-Path -LiteralPath $backup -PathType Container){Move-Item -LiteralPath $backup -Destination $target};throw}
    Remove-Item -LiteralPath $backup -Recurse -Force -ErrorAction SilentlyContinue
  }finally{
    Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
    if((Test-Path -LiteralPath $backup -PathType Container) -and -not(Test-Path -LiteralPath $target)){Move-Item -LiteralPath $backup -Destination $target}
    Remove-Item -LiteralPath $backup -Recurse -Force -ErrorAction SilentlyContinue
  }
}
if($Json){$result|ConvertTo-Json -Depth 6}else{"[$($result.status)] $($result.command)"}
