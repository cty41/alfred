[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$ProjectRoot,
  [string]$AlfredRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path,
  [switch]$DryRun,
  [switch]$Uninstall,
  [switch]$GlobalSkills,
  [switch]$Json
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$entry = Join-Path $PSScriptRoot '..\src\install.ts'
$dist = Join-Path $PSScriptRoot '..\dist\install.js'
if (Test-Path -LiteralPath $dist -PathType Leaf) { $entry = $dist }
$arguments = @()
if ($entry.EndsWith('.ts')) {
  # Prefer compiled dist; fall back to tsx/node --experimental if needed
  $distTs = Join-Path $PSScriptRoot '..\dist\install.js'
  if (-not (Test-Path -LiteralPath $distTs -PathType Leaf)) {
    Push-Location (Join-Path $PSScriptRoot '..')
    try { & npm run build } finally { Pop-Location }
  }
  $entry = Join-Path $PSScriptRoot '..\dist\install.js'
}
$arguments += @($entry, '--project-root', $ProjectRoot, '--alfred-root', $AlfredRoot)
if ($DryRun) { $arguments += '--dry-run' }
if ($Uninstall) { $arguments += '--uninstall' }
if ($GlobalSkills) { $arguments += '--global-skills' }
& node @arguments
$code = $LASTEXITCODE
if ($Json) { exit $code }
exit $code
