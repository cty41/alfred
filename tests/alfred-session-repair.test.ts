import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink, link, stat, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { zstdCompressSync } from 'node:zlib'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { planRepair as actualPlanRepair, summarize, applyRepair as actualApplyRepair, planRollback as actualPlanRollback, rollbackRepair as actualRollbackRepair } from '../scripts/lib/alfred-session-repair.mjs'
// Test-double only for these temp fixtures; production CLI has no safety bypass.
const fixtureSecurity = { inspect: async () => ({ fixture: true }), preserve: async () => {} }
const planRepair = (options: any) => actualPlanRepair(options, { security: fixtureSecurity })
const applyRepair = (options: any, hooks: any = {}) => actualApplyRepair(options, { security: fixtureSecurity, ...hooks })
const planRollback = (options: any) => actualPlanRollback(options, { security: fixtureSecurity })
const rollbackRepair = (options: any, hooks: any = {}) => actualRollbackRepair(options, { security: fixtureSecurity, ...hooks })
import { parseArgs, main } from '../scripts/repair-alfred-session-events.mjs'
import { decodeZstd } from '../scripts/preview-alfred-session-events.mjs'

const ids = Array.from({ length: 6 }, (_, i) => `session-00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)
const secret = 'PRIVATE_CONTENT_SENTINEL'
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const offlineCheck = async () => {}
async function fixture(run: (options: any, base: string) => Promise<void>) {
  const base = await mkdtemp(join(tmpdir(), 'alfred-repair-'))
  const root = join(base, 'sessions', 'project'), backupRoot = join(base, 'backups')
  await mkdir(root, { recursive: true }); await mkdir(backupRoot)
  try {
    for (const [index, id] of ids.entries()) {
      const dir = join(root, id)
      await mkdir(join(dir, 'nested', 'empty'), { recursive: true })
      await writeFile(join(dir, 'nested', 'metadata.json'), JSON.stringify({ private: secret }))
      const header = { type: 'session', version: 0, id, createdAt: 1, delegationDepth: 0 }
      const text = [header, { type: 'alfred/available', seq: 0, time: 1, data: {} }, { type: 'user/message', seq: 1, time: 2, data: { text: secret } }].map(row => JSON.stringify(row)).join('\r\n') + '\r\n'
      const bytes = Buffer.from(text)
      await writeFile(join(dir, index % 2 ? 'session.jsonl.zstd' : 'session.jsonl'), index % 2 ? Buffer.concat([zstdCompressSync(bytes.subarray(0, 12)), zstdCompressSync(bytes.subarray(12))]) : bytes)
    }
    await run({ root, backupRoot, sessionIds: ids }, base)
  } finally { await rm(base, { recursive: true, force: true }) }
}
async function inventory(root: string, prefix = ''): Promise<any[]> {
  const out: any[] = []
  for (const name of (await readdir(root)).sort()) {
    const path = join(root, name), rel = `${prefix}/${name}`
    const info = await stat(path)
    if (info.isDirectory()) { out.push([rel, 'directory']); out.push(...await inventory(path, rel)) }
    else out.push([rel, sha(await readFile(path))])
  }
  return out
}
function noSecrets(value: unknown, base: string) { assert.ok(!JSON.stringify(value).includes(secret)); assert.ok(!JSON.stringify(value).includes(base)) }
async function applyOptions(options: any) {
  return { ...options, confirm: (await planRepair(options)).token, offlineConfirmed: true }
}

test('default planning is byte-for-byte read-only, token-bound to six full session trees, and redacted', async () => {
  await fixture(async (options, base) => {
    const before = await inventory(base)
    const first = await planRepair(options), second = await planRepair(options)
    assert.equal(first.token, second.token)
    const summary = summarize(first)
    assert.equal(summary.writes, false); assert.equal(summary.sessions.length, 6)
    noSecrets(summary, base)
    assert.deepEqual(await inventory(base), before)
  })
})

test('apply keeps compression format, fully backs up trees, preserves non-log files, and is idempotent', async () => {
  await fixture(async (options, base) => {
    const original = await inventory(options.root)
    const result = await applyRepair(await applyOptions(options), { offlineCheck })
    assert.equal(result.status, 'repaired')
    noSecrets(result, base)
    const runDir = join(options.backupRoot, result.backupRun)
    for (const [index, id] of ids.entries()) {
      const artifact = index % 2 ? 'session.jsonl.zstd' : 'session.jsonl'
      const saved = await readFile(join(runDir, id, artifact))
      const current = await readFile(join(options.root, id, artifact))
      const before = index % 2 ? decodeZstd(saved) : saved
      const after = index % 2 ? decodeZstd(current) : current
      assert.equal(after.toString().replace(',"ignorable":true', ''), before.toString())
      assert.deepEqual(await inventory(join(runDir, id)), original.filter(row => row[0].startsWith('/' + id + '/')).map(row => [row[0].slice(id.length + 1), row[1]]))
      assert.equal(await readFile(join(options.root, id, 'nested', 'metadata.json'), 'utf8'), JSON.stringify({ private: secret }))
    }
    assert.equal((await readdir(options.root)).length, 6)
    const repeat = await applyRepair(await applyOptions(options), { offlineCheck })
    assert.equal(repeat.status, 'already-repaired'); assert.equal(repeat.writes, false)
    assert.equal((await readdir(options.backupRoot)).length, 1)
  })
})

test('caught failure after replacing a file restores ALL originals from verified backups', async () => {
  await fixture(async (options) => {
    const before = await inventory(options.root)
    const result = await applyRepair(await applyOptions(options), { offlineCheck, afterReplace: async () => { throw new Error(secret) } })
    assert.equal(result.status, 'failed'); assert.equal(result.rollback, 'verified-restored')
    assert.deepEqual(await inventory(options.root), before)
    assert.equal((await readdir(options.backupRoot)).length, 1)
  })
})

test('interrupted transaction keeps journal; explicit separately-tokened rollback restores exact bytes', async () => {
  await fixture(async (options) => {
    const before = await inventory(options.root)
    let running = false
    const result = await applyRepair(await applyOptions(options), {
      offlineCheck: async () => { if (running) throw new Error('runtime-or-listener-still-running') },
      afterReplace: async () => { running = true; throw new Error('simulated interrupted commit') },
    })
    assert.equal(result.rollback, 'pending-stop-dsh-and-use-rollback')
    await assert.rejects(planRepair(options), /mixed-repair-state/)
    const rollbackOptions = { ...options, backupRun: result.backupRun, offlineConfirmed: true }
    const preview = await planRollback(rollbackOptions)
    await assert.rejects(rollbackRepair({ ...rollbackOptions, confirm: '0'.repeat(64) }, { offlineCheck }), /confirmation-token/)
    const restored = await rollbackRepair({ ...rollbackOptions, confirm: preview.token }, { offlineCheck })
    assert.equal(restored.status, 'rolled-back')
    assert.deepEqual(await inventory(options.root), before)
  })
})

test('partial rollback failure reports possible writes and a fresh rollback can finish', async () => {
  await fixture(async (options) => {
    const original = await inventory(options.root)
    const result = await applyRepair(await applyOptions(options), { offlineCheck })
    const args = { ...options, backupRun: result.backupRun, offlineConfirmed: true }
    const preview = await planRollback(args)
    let checks = 0
    const partial = await rollbackRepair({ ...args, confirm: preview.token }, { offlineCheck: async () => { if (++checks === 6) throw new Error('service restarted') } })
    assert.equal(partial.status, 'failed')
    assert.equal(partial.writesMayHaveOccurred, true)
    assert.notDeepEqual(await inventory(options.root), original)
    const fresh = await planRollback(args)
    assert.equal((await rollbackRepair({ ...args, confirm: fresh.token }, { offlineCheck })).status, 'rolled-back')
    assert.deepEqual(await inventory(options.root), original)
  })
})

test('staging corruption during metadata preservation is caught before history replacement', async () => {
  await fixture(async (options) => {
    const before = await inventory(options.root)
    const security = { inspect: fixtureSecurity.inspect, preserve: async (_source: string, destination: string) => { await writeFile(destination, 'altered staged bytes') } }
    const result = await applyRepair(await applyOptions(options), { offlineCheck, security })
    assert.equal(result.status, 'failed')
    assert.equal(result.rollback, 'verified-restored')
    assert.deepEqual(await inventory(options.root), before)
  })
})

test('cleanup refuses a replaced staging junction rather than unlinking another directory', async () => {
  await fixture(async (options, base) => {
    const outside = join(base, 'outside-staging')
    await mkdir(outside)
    const sentinel = join(outside, ids[0] + '.new')
    await writeFile(sentinel, 'do not delete')
    const result = await applyRepair(await applyOptions(options), { offlineCheck, afterReplace: async (index: number, { runDir }: any) => {
      if (index !== 5) return
      const run = runDir.split(/[\\/]/).at(-1)
      const stage = join(options.root, `.${run}-stage`)
      await rename(stage, join(base, 'saved-stage'))
      await symlink(outside, stage, process.platform === 'win32' ? 'junction' : 'dir')
    } })
    assert.equal(result.status, 'failed')
    assert.equal(result.rollback, 'pending-stop-dsh-and-use-rollback')
    assert.equal(await readFile(sentinel, 'utf8'), 'do not delete')
  })
})

test('security preflight is token-bound and rejected metadata does not create a backup', async () => {
  await fixture(async (options, base) => {
    let generation = 1
    const security = { inspect: async () => ({ generation }), preserve: async () => {} }
    const plan = await actualPlanRepair(options, { security })
    const before = await inventory(base)
    generation++
    await assert.rejects(actualApplyRepair({ ...options, confirm: plan.token, offlineConfirmed: true }, { security, offlineCheck }), /confirmation-token/)
    assert.deepEqual(await inventory(base), before)
  })
})

test('rollback refuses tampered backup or subsequently resumed history without overwriting', async () => {
  await fixture(async (options) => {
    const result = await applyRepair(await applyOptions(options), { offlineCheck })
    const rollbackOptions = { ...options, backupRun: result.backupRun }
    const metadata = join(options.root, ids[0], 'nested', 'metadata.json')
    await writeFile(metadata, 'new history state')
    const changed = await inventory(options.root)
    await assert.rejects(planRollback(rollbackOptions), /history-diverged/)
    assert.deepEqual(await inventory(options.root), changed)
    await writeFile(metadata, JSON.stringify({ private: secret }))
    await writeFile(join(options.backupRoot, result.backupRun, ids[0], 'nested', 'metadata.json'), 'bad backup')
    await assert.rejects(planRollback(rollbackOptions), /backup-verification/)
  })
})

test('missing acknowledgment, offline check failure, and stale confirmation refuse before creating backups', async () => {
  await fixture(async (options, base) => {
    const args = await applyOptions(options), before = await inventory(base)
    await assert.rejects(applyRepair({ ...args, offlineConfirmed: false }, { offlineCheck }), /explicit-offline/)
    await assert.rejects(applyRepair(args), /offline-check-required/)
    await assert.rejects(applyRepair(args, { offlineCheck: async () => { throw new Error('running') } }), /running/)
    await assert.rejects(applyRepair({ ...args, confirm: '0'.repeat(64) }, { offlineCheck }), /confirmation-token/)
    assert.deepEqual(await inventory(base), before)
    await writeFile(join(options.root, ids[0], 'new.txt'), 'changed inventory')
    await assert.rejects(applyRepair(args, { offlineCheck }), /confirmation-token/)
    assert.deepEqual(await readdir(options.backupRoot), [])
  })
})

test('scope, ambiguous artifacts, backup overlap, symlinks and hardlinks are refused', async () => {
  await fixture(async (options, base) => {
    for (const sessionIds of [ids.slice(1), [...ids, ids[0]], [ids[0], ids[0], ...ids.slice(2)], ['../outside', ...ids.slice(1)]]) await assert.rejects(planRepair({ ...options, sessionIds }), /six-unique/)
    await assert.rejects(planRepair({ ...options, backupRoot: options.root }), /unsafe-backup/)
    await assert.rejects(planRepair({ ...options, backupRoot: join(base, 'sessions') }), /unsafe-backup/)
    await mkdir(join(options.backupRoot, '.git'))
    await assert.rejects(planRepair(options), /backup-inside-repository/)
    await rm(join(options.backupRoot, '.git'), { recursive: true })
    await writeFile(join(options.root, ids[0], 'session.jsonl.zstd'), 'ambiguous')
    await assert.rejects(planRepair(options), /one-artifact/)
    await rm(join(options.root, ids[0], 'session.jsonl.zstd'))
    const linkPath = join(options.root, ids[0], 'linked')
    await symlink(options.backupRoot, linkPath, process.platform === 'win32' ? 'junction' : 'dir')
    await assert.rejects(planRepair(options), /symlink/)
    await rm(linkPath, { recursive: true })
    await link(join(options.root, ids[0], 'session.jsonl'), join(base, 'hardlink'))
    await assert.rejects(planRepair(options), /hardlinked/)
  })
})

test('real Windows metadata integrates with six-file repair and rollback in isolated fixtures', { skip: process.platform !== 'win32' }, async () => {
  await fixture(async (options, base) => {
    const setup = String.raw`$ErrorActionPreference='Stop'; $p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([Console]::In.ReadToEnd())); $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User; $acl=New-Object Security.AccessControl.DirectorySecurity; $acl.SetAccessRuleProtection($true,$false); $acl.SetOwner($sid); foreach($id in @($sid.Value,'S-1-5-18','S-1-5-32-544')) { $s=New-Object Security.Principal.SecurityIdentifier $id; $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule ($s,'FullControl','ContainerInherit, ObjectInherit','None','Allow'))) }; Set-Acl -LiteralPath $p -AclObject $acl`
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(setup, 'utf16le').toString('base64')], { input: Buffer.from(base).toString('base64'), stdio: ['pipe', 'ignore', 'pipe'] })
    const before = await inventory(options.root)
    const prepared = await actualPlanRepair(options)
    const cliArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('../scripts/repair-alfred-session-events.ps1', import.meta.url)), '-Root', options.root, '-BackupRoot', options.backupRoot, '-SessionIds', ids.join(',')]
    const cliBefore = await inventory(base)
    const cliPreview = JSON.parse(execFileSync('powershell.exe', [...cliArgs, '-DryRun'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
    assert.equal(cliPreview.writes, false)
    assert.equal(cliPreview.confirmationToken, prepared.token)
    assert.equal(cliPreview.offlineReady, false, 'the test Node process must block a concurrent repair CLI')
    assert.throws(() => execFileSync('powershell.exe', [...cliArgs, '-Apply', '-OfflineConfirmed', '-ConfirmToken', prepared.token], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), (error: any) => {
      assert.equal(error.status, 1)
      assert.equal(JSON.parse(error.stdout).error, 'runtime-or-listener-still-running')
      return true
    })
    assert.deepEqual(await inventory(base), cliBefore)
    const result = await actualApplyRepair({ ...options, confirm: prepared.token, offlineConfirmed: true }, { offlineCheck })
    assert.equal(result.status, 'repaired', JSON.stringify(result))
    const rollbackOptions = { ...options, backupRun: result.backupRun, offlineConfirmed: true }
    const rollback = await actualPlanRollback(rollbackOptions)
    assert.equal((await actualRollbackRepair({ ...rollbackOptions, confirm: rollback.token }, { offlineCheck })).status, 'rolled-back')
    assert.deepEqual(await inventory(options.root), before)
  })
})

test('CLI rejects mutation ambiguities, duplicated options and unsafe flags; errors redact native paths', async () => {
  const valid = ['--root', secret, '--backup-root', secret, '--session-ids', ids.join(',')]
  assert.equal(parseArgs(valid).apply, false)
  for (const extra of [['--apply'], ['--apply', '--dry-run'], ['--force'], ['--skip-offline'], ['--root', 'other'], ['--confirm', '0'.repeat(64)], ['--port', '0']]) assert.throws(() => parseArgs([...valid, ...extra]))
  const output: string[] = [], log = console.log
  console.log = value => output.push(String(value))
  try { assert.equal(await main(valid), 1) } finally { console.log = log }
  assert.ok(!output.join('').includes(secret))
  assert.equal(JSON.parse(output[0]).writes, false)
})
