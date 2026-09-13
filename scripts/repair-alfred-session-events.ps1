[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Root,
    [Parameter(Mandatory)][string]$BackupRoot,
    [Parameter(Mandatory)][string[]]$SessionIds,
    [switch]$DryRun,
    [switch]$Apply,
    [switch]$OfflineConfirmed,
    [string]$ConfirmToken,
    [string]$BackupRun,
    [ValidateRange(1,65535)][int]$Port = 3080
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
# Default is a read-only preview. The Node entry repeats all authorization checks.
if ($Apply -and $DryRun) { throw 'Apply and DryRun are mutually exclusive' }
$arguments = @((Join-Path $PSScriptRoot 'repair-alfred-session-events.mjs'), '--root', $Root, '--backup-root', $BackupRoot, '--session-ids', ($SessionIds -join ','), '--port', [string]$Port)
if ($Apply) { $arguments += '--apply' }
if ($DryRun) { $arguments += '--dry-run' }
if ($OfflineConfirmed) { $arguments += '--offline-confirmed' }
if ($ConfirmToken) { $arguments += @('--confirm', $ConfirmToken) }
if ($BackupRun) { $arguments += @('--backup-run', $BackupRun) }
& node @arguments
exit $LASTEXITCODE
