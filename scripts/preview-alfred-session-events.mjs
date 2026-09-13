#!/usr/bin/env node
/**
 * READ ONLY. No repair/write mode and no DSH runtime imports.
 * Format inspected in DSH session-persistence-jsonl/src/{format,zstd}.ts and
 * core/session/src/{types,chunk-rows}.ts: v0 header; concatenated zstd frames;
 * packed chunk rows use seq0 and texts/args lengths, not one seq per row.
 * Only root/<session-directory>/session.jsonl[.zstd] is read. No metadata,
 * profiles, media, or recursive directory traversal. Output contains no payloads.
 * Stable double reads are observations, NOT locks, inactivity proof, or repair authorization.
 */
import { lstat, readdir, open } from 'node:fs/promises'
import { constants } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { zstdDecompressSync } from 'node:zlib'

const TARGETS = new Set(['alfred/available', 'alfred/legacy-global'])
const PACKED = new Set(['text-chunks', 'reasoning-chunks', 'tool-call-chunks'])
const FILES = new Set(['session.jsonl', 'session.jsonl.zstd'])
const MAX_BYTES = 256 * 1024 * 1024
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x)
const nat = x => Number.isSafeInteger(x) && x >= 0 && !Object.is(x, -0)
const exact = (x, keys) => object(x) && Object.keys(x).length === keys.length && keys.every(k => Object.hasOwn(x, k))
const safeId = id => typeof id === 'string' && /^session-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null
const fail = code => { throw new Error(code) }

// DSH appends independently checksummed frames. Scan boundaries ourselves:
// Node one-shot decoding is not sufficient to prove every concatenated frame
// was consumed, nor to distinguish a truncated frame on all supported builds.
export function decodeZstd(bytes) {
  const parts = []
  let offset = 0
  let decodedBytes = 0
  const need = count => { if (offset + count > bytes.length) fail('invalid-zstd') }
  if (!bytes.length) fail('invalid-zstd')
  while (offset < bytes.length) {
    const start = offset
    need(4)
    if (bytes.readUInt32LE(offset) !== 0xfd2fb528) fail('invalid-zstd')
    offset += 4
    need(1)
    const descriptor = bytes[offset++]
    if (descriptor & 0x18) fail('invalid-zstd')
    const flag = descriptor >>> 6
    const single = Boolean(descriptor & 0x20)
    const dict = descriptor & 3
    const headerBytes = (single ? 0 : 1) + (dict === 3 ? 4 : dict) + (flag === 0 ? (single ? 1 : 0) : 1 << flag)
    need(headerBytes)
    offset += headerBytes
    for (;;) {
      need(3)
      const block = bytes.readUIntLE(offset, 3)
      offset += 3
      const type = (block >>> 1) & 3
      if (type === 3) fail('invalid-zstd')
      const length = type === 1 ? 1 : block >>> 3
      need(length)
      offset += length
      if (block & 1) break
    }
    if (descriptor & 4) { need(4); offset += 4 }
    const part = zstdDecompressSync(bytes.subarray(start, offset), { maxOutputLength: MAX_BYTES - decodedBytes })
    decodedBytes += part.length
    if (decodedBytes >= MAX_BYTES) fail('invalid-zstd')
    parts.push(part)
  }
  return Buffer.concat(parts, decodedBytes)
}

function packedLength(row) {
  if (!exact(row, ['type', 'seq0', 'time0', 'data']) || !nat(row.seq0) || !Number.isSafeInteger(row.time0)) fail('invalid-packed-row')
  const d = row.data
  const tool = row.type === 'tool-call-chunks'
  const keys = tool ? ['turn', 'step', 'index', 'id', 'dt', 'args'] : ['turn', 'step', 'index', 'dt', 'texts']
  if (tool && object(d) && Object.hasOwn(d, 'name')) keys.push('name')
  if (!exact(d, keys) || !['turn', 'step', 'index'].every(k => typeof d[k] === 'number' && Number.isFinite(d[k]))) fail('invalid-packed-row')
  if (tool && (typeof d.id !== 'string' || (Object.hasOwn(d, 'name') && typeof d.name !== 'string'))) fail('invalid-packed-row')
  const payload = tool ? d.args : d.texts
  if (!Array.isArray(payload) || !payload.length || !payload.every(v => typeof v === 'string') || !Array.isArray(d.dt) || d.dt.length !== payload.length - 1 || !d.dt.every(Number.isSafeInteger)) fail('invalid-packed-row')
  let time = row.time0
  for (const gap of d.dt) { time += gap; if (!Number.isSafeInteger(time)) fail('invalid-packed-row') }
  if (!nat(row.seq0 + payload.length - 1)) fail('invalid-packed-row')
  return payload.length
}

// Validate provenance range structure without expanding potentially huge ranges.
function validProvenance(values, seq) {
  if (!Array.isArray(values)) return false
  let last = -1
  let count = 0
  let increasing = true
  let hasRange = false
  for (const value of values) {
    const range = Array.isArray(value)
    if (range && value.length !== 2) return false
    const start = range ? value[0] : value
    const end = range ? value[1] : value
    if (!nat(start) || !nat(end) || end < start) return false
    increasing &&= start > last
    hasRange ||= range
    count += end - start + 1
    if (count > seq) return false
    last = end
  }
  // DSH preserves order/duplicates in unpacked source arrays, but requires
  // strict increasing order if any storage ranges are present.
  return !hasRange || increasing
}

export function inspectJsonl(bytes) {
  const result = { sessionId: null, rows: 0, logicalEvents: 0, packedRows: 0, firstSeq: null, lastSeq: null, targets: [], errors: [] }
  const issue = (code, line) => result.errors.push({ code, ...(line === undefined ? {} : { line }) })
  let text
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { issue('invalid-utf8'); return result }
  const lines = text.split('\n')
  if (lines.at(-1) === '') lines.pop()
  else issue('incomplete-jsonl-tail', lines.length)
  if (!lines.length) { issue('missing-header'); return result }
  let expectedSeq = 0
  for (let i = 0; i < lines.length; i++) {
    let row
    try { row = JSON.parse(lines[i]) } catch { issue('invalid-json', i + 1); continue }
    if (i === 0) {
      if (!object(row) || row.type !== 'session' || row.version !== 0 || typeof row.id !== 'string' || !nat(row.createdAt) || !nat(row.delegationDepth) || (row.origin !== undefined && row.origin !== 'subagent') || (row.agentPreset !== undefined && typeof row.agentPreset !== 'string') || Object.hasOwn(row, 'sandboxMode') || Object.hasOwn(row, 'approvalPolicy')) issue('invalid-or-unsupported-header', 1)
      else result.sessionId = safeId(row.id)
      continue
    }
    result.rows++
    if (!object(row) || typeof row.type !== 'string') { issue('invalid-event-envelope', i + 1); continue }
    const packed = PACKED.has(row.type)
    let count = 1
    const seq = packed ? row.seq0 : row.seq
    let valid = true
    if (packed) {
      try { count = packedLength(row); result.packedRows++ } catch { issue('invalid-packed-row', i + 1); valid = false }
    } else if (!nat(seq) || !Number.isSafeInteger(row.time) || !Object.hasOwn(row, 'data') || row.type.length === 0 || (Object.hasOwn(row, 'ignorable') && row.ignorable !== true)) {
      issue('invalid-event-envelope', i + 1); valid = false
    }
    if (Object.hasOwn(row, 'sourceEventSeqs') && !validProvenance(row.sourceEventSeqs, seq)) { issue('invalid-provenance', i + 1); valid = false }
    if (nat(seq)) {
      if (seq !== expectedSeq) issue('noncontiguous-seq', i + 1)
      expectedSeq = seq + count
      result.firstSeq ??= seq
      result.lastSeq = seq + count - 1
    }
    if (valid) result.logicalEvents += count
    if (TARGETS.has(row.type)) {
      const empty = exact(row.data, [])
      const envelope = exact(row, ['type', 'seq', 'time', 'data'])
      const classification = valid && empty && envelope ? 'empty-object-unmarked-candidate'
        : valid && empty && row.ignorable === true && exact(row, ['type', 'seq', 'time', 'data', 'ignorable']) ? 'already-marked' : 'manual-review'
      result.targets.push({ event: row.type, seq: nat(seq) ? seq : null, classification })
    }
  }
  return result
}

async function noSymlinkAncestors(path) {
  for (let current = resolve(path);; current = dirname(current)) {
    const info = await lstat(current)
    if (info.isSymbolicLink()) fail('symlink-refused')
    if (dirname(current) === current) break
  }
}
const stamp = s => [s.dev, s.ino, s.size, s.mtimeNs, s.ctimeNs].map(String).join(':')
async function snapshot(path) {
  await noSymlinkAncestors(path)
  const before = await lstat(path, { bigint: true })
  if (!before.isFile() || before.isSymbolicLink()) fail('nonregular-file-refused')
  if (before.size > BigInt(MAX_BYTES)) fail('size-limit')
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const opened = await file.stat({ bigint: true })
    if (stamp(opened) !== stamp(before)) fail('file-changed-during-open')
    // Fixed-size read prevents an active append from creating an unbounded read.
    const bytes = Buffer.alloc(Number(before.size))
    let offset = 0
    while (offset < bytes.length) {
      const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, offset)
      if (!bytesRead) break
      offset += bytesRead
    }
    const after = await file.stat({ bigint: true })
    await noSymlinkAncestors(path)
    const pathAfter = await lstat(path, { bigint: true })
    return { bytes: bytes.subarray(0, offset), stamp: stamp(after), changed: offset !== bytes.length || stamp(before) !== stamp(after) || stamp(after) !== stamp(pathAfter) }
  } finally { await file.close() }
}

const ERROR_CODES = new Set(['symlink-refused', 'nonregular-file-refused', 'size-limit', 'file-changed-during-open'])
const redactError = error => ERROR_CODES.has(error?.message) ? error.message : 'filesystem-read-failed'

async function inventory(root) {
  await noSymlinkAncestors(root)
  if (!(await lstat(root)).isDirectory()) fail('invalid-root')
  const paths = []
  const errors = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) { errors.push({ code: 'symlink-refused' }); continue }
    if (!entry.isDirectory()) continue
    const dir = join(root, entry.name)
    try {
      await noSymlinkAncestors(dir)
      const names = await readdir(dir, { withFileTypes: true })
      for (const child of names) {
        if (!FILES.has(child.name)) continue
        if (child.isSymbolicLink() || !child.isFile()) { errors.push({ code: 'nonregular-file-refused' }); continue }
        paths.push({ path: join(dir, child.name), directoryId: safeId(entry.name), artifact: child.name })
      }
    } catch (error) { errors.push({ code: redactError(error) }) }
  }
  paths.sort((a, b) => a.path.localeCompare(b.path))
  return { paths, errors }
}

export async function preview(root) {
  const report = { mode: 'read-only-preview', repairAuthorized: false, scope: 'ALF-marker-candidates-only-not-unknown-event-audit-or-recoverability-proof', activity: 'unlocked-observation-not-proof-of-inactivity', inventoryChanged: false, inventoryHashBefore: null, inventoryHashAfter: null, files: [], errors: [], totals: {} }
  let initial
  try { initial = await inventory(resolve(root)) } catch (error) { report.errors.push({ code: redactError(error) }); return report }
  report.errors.push(...initial.errors)
  const inventoryHash = entries => hash(entries.map(x => x.path).join('\n'))
  report.inventoryHashBefore = inventoryHash(initial.paths)
  const firstObservations = new Map()
  for (const item of initial.paths) {
    const output = { directoryId: item.directoryId, artifact: item.artifact, sha256Before: null, sha256After: null, changed: null, ...inspectJsonl(Buffer.from('')) }
    output.errors = []
    report.files.push(output)
    let first
    try {
      first = await snapshot(item.path)
      firstObservations.set(item.path, { stamp: first.stamp, changed: first.changed })
      output.sha256Before = hash(first.bytes)
      try {
        const decoded = item.artifact.endsWith('.zstd') ? decodeZstd(first.bytes) : first.bytes
        Object.assign(output, inspectJsonl(decoded))
      } catch { output.errors.push({ code: 'zstd-decode-failed-or-incomplete' }) }
      if (output.sessionId && item.directoryId && output.sessionId !== item.directoryId) output.errors.push({ code: 'session-id-mismatch' })
    } catch (error) { output.errors.push({ code: redactError(error) }) }
  }
  // Re-read only after the complete first pass, widening the change-detection
  // window without retaining private buffers for every session at once.
  for (const [index, item] of initial.paths.entries()) {
    const output = report.files[index]
    const first = firstObservations.get(item.path)
    try {
      const second = await snapshot(item.path)
      output.sha256After = hash(second.bytes)
      output.changed = !first || first.changed || second.changed || first.stamp !== second.stamp || output.sha256Before !== output.sha256After
    } catch (error) { output.changed = true; output.errors.push({ code: redactError(error) }) }
  }
  try {
    const final = await inventory(resolve(root))
    report.errors.push(...final.errors)
    report.inventoryHashAfter = inventoryHash(final.paths)
    report.inventoryChanged = report.inventoryHashBefore !== report.inventoryHashAfter
  } catch (error) { report.inventoryChanged = true; report.errors.push({ code: redactError(error) }) }
  const targets = report.files.flatMap(f => f.targets)
  const candidates = targets.filter(t => t.classification === 'empty-object-unmarked-candidate')
  report.totals = {
    files: report.files.length,
    affectedFiles: report.files.filter(f => f.targets.some(t => t.classification !== 'already-marked')).length,
    logicalEvents: report.files.reduce((n, f) => n + f.logicalEvents, 0),
    packedRows: report.files.reduce((n, f) => n + f.packedRows, 0),
    targetEvents: targets.length,
    emptyObjectUnmarkedCandidates: candidates.length,
    alreadyMarked: targets.filter(t => t.classification === 'already-marked').length,
    manualReview: targets.filter(t => t.classification === 'manual-review').length,
    changingFiles: report.files.filter(f => f.changed !== false).length,
    errors: report.errors.length + report.files.reduce((n, f) => n + f.errors.length, 0),
  }
  return report
}

export async function main(args = process.argv.slice(2)) {
  if (args.length !== 2 || args[0] !== '--root' || !args[1] || args[1].startsWith('--')) {
    console.log(JSON.stringify({ mode: 'read-only-preview', repairAuthorized: false, errors: [{ code: 'usage-requires-only-explicit-root' }] }))
    return 2
  }
  try {
    const report = await preview(args[1])
    console.log(JSON.stringify(report, null, 2))
    return report.errors.length || report.totals.errors || report.inventoryChanged || report.totals.changingFiles ? 1 : 0
  } catch {
    console.log(JSON.stringify({ mode: 'read-only-preview', repairAuthorized: false, errors: [{ code: 'preview-failed-redacted' }] }))
    return 1
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await main()
