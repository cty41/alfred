import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { constants, zstdCompressSync } from 'node:zlib'
import { transformArtifact } from '../scripts/lib/alfred-session-repair-codec.mjs'
import { decodeZstd, inspectJsonl } from '../scripts/preview-alfred-session-events.mjs'

const id = 'session-12345678-1234-1234-1234-123456789abc'
const header = { type: 'session', version: 0, id, createdAt: 0, delegationDepth: 0 }
const event = (seq = 0) => ({ type: 'alfred/available', seq, time: 1700000000000, data: {} })
const jsonl = (rows: unknown[] = [event()], h: unknown = header) => Buffer.from([h, ...rows].map(x => JSON.stringify(x)).join('\n') + '\n')
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const compress = (bytes: Buffer) => zstdCompressSync(bytes, { params: { [constants.ZSTD_c_checksumFlag]: 1 } })
const reject = (bytes: Buffer, code: string, name = 'session.jsonl', sessionId = id) => {
  assert.throws(() => transformArtifact(bytes, name, sessionId), (error: Error) => {
    assert.equal(error.message, code)
    assert.equal(error.cause, undefined)
    return true
  })
}

test('raw repair inserts only the marker and hashes artifact bytes', () => {
  const input = jsonl()
  const saved = Buffer.from(input)
  const result = transformArtifact(input, 'session.jsonl', id)
  assert.equal(result.kind, 'repair')
  assert.equal(result.seq, 0)
  assert.equal(result.originalHash, digest(input))
  assert.equal(result.repairedHash, digest(result.bytes))
  assert.deepEqual(input, saved)
  assert.equal(result.bytes.toString(), input.toString().replace('"data":{}}', '"data":{},"ignorable":true}'))
  assert.deepEqual(inspectJsonl(result.bytes).errors, [])
})

test('preserves BOM, CRLF, whitespace, timestamp/data order, Unicode, and packed sequences', () => {
  const packed = { type: 'text-chunks', seq0: 0, time0: 90, data: { turn: 0, step: 0, index: 0, dt: [1, 2], texts: ['你', 'x', 'z'] } }
  const target = { data: {}, time: -123, seq: 3, type: 'alfred/available' }
  const following = { type: 'opaque-event', seq: 4, time: 0, data: { text: '🙂', decoy: 'alfred/available' } }
  const prefix = '\ufeff ' + JSON.stringify(header) + ' \r\n ' + JSON.stringify(packed) + '\t\r\n\t '
  const suffix = '\t\r\n' + JSON.stringify(following, null, 0).replace('"seq":4', '"seq" : 4') + '\r\n'
  const targetText = JSON.stringify(target)
  const input = Buffer.from(prefix + targetText + suffix)
  const result = transformArtifact(input, 'session.jsonl', id)
  assert.equal(result.seq, 3)
  assert.deepEqual(result.bytes, Buffer.from(prefix + targetText.slice(0, -1) + ',"ignorable":true}' + suffix))
  const inspected = inspectJsonl(result.bytes)
  assert.equal(inspected.rows, 3)
  assert.equal(inspected.logicalEvents, 5)
  assert.equal(inspected.packedRows, 1)
})

test('all packed chunk types contribute their logical sequence ranges', () => {
  const rows = ['text-chunks', 'reasoning-chunks', 'tool-call-chunks'].map((type, index) => ({
    type, seq0: index * 2, time0: 100,
    data: { turn: 0, step: 0, index: 0, dt: [1], ...(type === 'tool-call-chunks' ? { id: 'call', name: 'test', args: ['{', '}'] } : { texts: ['a', 'b'] }) },
  }))
  const result = transformArtifact(jsonl([...rows, event(6)]), 'session.jsonl', id)
  assert.equal(result.seq, 6)
  assert.equal(inspectJsonl(result.bytes).logicalEvents, 7)
})

test('zstd concatenated frames, even splits inside UTF-8, roundtrip with checksum', () => {
  const input = jsonl([{ type: 'opaque', seq: 0, time: 0, data: '你🙂' }, event(1)])
  const split = input.indexOf(Buffer.from('你')) + 1
  const frames = Buffer.concat([compress(input.subarray(0, 7)), compress(input.subarray(7, split)), compress(input.subarray(split))])
  const saved = Buffer.from(frames)
  const result = transformArtifact(frames, 'session.jsonl.zstd', id)
  assert.equal(result.kind, 'repair')
  assert.equal(result.seq, 1)
  assert.equal(result.bytes.readUInt32LE(0), 0xfd2fb528)
  assert.ok(result.bytes[4] & 4, 'output frame includes checksum')
  assert.deepEqual(decodeZstd(result.bytes), transformArtifact(input, 'session.jsonl', id).bytes)
  assert.equal(result.originalHash, digest(frames))
  assert.equal(result.repairedHash, digest(result.bytes))
  assert.deepEqual(frames, saved)
})

test('already marked raw and multiframe zstd return original Buffer identity', () => {
  const raw = jsonl([{ ...event(), ignorable: true }])
  for (const [name, input] of [
    ['session.jsonl', raw],
    ['session.jsonl.zstd', Buffer.concat([compress(raw.subarray(0, 31)), compress(raw.subarray(31))])],
  ] as const) {
    const result = transformArtifact(input, name, id)
    assert.equal(result.kind, 'already-marked')
    assert.equal(result.bytes, input)
    assert.equal(result.originalHash, result.repairedHash)
    assert.equal(result.originalHash, digest(input))
  }
  for (const name of ['session.jsonl', 'session.jsonl.zstd']) {
    const first = transformArtifact(name.endsWith('.zstd') ? compress(jsonl()) : jsonl(), name, id)
    const second = transformArtifact(first.bytes, name, id)
    assert.equal(second.kind, 'already-marked')
    assert.equal(second.bytes, first.bytes)
  }
})

test('rejects duplicate keys and ambiguous target spelling, even already marked', () => {
  const canonical = JSON.stringify(event())
  for (const target of [
    canonical.replace('"seq":0', '"seq":99,"seq":0'),
    canonical.replace('"data":{}', '"data":{"secret":"payload"},"data":{}'),
    canonical.replace('"type":', '"type":"other","type":'),
    canonical.replace('"data":{}', '"data": {},"ignorable":false,"ignorable":true'),
    canonical.replace('"seq":0', '"seq":0.0'),
    canonical.replace('alfred/available', 'alfred\\/available'),
    canonical.replace('"data":{}', '"data": {}'),
    JSON.stringify({ ...event(), ignorable: true }).replace('"seq":0', '"seq":0,"seq":0'),
  ]) reject(Buffer.from(JSON.stringify(header) + '\n' + target + '\n'), 'noncanonical-target')
})

test('rejects missing/multiple ALF targets, legacy, nonempty data and extra fields', () => {
  reject(jsonl([]), 'target-count')
  reject(jsonl([event(), event(1)]), 'target-count')
  reject(jsonl([event(), { ...event(1), type: 'alfred/legacy-global' }]), 'target-count')
  for (const row of [
    { ...event(), type: 'alfred/legacy-global' },
    { ...event(), type: 'alfred/legacy-global', ignorable: true },
    { ...event(), data: { private: 'secret' } },
    { ...event(), data: [] }, { ...event(), data: null },
    { ...event(), extra: 'secret' }, { ...event(), sourceEventSeqs: [] },
    { ...event(), ignorable: true, extra: 1 },
  ]) reject(jsonl([row]), 'ineligible-target')
})

test('rejects invalid markers and invalid envelopes, sequence and packed rows', () => {
  for (const ignorable of [false, null, 1, 'true', {}]) reject(jsonl([{ ...event(), ignorable }]), 'invalid-jsonl')
  for (const row of [event(1), { ...event(), seq: -1 }, { ...event(), time: 'secret' }, { ...event(), sourceEventSeqs: [99] }]) reject(jsonl([row]), 'invalid-jsonl')
  reject(jsonl([{ type: 'text-chunks', seq0: 0, time0: 0, data: { turn: 0, step: 0, index: 0, dt: [], texts: ['a', 'b'] } }, event(2)]), 'invalid-jsonl')
  reject(jsonl([event(), { type: 'other', seq: 2, time: 0, data: {} }]), 'invalid-jsonl')
})

test('validates header identity and v0 header constraints', () => {
  reject(jsonl(), 'session-id-mismatch', 'session.jsonl', id.toUpperCase())
  reject(jsonl(), 'session-id-mismatch', 'session.jsonl', 'private/path')
  reject(jsonl([event()], { ...header, id: 'invalid' }), 'session-id-mismatch')
  for (const h of [{ ...header, version: 1 }, { ...header, sandboxMode: 'x' }, { ...header, createdAt: -1 }, { ...header, delegationDepth: '0' }]) reject(jsonl([event()], h), 'invalid-jsonl')
})

test('rejects malformed JSONL, missing tail and invalid decoded UTF-8', () => {
  for (const bytes of [Buffer.alloc(0), Buffer.from('private/payload\n'), jsonl().subarray(0, -1), Buffer.concat([jsonl(), Buffer.from('\n')]), Buffer.concat([jsonl(), Buffer.from([0xff, 10])])]) {
    reject(bytes, 'invalid-jsonl')
    reject(compress(bytes), 'invalid-jsonl', 'session.jsonl.zstd')
  }
})

test('rejects malformed, truncated, corrupted and trailing compressed data with fixed errors', () => {
  const valid = compress(jsonl())
  const corrupt = Buffer.from(valid)
  corrupt[corrupt.length - 1] ^= 0xff
  for (const bytes of [Buffer.alloc(0), Buffer.from('private/path secret'), valid.subarray(0, 3), valid.subarray(0, -1), corrupt, Buffer.concat([valid, Buffer.from('secret')]), Buffer.concat([valid, valid.subarray(0, -2)])]) reject(bytes, 'invalid-zstd', 'session.jsonl.zstd')
})

test('allowlists artifact names and requires Buffer input', () => {
  for (const name of ['other.jsonl', '../session.jsonl', 'SESSION.JSONL', 'session.jsonl.gz', 'private/path']) reject(jsonl(), 'invalid-artifact-name', name)
  for (const bytes of [null, 'secret', new Uint8Array([1])]) assert.throws(() => transformArtifact(bytes, 'session.jsonl', id), { message: 'invalid-bytes' })
})

test('bounds input before parsing or decompression', () => {
  const tooLarge = Buffer.allocUnsafe(256 * 1024 * 1024 + 1)
  reject(tooLarge, 'size-limit')
  reject(tooLarge, 'size-limit', 'session.jsonl.zstd')
})
