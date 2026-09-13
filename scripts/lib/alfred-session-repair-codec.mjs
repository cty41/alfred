import { createHash } from 'node:crypto'
import { constants, zstdCompressSync } from 'node:zlib'
import { decodeZstd, inspectJsonl } from '../preview-alfred-session-events.mjs'

const MAX_BYTES = 256 * 1024 * 1024
const INSERTION = Buffer.from(',"ignorable":true')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
class CodecError extends Error {}
const fail = code => { throw new CodecError(code) }

function inspect(bytes, sessionId) {
  const result = inspectJsonl(bytes)
  if (result.errors.length) fail('invalid-jsonl')
  if (!result.sessionId || result.sessionId !== sessionId) fail('session-id-mismatch')
  if (result.targets.length !== 1) fail('target-count')
  const target = result.targets[0]
  if (target.event !== 'alfred/available' || !['empty-object-unmarked-candidate', 'already-marked'].includes(target.classification)) fail('ineligible-target')
  return result
}

// Pure codec: no filesystem access, repair authorization, or backup ownership.
// Hashes cover artifact bytes (compressed when applicable), not decoded JSONL.
export function transformArtifact(bytes, artifactName, sessionId) {
  try {
    if (!Buffer.isBuffer(bytes)) fail('invalid-bytes')
    if (artifactName !== 'session.jsonl' && artifactName !== 'session.jsonl.zstd') fail('invalid-artifact-name')
    if (bytes.length > MAX_BYTES) fail('size-limit')
    const compressed = artifactName === 'session.jsonl.zstd'
    let decoded
    try { decoded = compressed ? decodeZstd(bytes) : bytes } catch { fail('invalid-zstd') }
    const before = inspect(decoded, sessionId)
    const target = before.targets[0]

    // Work in byte offsets: UTF-8 widths, BOM, CRLF, and surrounding whitespace
    // must never be normalized by decoding/re-encoding the whole artifact.
    let start = decoded.indexOf(10) + 1 // skip the inspected header
    let insertionOffset = -1
    while (start < decoded.length) {
      const end = decoded.indexOf(10, start)
      if (end < 0) fail('verification-failed')
      const line = decoded.subarray(start, end).toString('utf8')
      const row = JSON.parse(line)
      if (row.type === 'alfred/available') {
        if (JSON.stringify(row) !== line.trim()) fail('noncanonical-target')
        // Canonical target JSON is an object ending in its own closing brace.
        insertionOffset = start + Buffer.byteLength(line.slice(0, line.lastIndexOf('}')), 'utf8')
        break
      }
      start = end + 1
    }
    if (insertionOffset < 0 || decoded[insertionOffset] !== 125) fail('verification-failed')
    const originalHash = hash(bytes)
    if (target.classification === 'already-marked') {
      return { kind: 'already-marked', seq: target.seq, originalHash, repairedHash: originalHash, bytes }
    }

    const repaired = Buffer.concat([decoded.subarray(0, insertionOffset), INSERTION, decoded.subarray(insertionOffset)])
    if (repaired.length > MAX_BYTES) fail('size-limit')
    if (!Buffer.concat([repaired.subarray(0, insertionOffset), repaired.subarray(insertionOffset + INSERTION.length)]).equals(decoded)) fail('verification-failed')
    const after = inspect(repaired, sessionId)
    if (['sessionId', 'rows', 'logicalEvents', 'packedRows', 'firstSeq', 'lastSeq'].some(key => before[key] !== after[key]) || after.targets[0].seq !== target.seq || after.targets[0].classification !== 'already-marked') fail('verification-failed')

    let output = repaired
    if (compressed) {
      try {
        // Preserve zstd format, not frame boundaries; caller retains original backup.
        output = zstdCompressSync(repaired, { params: { [constants.ZSTD_c_checksumFlag]: 1 } })
        if (!decodeZstd(output).equals(repaired)) fail('verification-failed')
      } catch (error) {
        if (error instanceof CodecError) throw error
        fail('zstd-roundtrip-failed')
      }
    }
    if (output.length > MAX_BYTES) fail('size-limit')
    return { kind: 'repair', seq: target.seq, originalHash, repairedHash: hash(output), bytes: output }
  } catch (error) {
    // Never expose JSON payloads, native decoder messages, or caller paths.
    throw new Error(error instanceof CodecError ? error.message : 'codec-failed')
  }
}
