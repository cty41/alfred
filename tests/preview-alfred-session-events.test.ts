import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdCompressSync } from 'node:zlib'
import { Worker } from 'node:worker_threads'
import { once } from 'node:events'
import { inspectJsonl, preview, main } from '../scripts/preview-alfred-session-events.mjs'

const ID = 'session-11111111-1111-4111-8111-111111111111'
const SECRET = 'PRIVATE_CONVERSATION_SENTINEL-do-not-print'
const header = { type: 'session', version: 0, id: ID, createdAt: 0, delegationDepth: 0 }
const event = (seq: number, type = 'alfred/available', data: unknown = {}) => ({ type, seq, time: 10, data })
const jsonl = (...rows: unknown[]) => Buffer.from([header, ...rows].map(x => JSON.stringify(x)).join('\n') + '\n')
async function fixture(run: (root: string, dir: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'alfred-preview-test-'))
  const dir = join(root, ID)
  await mkdir(dir)
  try { await run(root, dir) } finally { await rm(root, { recursive: true, force: true }) }
}
function assertPrivateFree(value: unknown) {
  const text = JSON.stringify(value)
  assert.ok(!text.includes(SECRET))
  assert.ok(!text.includes('cwd'))
  assert.ok(!text.includes('data'))
}

test('only exact empty-object unmarked envelopes qualify; all other payload shapes need manual review', () => {
  const shapes = [null, [], '', false, 0, { note: SECRET }, { nested: {} }]
  const rows = [event(0), event(1, 'alfred/legacy-global'), ...shapes.map((shape, i) => event(i + 2, 'alfred/available', shape))]
  rows.push({ ...event(rows.length), ignorable: true } as any)
  rows.push({ ...event(rows.length), ignorable: false } as any)
  rows.push({ ...event(rows.length), extra: SECRET } as any)
  rows.push({ type: 'alfred/available', seq: rows.length, time: 10 } as any)
  const out = inspectJsonl(jsonl(...rows))
  assert.equal(out.targets.filter(t => t.classification === 'empty-object-unmarked-candidate').length, 2)
  assert.equal(out.targets.filter(t => t.classification === 'already-marked').length, 1)
  assert.equal(out.targets.filter(t => t.classification === 'manual-review').length, 10)
  assertPrivateFree(out)
})

test('all three packed row kinds contribute logical sequence lengths, not storage-row lengths', () => {
  const rows = ['text-chunks', 'reasoning-chunks', 'tool-call-chunks'].map((type, i) => ({
    type, seq0: i * 3, time0: 20,
    data: { turn: 1, step: 1, index: i, dt: [1, -1], ...(type === 'tool-call-chunks' ? { id: SECRET, args: [SECRET, '', ''] } : { texts: [SECRET, '', ''] }) },
  }))
  const out = inspectJsonl(jsonl(...rows, event(9)))
  assert.equal(out.logicalEvents, 10)
  assert.equal(out.packedRows, 3)
  assert.equal(out.lastSeq, 9)
  assert.deepEqual(out.errors, [])
  assert.equal(out.targets[0].seq, 9)
  assertPrivateFree(out)
})

test('extension event names and unordered unpacked provenance are not falsely declared corrupt', () => {
  const out = inspectJsonl(jsonl(event(0, 'extension/multi/segment'), event(1), event(2), { ...event(3, 'assistant/message'), sourceEventSeqs: [1, 0, 1] }))
  assert.equal(out.logicalEvents, 4)
  assert.deepEqual(out.errors, [])
  assertPrivateFree(out)
})

test('malformed packed records, bad headers, invalid UTF8, JSON and tails produce fixed redacted errors', () => {
  const bad = [
    Buffer.from(`{"secret":"${SECRET}"}\n${SECRET}\n`),
    Buffer.from([0xff, 0x0a]),
    Buffer.from(''),
    jsonl({ type: 'text-chunks', seq0: 0, time0: 0, data: { texts: [SECRET], dt: [] } }),
    jsonl({ type: 'session', ...event(0), data: SECRET }).subarray(0, -1),
    jsonl(event(5)),
    jsonl({ ...event(0), sourceEventSeqs: [[0, 100]] }),
    jsonl(null, [], SECRET),
  ]
  for (const bytes of bad) {
    const out = inspectJsonl(bytes)
    assert.ok(out.errors.length > 0)
    assertPrivateFree(out)
  }
  const future = inspectJsonl(Buffer.from(JSON.stringify({ ...header, version: 1 }) + '\n'))
  assert.equal(future.errors[0].code, 'invalid-or-unsupported-header')
})

test('raw and concatenated zstd frames agree, keep bytes/mtime and directories unchanged, and ignore other files', async () => {
  await fixture(async (root, dir) => {
    const bytes = jsonl(event(0), event(1, 'user/message', { text: SECRET }))
    const newline = bytes.indexOf(10) + 1
    const compressed = Buffer.concat([zstdCompressSync(bytes.subarray(0, newline)), zstdCompressSync(bytes.subarray(newline))])
    const rawPath = join(dir, 'session.jsonl')
    const zstdPath = join(dir, 'session.jsonl.zstd')
    await writeFile(rawPath, bytes)
    await writeFile(zstdPath, compressed)
    await writeFile(join(dir, 'metadata.json'), SECRET)
    await writeFile(join(root, 'elsewhere.jsonl'), SECRET)
    await mkdir(join(dir, 'nested'))
    await writeFile(join(dir, 'nested', 'session.jsonl'), SECRET)
    const beforeNames = await readdir(dir)
    const before = await Promise.all([stat(rawPath), stat(zstdPath)])
    const out = await preview(root)
    assert.equal(out.totals.files, 2)
    assert.equal(out.totals.emptyObjectUnmarkedCandidates, 2)
    assert.equal(out.totals.errors, 0)
    assert.equal(out.inventoryChanged, false)
    assert.equal(out.inventoryHashBefore, out.inventoryHashAfter)
    assert.equal(out.totals.changingFiles, 0)
    for (const f of out.files) {
      assert.equal(f.sha256Before, f.sha256After)
      assert.equal(f.sessionId, ID)
      assert.deepEqual(f.targets, out.files[0].targets)
    }
    assert.deepEqual(await readFile(rawPath), bytes)
    assert.deepEqual(await readFile(zstdPath), compressed)
    assert.deepEqual(await readdir(dir), beforeNames)
    assert.deepEqual((await Promise.all([stat(rawPath), stat(zstdPath)])).map(s => s.mtimeMs), before.map(s => s.mtimeMs))
    assertPrivateFree(out)
    assert.ok(!JSON.stringify(out).includes(root))
  })
})

test('corrupt and truncated zstd errors never contain decoder diagnostics or payload', async () => {
  await fixture(async (root, dir) => {
    const path = join(dir, 'session.jsonl.zstd')
    for (const bytes of [Buffer.from(SECRET), zstdCompressSync(jsonl(event(0))).subarray(0, -2)]) {
      await writeFile(path, bytes)
      const out = await preview(root)
      assert.equal(out.totals.errors, 1)
      assert.equal(out.files[0].errors[0].code, 'zstd-decode-failed-or-incomplete')
      assert.equal(out.files[0].sha256Before, out.files[0].sha256After)
      assertPrivateFree(out)
    }
  })
})

test('directory symlinks/junctions and symlink roots are refused without traversal', async () => {
  await fixture(async (root, dir) => {
    await writeFile(join(dir, 'session.jsonl'), jsonl(event(0)))
    const link = join(root, 'linked-session')
    await symlink(dir, link, process.platform === 'win32' ? 'junction' : 'dir')
    const out = await preview(root)
    assert.equal(out.totals.files, 1)
    assert.ok(out.errors.some(e => e.code === 'symlink-refused'))
    const refused = await preview(link)
    assert.equal(refused.files.length, 0)
    assert.deepEqual(refused.errors, [{ code: 'symlink-refused' }])
    const descendant = await preview(join(link, 'nonexistent'))
    assert.equal(descendant.files.length, 0)
  })
})

test('nonregular allowlisted files are reported rather than opened', async () => {
  await fixture(async (root, dir) => {
    await mkdir(join(dir, 'session.jsonl'))
    const out = await preview(root)
    assert.equal(out.totals.files, 0)
    assert.equal(out.errors[0].code, 'nonregular-file-refused')
  })
})

test('active file rewrites are flagged by metadata/hash double reads', async () => {
  await fixture(async (root, dir) => {
    const path = join(dir, 'session.jsonl')
    await writeFile(path, jsonl(event(0), event(1, 'user/message', ' '.repeat(4 * 1024 * 1024))))
    const stop = new SharedArrayBuffer(4)
    const worker = new Worker(`
      const { workerData, parentPort } = require('node:worker_threads');
      const fs = require('node:fs');
      const fd = fs.openSync(workerData.path, 'r+');
      const flag = new Int32Array(workerData.stop);
      const pos = fs.fstatSync(fd).size - 5;
      parentPort.postMessage('ready');
      let i = 0;
      while (!Atomics.load(flag, 0)) fs.writeSync(fd, Buffer.from(String(i++ % 10)), 0, 1, pos);
      fs.closeSync(fd);
    `, { eval: true, workerData: { path, stop } })
    try {
      await once(worker, 'message')
      const out = await preview(root)
      assert.equal(out.files[0].changed, true)
      assert.equal(out.totals.changingFiles, 1)
      assertPrivateFree(out)
    } finally {
      Atomics.store(new Int32Array(stop), 0, 1)
      await worker.terminate()
    }
  })
})

test('CLI accepts only explicit root and rejects mutation/unknown flags with redacted errors', async () => {
  const output: string[] = []
  const original = console.log
  console.log = value => { output.push(String(value)) }
  try {
    for (const args of [[], ['--root'], ['--root', SECRET, '--apply'], ['--write', SECRET], ['--root', '--delete']]) {
      assert.equal(await main(args), 2)
    }
    assert.equal(await main(['--root', join(tmpdir(), SECRET, 'missing')]), 1)
  } finally { console.log = original }
  assertPrivateFree(output)
  assert.ok(output.every(s => JSON.parse(s).repairAuthorized === false))
})
