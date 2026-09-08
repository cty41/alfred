[CmdletBinding()]
param([string]$DshHome = $(if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME '.dsh' }),[switch]$DryRun,[switch]$Json)
$ErrorActionPreference='Stop'
$source = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\presets\alfred'))
$target = Join-Path $DshHome '.agent-presets\alfred'
$targetFile=Join-Path $target 'agent.cordis.yml'
$result=[ordered]@{command='install-alfred-preset';status=$(if($DryRun){'planned'}else{'ok'});changes=@("copy Alfred preset to managed DSH home");issues=@();data=@{writes=$true}}
if(-not $DryRun){
  if(Test-Path -LiteralPath $targetFile -PathType Leaf){
    $existing=Get-Content -LiteralPath $targetFile -Raw
    $managed=$existing -match '(?m)^# Managed by dsh-alfred\.'
    $legacyManaged=$existing -match 'You are Alfred \(short name ALF\)' -and $existing -match "(?m)^- id: tool-skill\s*$"
    if(-not $managed -and -not $legacyManaged){throw 'refusing to overwrite an unmanaged Alfred preset'}
  }
  New-Item -ItemType Directory -Force -Path $target|Out-Null
  $temporary="$targetFile.$([guid]::NewGuid().ToString('N')).tmp"
  try{Copy-Item -LiteralPath (Join-Path $source 'agent.cordis.yml') -Destination $temporary;Move-Item -LiteralPath $temporary -Destination $targetFile -Force}
  finally{Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue}
}
if($Json){$result|ConvertTo-Json -Depth 6}else{"[$($result.status)] $($result.command)"}
