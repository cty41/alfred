[CmdletBinding()]
param([string]$DshHome = $(if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME '.dsh' }),[switch]$DryRun,[switch]$Json)
$ErrorActionPreference='Stop'
$source = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\presets\alfred'))
$target = Join-Path $DshHome '.agent-presets\alfred'
$result=[ordered]@{command='install-alfred-preset';status=$(if($DryRun){'planned'}else{'ok'});changes=@("copy Alfred preset to managed DSH home");issues=@();data=@{writes=$true}}
if(-not $DryRun){New-Item -ItemType Directory -Force -Path $target|Out-Null;Copy-Item -LiteralPath (Join-Path $source 'agent.cordis.yml') -Destination (Join-Path $target 'agent.cordis.yml') -Force}
if($Json){$result|ConvertTo-Json -Depth 6}else{"[$($result.status)] $($result.command)"}
