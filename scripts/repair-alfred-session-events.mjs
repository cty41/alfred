#!/usr/bin/env node
/** Standalone Windows recovery CLI. Never stops/starts services. Default mode is read-only. */
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { planRepair, summarize, applyRepair, planRollback, rollbackRepair } from './lib/alfred-session-repair.mjs'

/** Conservative: all OTHER JS runtime processes block apply, even unrelated projects. */
export function assertWindowsOffline(port = 3080) {
  if (process.platform !== 'win32') throw new Error('apply-requires-windows-offline-check')
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('invalid-port')
  const command = `$ErrorActionPreference='Stop'; try { $others=@(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne ${process.pid} -and $_.Name -match '^(node|bun|deno|dsh)(\\.exe)?$' }); $listeners=@([System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() | Where-Object Port -eq ${port}); if($others.Count -gt 0 -or $listeners.Count -gt 0){exit 3}; exit 0 } catch { exit 4 }`
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command], { stdio: 'ignore', timeout: 30000, windowsHide: true })
  } catch (error) {
    throw new Error(error.status === 3 ? 'runtime-or-listener-still-running' : 'offline-check-failed')
  }
}
export function parseArgs(args) {
  const out = { apply: false, dryRun: false, offlineConfirmed: false, port: 3080 }
  const seen = new Set()
  const values = new Map([['--root', 'root'], ['--backup-root', 'backupRoot'], ['--session-ids', 'sessionIds'], ['--confirm', 'confirm'], ['--backup-run', 'backupRun'], ['--port', 'port']])
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (seen.has(arg)) throw new Error('duplicate-option')
    seen.add(arg)
    if (arg === '--apply') out.apply = true
    else if (arg === '--dry-run') out.dryRun = true
    else if (arg === '--offline-confirmed') out.offlineConfirmed = true
    else if (values.has(arg)) {
      const value = args[++i]
      if (!value || value.startsWith('--')) throw new Error('missing-option-value')
      out[values.get(arg)] = value
    } else throw new Error('unknown-option')
  }
  if (!out.root || !out.backupRoot || !out.sessionIds) throw new Error('root-backup-root-and-six-session-ids-required')
  out.sessionIds = out.sessionIds.split(',')
  out.port = Number(out.port)
  if (!Number.isInteger(out.port) || out.port < 1 || out.port > 65535) throw new Error('invalid-port')
  if (out.apply && out.dryRun) throw new Error('apply-and-dry-run-conflict')
  if (out.apply && (!out.offlineConfirmed || !/^[a-f0-9]{64}$/.test(out.confirm ?? ''))) throw new Error('apply-requires-offline-confirmed-and-token')
  if (!out.apply && (out.offlineConfirmed || out.confirm !== undefined)) throw new Error('confirmation-only-valid-with-apply')
  return out
}
const SAFE_ERRORS = new Set(['duplicate-option', 'missing-option-value', 'unknown-option', 'root-backup-root-and-six-session-ids-required', 'invalid-port', 'apply-and-dry-run-conflict', 'apply-requires-offline-confirmed-and-token', 'confirmation-only-valid-with-apply', 'runtime-or-listener-still-running', 'offline-check-failed', 'apply-requires-windows-offline-check', 'exactly-six-unique-session-ids-required', 'confirmation-token-mismatch', 'source-changed', 'one-artifact-per-session-required', 'mixed-repair-state-use-rollback', 'unsafe-backup-location', 'backup-inside-repository', 'symlink-refused', 'nonregular-or-hardlinked-file', 'file-size-limit', 'directory-required', 'invalid-backup-run', 'backup-verification-failed', 'history-diverged-no-overwrite', 'journal-scope-mismatch', 'invalid-journal', 'unsafe-journal-path', 'target-count', 'ineligible-target', 'noncanonical-target', 'session-id-mismatch', 'invalid-jsonl', 'invalid-zstd'])
for (const code of ['security-unsupported-os', 'security-input-invalid', 'security-inspection-failed', 'security-reparse-refused', 'security-stream-refused', 'security-attributes-refused', 'security-volume-refused', 'security-directory-required', 'security-file-required', 'security-backup-not-private', 'security-preservation-failed', 'security-tree-limit', 'security-metadata-changed']) SAFE_ERRORS.add(code)
export async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === '--help') {
    console.log('Read-only default: --root <project sessions directory> --backup-root <existing private backup directory> --session-ids <six UUID session IDs separated by commas> [--dry-run] [--backup-run <previous run for rollback preview>] [--port 3080]. Apply ONLY after offline preview: add --apply --offline-confirmed --confirm <confirmationToken>. No service stop/start and no safety bypass. Windows + Node 24.19 or newer required for apply. Backups contain private conversation files; never store them in a repository or sessions tree.')
    return 0
  }
  let applyRequested = false
  try {
    const options = parseArgs(args)
    applyRequested = options.apply
    const offlineCheck = () => assertWindowsOffline(options.port)
    let result
    if (options.apply) {
      result = options.backupRun ? await rollbackRepair(options, { offlineCheck }) : await applyRepair(options, { offlineCheck })
    } else {
      let offlineReady = false, offlineReason
      try { offlineCheck(); offlineReady = true } catch (error) { offlineReason = SAFE_ERRORS.has(error.message) ? error.message : 'offline-check-failed' }
      if (options.backupRun) {
        const preview = await planRollback(options)
        result = { command: 'repair-alfred-session-events', status: 'rollback-planned', writes: false, backupRun: preview.run, confirmationToken: preview.token, sessionIds: preview.plan.sessionIds, nativeStreamCheckRequiredForApply: true }
      } else result = summarize(await planRepair(options))
      result = { ...result, offlineReady, ...(offlineReason ? { offlineReason } : {}) }
    }
    console.log(JSON.stringify(result, null, 2))
    return result.status === 'failed' ? 1 : 0
  } catch (error) {
    console.log(JSON.stringify({ command: 'repair-alfred-session-events', status: applyRequested ? 'failed' : 'refused', ...(applyRequested ? { writesMayHaveOccurred: true, guidance: 'keep-dsh-stopped-inspect-backup-before-retry' } : { writes: false }), error: SAFE_ERRORS.has(error.message) ? error.message : 'recovery-error-redacted' }))
    return 1
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await main()
