/** Offline recovery engine. CLI owns the Windows process check; tests use isolated fixtures. */
import { lstat, readdir, realpath, readFile, mkdir, open, rename, unlink, rmdir } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { resolve, dirname, join, isAbsolute, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformArtifact } from './alfred-session-repair-codec.mjs'
import { windowsSecurity } from './windows-session-repair-safety.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const ID = /^session-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
const RUN = /^alfred-session-repair-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
const ARTIFACTS = ['session.jsonl', 'session.jsonl.zstd']
const MAX_BYTES = 256 * 1024 * 1024
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const pathKey = p => process.platform === 'win32' ? resolve(p).toLowerCase() : resolve(p)
const inside = (base, value) => pathKey(value) === pathKey(base) || pathKey(value).startsWith(pathKey(base) + sep)
function fail(code) { throw new Error(code) }

async function noLinks(path) {
  for (let p = resolve(path);; p = dirname(p)) {
    const info = await lstat(p)
    if (info.isSymbolicLink()) fail('symlink-refused')
    if (p === dirname(p)) break
  }
}
async function directory(path) {
  await noLinks(path)
  if (!(await lstat(path)).isDirectory()) fail('directory-required')
  return realpath(path)
}
function idsOf(ids) {
  if (!Array.isArray(ids) || ids.length !== 6 || ids.some(id => typeof id !== 'string' || !ID.test(id)) || new Set(ids).size !== 6) fail('exactly-six-unique-session-ids-required')
  return [...ids].sort()
}
async function locations(options) {
  const root = await directory(options.root)
  const backupRoot = await directory(options.backupRoot)
  if (inside(dirname(root), backupRoot) || inside(backupRoot, root) || inside(REPO, backupRoot)) fail('unsafe-backup-location')
  for (let p = backupRoot;; p = dirname(p)) {
    try { await lstat(join(p, '.git')); fail('backup-inside-repository') } catch (error) { if (error.code !== 'ENOENT') throw error }
    if (p === dirname(p)) break
  }
  return { root, backupRoot, sessionIds: idsOf(options.sessionIds) }
}
const stamp = s => [s.dev, s.ino, s.size, s.mtimeNs, s.ctimeNs].map(String).join(':')
async function fileBytes(path) {
  await noLinks(path)
  const before = await lstat(path, { bigint: true })
  if (!before.isFile() || before.nlink !== 1n) fail('nonregular-or-hardlinked-file')
  if (before.size > BigInt(MAX_BYTES)) fail('file-size-limit')
  const bytes = await readFile(path)
  const after = await lstat(path, { bigint: true })
  await noLinks(path)
  if (stamp(before) !== stamp(after) || bytes.length !== Number(before.size)) fail('source-changed')
  return { bytes, hash: digest(bytes), size: bytes.length, stamp: stamp(after), mode: Number(after.mode) & 0o777 }
}
async function tree(root) {
  await directory(root)
  const files = [], directories = ['']
  async function visit(dir, prefix) {
    const names = (await readdir(dir)).sort()
    for (const name of names) {
      const path = join(dir, name), rel = prefix ? `${prefix}/${name}` : name
      const info = await lstat(path)
      if (info.isSymbolicLink()) fail('symlink-refused')
      if (info.isDirectory()) { directories.push(rel); await visit(path, rel) }
      else {
        const value = await fileBytes(path)
        files.push({ name: rel, hash: value.hash, size: value.size, stamp: value.stamp, mode: value.mode })
      }
      if (files.length + directories.length > 100000) fail('tree-size-limit')
    }
  }
  await visit(root, '')
  return { directories: directories.sort(), files: files.sort((a, b) => a.name.localeCompare(b.name)) }
}
const contentTree = value => ({ directories: value.directories, files: value.files.map(({ name, hash, size }) => ({ name, hash, size })) })
async function snapshots(root, ids) {
  const out = []
  for (const id of ids) out.push({ id, tree: await tree(join(root, id)) })
  return out
}
async function unchanged(root, sessions) {
  if (!equal(await snapshots(root, sessions.map(s => s.id)), sessions)) fail('source-changed')
}

/** Dry-run has no mkdir, backup, staging, process launch, or history write. */
export async function planRepair(options, { security = windowsSecurity } = {}) {
  const paths = await locations(options)
  const securitySnapshot = await security.inspect(paths)
  const sessions = await snapshots(paths.root, paths.sessionIds)
  const changes = []
  for (const session of sessions) {
    const logs = session.tree.files.filter(f => ARTIFACTS.includes(f.name))
    if (logs.length !== 1) fail('one-artifact-per-session-required')
    const file = logs[0]
    const source = await fileBytes(join(paths.root, session.id, file.name))
    if (source.hash !== file.hash) fail('source-changed')
    const transformed = transformArtifact(source.bytes, file.name, session.id)
    changes.push({ id: session.id, artifact: file.name, kind: transformed.kind, seq: transformed.seq, originalHash: transformed.originalHash, repairedHash: transformed.repairedHash, repairedSize: transformed.bytes.length })
  }
  await unchanged(paths.root, sessions)
  const count = changes.filter(c => c.kind === 'repair').length
  if (count !== 0 && count !== 6) fail('mixed-repair-state-use-rollback')
  if (!equal(securitySnapshot, await security.inspect(paths))) fail('security-metadata-changed')
  const plan = { version: 1, ...paths, sessions, changes, securitySnapshot }
  return { plan, token: digest(JSON.stringify(plan)) }
}
export function summarize({ plan, token }) {
  return { command: 'repair-alfred-session-events', status: plan.changes.every(c => c.kind === 'already-marked') ? 'already-repaired' : 'planned', writes: false, confirmationToken: token, sessions: plan.changes, offlineCheckRequiredForApply: true, nativeStreamCheckRequiredForApply: true }
}
async function persistNew(path, bytes, mode = 0o600) {
  const file = await open(path, 'wx', mode)
  try { await file.writeFile(bytes); await file.sync() } finally { await file.close() }
}
async function backupAll(plan, runDir) {
  for (const session of plan.sessions) {
    const destination = join(runDir, session.id)
    await mkdir(destination, { mode: 0o700 })
    for (const dir of session.tree.directories.filter(Boolean)) await mkdir(join(destination, dir), { recursive: true, mode: 0o700 })
    for (const entry of session.tree.files) {
      const source = await fileBytes(join(plan.root, session.id, entry.name))
      if (source.hash !== entry.hash || source.stamp !== entry.stamp) fail('source-changed')
      await persistNew(join(destination, entry.name), source.bytes)
    }
    if (!equal(contentTree(await tree(destination)), contentTree(session.tree))) fail('backup-verification-failed')
  }
}
async function requireOffline(check) {
  if (typeof check !== 'function') fail('offline-check-required')
  await check()
}
const stageName = run => `.${run}-stage`
async function cleanupStage(root, run, changes) {
  const stage = join(root, stageName(run))
  try { await directory(stage) } catch (error) { if (error.code === 'ENOENT') return; throw error }
  for (const change of changes) {
    for (const suffix of ['.new', '.restore']) {
      try { await unlink(join(stage, change.id + suffix)) } catch (error) { if (error.code !== 'ENOENT') throw error }
    }
  }
  try { await rmdir(stage) } catch (error) { if (error.code !== 'ENOENT') throw error }
}
async function verifyBackups(runDir, plan) {
  for (const session of plan.sessions) {
    if (!equal(contentTree(await tree(join(runDir, session.id))), contentTree(session.tree))) fail('backup-verification-failed')
  }
  for (const change of plan.changes) {
    const original = await fileBytes(join(runDir, change.id, change.artifact))
    const transformed = transformArtifact(original.bytes, change.artifact, change.id)
    if (transformed.kind !== 'repair' || transformed.originalHash !== change.originalHash || transformed.repairedHash !== change.repairedHash || transformed.seq !== change.seq) fail('backup-verification-failed')
  }
}
// Refuse rollback after resumed/edited histories; preflight ALL files before restoring any.
async function inspectTransaction(plan) {
  const current = await snapshots(plan.root, plan.sessionIds)
  for (const session of current) {
    const before = plan.sessions.find(s => s.id === session.id)
    const change = plan.changes.find(c => c.id === session.id)
    const expected = contentTree(before.tree), actual = contentTree(session.tree)
    const log = actual.files.find(f => f.name === change.artifact)
    if (!log || ![change.originalHash, change.repairedHash].includes(log.hash)) fail('history-diverged-no-overwrite')
    if (log.hash === change.repairedHash) { log.hash = change.originalHash; log.size = expected.files.find(f => f.name === change.artifact).size }
    if (!equal(actual, expected)) fail('history-diverged-no-overwrite')
  }
  return current
}
async function assertSecurity(plan, security, verifyStreams = true) {
  if (!equal(plan.securitySnapshot, await security.inspect({ ...plan, verifyStreams }))) fail('security-metadata-changed')
}
async function restore(runDir, plan, run, check, security) {
  await requireOffline(check)
  await assertSecurity(plan, security)
  await verifyBackups(runDir, plan)
  const observed = await inspectTransaction(plan)
  const stage = join(plan.root, stageName(run))
  try { await mkdir(stage, { mode: 0o700 }) } catch (error) { if (error.code !== 'EEXIST') throw error; await directory(stage) }
  await security.inspect({ ...plan, backupRoot: stage, verifyStreams: true })
  for (const change of plan.changes) {
    const current = observed.find(s => s.id === change.id).tree.files.find(f => f.name === change.artifact)
    if (current.hash === change.originalHash) continue
    const original = await fileBytes(join(runDir, change.id, change.artifact))
    const temp = join(stage, change.id + '.restore')
    // A crash may leave OUR staged restore; only reuse it if its bytes are exact.
    try { await persistNew(temp, original.bytes, current.mode) } catch (error) {
      if (error.code !== 'EEXIST' || (await fileBytes(temp)).hash !== change.originalHash) throw error
    }
    await requireOffline(check)
    const destination = join(plan.root, change.id, change.artifact)
    if ((await fileBytes(destination)).hash !== change.repairedHash) fail('history-diverged-no-overwrite')
    await assertSecurity(plan, security)
    await security.preserve(destination, temp)
    await requireOffline(check)
    if ((await fileBytes(destination)).hash !== change.repairedHash || (await fileBytes(temp)).hash !== change.originalHash) fail('history-diverged-no-overwrite')
    await rename(temp, destination)
    if ((await fileBytes(destination)).hash !== change.originalHash) fail('restore-verification-failed')
  }
  const final = await snapshots(plan.root, plan.sessionIds)
  if (!equal(final.map(s => ({ id: s.id, tree: contentTree(s.tree) })), plan.sessions.map(s => ({ id: s.id, tree: contentTree(s.tree) })))) fail('restore-verification-failed')
  await cleanupStage(plan.root, run, plan.changes)
}

/** Explicit apply only. A caught failure attempts rollback; crashes retain a verified journal. */
export async function applyRepair(options, { offlineCheck, afterReplace, security = windowsSecurity } = {}) {
  if (options.offlineConfirmed !== true) fail('explicit-offline-confirmation-required')
  await requireOffline(offlineCheck)
  const prepared = await planRepair(options, { security })
  if (options.confirm !== prepared.token) fail('confirmation-token-mismatch')
  if (prepared.plan.changes.every(c => c.kind === 'already-marked')) return summarize(prepared)
  const { plan } = prepared
  await requireOffline(offlineCheck)
  await assertSecurity(plan, security)
  const run = `alfred-session-repair-${randomUUID()}`, runDir = join(plan.backupRoot, run)
  await mkdir(runDir, { mode: 0o700 })
  let journalReady = false
  try {
    await security.inspect({ ...plan, backupRoot: runDir, verifyStreams: true })
    await backupAll(plan, runDir)
    await unchanged(plan.root, plan.sessions)
    await assertSecurity(plan, security)
    await persistNew(join(runDir, 'transaction.json'), Buffer.from(JSON.stringify({ run, token: prepared.token, plan }) + '\n'))
    journalReady = true
    const stage = join(plan.root, stageName(run))
    await requireOffline(offlineCheck)
    await mkdir(stage, { mode: 0o700 })
    await security.inspect({ ...plan, backupRoot: stage, verifyStreams: true })
    for (const change of plan.changes) {
      const original = await fileBytes(join(runDir, change.id, change.artifact))
      const transformed = transformArtifact(original.bytes, change.artifact, change.id)
      if (transformed.repairedHash !== change.repairedHash) fail('transform-changed')
      const mode = plan.sessions.find(s => s.id === change.id).tree.files.find(f => f.name === change.artifact).mode
      const temp = join(stage, change.id + '.new')
      await persistNew(temp, transformed.bytes, mode)
      if ((await fileBytes(temp)).hash !== change.repairedHash) fail('staging-verification-failed')
    }
    await unchanged(plan.root, plan.sessions)
    for (const [index, change] of plan.changes.entries()) {
      await requireOffline(offlineCheck)
      await inspectTransaction(plan)
      const destination = join(plan.root, change.id, change.artifact)
      if ((await fileBytes(destination)).hash !== change.originalHash) fail('source-changed')
      await assertSecurity(plan, security)
      await security.preserve(destination, join(stage, change.id + '.new'))
      await requireOffline(offlineCheck)
      if ((await fileBytes(destination)).hash !== change.originalHash || (await fileBytes(join(stage, change.id + '.new'))).hash !== change.repairedHash) fail('source-or-staging-changed')
      await rename(join(stage, change.id + '.new'), destination)
      if ((await fileBytes(destination)).hash !== change.repairedHash) fail('write-verification-failed')
      await afterReplace?.(index, { runDir, destination })
    }
    await inspectTransaction(plan)
    await cleanupStage(plan.root, run, plan.changes)
    return { command: 'repair-alfred-session-events', status: 'repaired', writes: true, backupRun: run, sessions: plan.changes, rollbackRequiresOffline: true }
  } catch {
    let rollback = 'not-needed-source-not-written'
    if (journalReady) {
      try { await restore(runDir, plan, run, offlineCheck, security); rollback = 'verified-restored' } catch { rollback = 'pending-stop-dsh-and-use-rollback' }
    }
    return { command: 'repair-alfred-session-events', status: 'failed', backupRun: run, journalReady, rollback, error: 'repair-failed-redacted' }
  }
}

/** Rollback preview derives a confirmation token from the exact CURRENT six trees. */
export async function planRollback(options, { security = windowsSecurity } = {}) {
  const paths = await locations(options)
  if (!RUN.test(options.backupRun ?? '')) fail('invalid-backup-run')
  const runDir = await directory(join(paths.backupRoot, options.backupRun))
  const journal = await fileBytes(join(runDir, 'transaction.json'))
  const text = new TextDecoder('utf-8', { fatal: true }).decode(journal.bytes)
  const value = JSON.parse(text)
  if (JSON.stringify(value) + '\n' !== text) fail('invalid-journal')
  const plan = value.plan
  if (value.run !== options.backupRun || plan?.version !== 1 || pathKey(plan.root) !== pathKey(paths.root) || pathKey(plan.backupRoot) !== pathKey(paths.backupRoot) || !equal(plan.sessionIds, paths.sessionIds) || value.token !== digest(JSON.stringify(plan))) fail('journal-scope-mismatch')
  if (!Array.isArray(plan.sessions) || !Array.isArray(plan.changes) || plan.sessions.length !== 6 || plan.changes.length !== 6 || !equal(plan.sessions.map(s => s.id), paths.sessionIds) || !equal(plan.changes.map(c => c.id), paths.sessionIds)) fail('invalid-journal')
  for (const session of plan.sessions) {
    for (const name of [...session.tree.directories, ...session.tree.files.map(f => f.name)]) {
      if (typeof name !== 'string' || isAbsolute(name) || name.includes('\\') || name.split('/').some(part => part === '.' || part === '..') || name.includes(':')) fail('unsafe-journal-path')
    }
  }
  if (plan.changes.some(c => !ARTIFACTS.includes(c.artifact) || c.kind !== 'repair')) fail('invalid-journal')
  await assertSecurity(plan, security, false)
  await verifyBackups(runDir, plan)
  const current = await inspectTransaction(plan)
  if (!equal(current, await snapshots(paths.root, paths.sessionIds))) fail('source-changed')
  return { plan, runDir, run: value.run, token: digest(JSON.stringify({ journal: journal.hash, current })) }
}
export async function rollbackRepair(options, { offlineCheck, security = windowsSecurity } = {}) {
  if (options.offlineConfirmed !== true) fail('explicit-offline-confirmation-required')
  await requireOffline(offlineCheck)
  const preview = await planRollback(options, { security })
  if (options.confirm !== preview.token) fail('confirmation-token-mismatch')
  try {
    await restore(preview.runDir, preview.plan, preview.run, offlineCheck, security)
    return { command: 'repair-alfred-session-events', status: 'rolled-back', writes: true, backupRun: preview.run }
  } catch {
    return { command: 'repair-alfred-session-events', status: 'failed', writesMayHaveOccurred: true, backupRun: preview.run, rollback: 'pending-keep-dsh-stopped-repreview-rollback' }
  }
}
