import test from 'node:test'
import assert from 'node:assert/strict'
import childProcess, { execFileSync } from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { mkdtemp, mkdir, writeFile, rm, readFile, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { windowsSecurity } from '../scripts/lib/windows-session-repair-safety.mjs'

const windows = { skip: process.platform !== 'win32' ? 'Requires real Windows NTFS ACL and stream APIs; no emulation.' : false }
// Fixed fixture-only code; all variable input is base64 JSON on stdin.
const FIXTURE_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
try {
  $v = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([Console]::In.ReadToEnd())) | ConvertFrom-Json
  $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
  if ($v.action -eq 'broad') {
    $acl = Get-Acl -LiteralPath $v.path
    $s = New-Object Security.Principal.SecurityIdentifier 'S-1-1-0'
    $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule ($s, 'ReadAndExecute', 'ContainerInherit, ObjectInherit', 'None', 'Allow')))
    [IO.Directory]::SetAccessControl($v.path, $acl)
  } elseif ($v.action -eq 'private') {
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true, $false)
    $acl.SetOwner($sid)
    foreach ($id in @($sid.Value, 'S-1-5-18', 'S-1-5-32-544')) {
      $s = New-Object Security.Principal.SecurityIdentifier $id
      $rule = New-Object Security.AccessControl.FileSystemAccessRule ($s, 'FullControl', 'ContainerInherit, ObjectInherit', 'None', 'Allow')
      $acl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $v.path -AclObject $acl
  } elseif ($v.action -eq 'custom') {
    $acl = New-Object Security.AccessControl.FileSecurity
    $acl.SetAccessRuleProtection($true, $false)
    $acl.SetOwner($sid)
    $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule ($sid, 'FullControl', 'Allow')))
    Set-Acl -LiteralPath $v.path -AclObject $acl
    [IO.File]::SetAttributes($v.path, [IO.FileAttributes]::Archive -bor [IO.FileAttributes]::Hidden)
  } elseif ($v.action -eq 'ads') {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class FixtureStream {
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern IntPtr CreateFileW(string path, uint access, uint share, IntPtr security, uint disposition, uint flags, IntPtr template);
  [DllImport("kernel32.dll")]
  public static extern bool CloseHandle(IntPtr handle);
}
'@ | Out-Null
    $handle = [FixtureStream]::CreateFileW(($v.path + ':fixture-stream'), 0x40000000, 7, [IntPtr]::Zero, 1, 0x02000000, [IntPtr]::Zero)
    if ($handle -eq [IntPtr](-1)) { throw 'fixture-stream-create-failed' }
    [FixtureStream]::CloseHandle($handle) | Out-Null
  } elseif ($v.action -eq 'readonly') {
    [IO.File]::SetAttributes($v.path, [IO.FileAttributes]::ReadOnly)
  }
  [Console]::Out.Write('ok')
} catch { [Console]::Out.Write('fixture-failed') }
`
function fixtureAction(action: string, path: string) {
  let output: string
  try {
    output = execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(FIXTURE_SCRIPT, 'utf16le').toString('base64')], {
      input: Buffer.from(JSON.stringify({ action, path })).toString('base64'), encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    })
  } catch { throw new Error('fixture-setup-failed') }
  assert.equal(output, 'ok', 'fixture-setup-failed')
}
async function fixture(t: any) {
  const base = await mkdtemp(join(tmpdir(), 'alfred-security-fixture-'))
  t.after(() => rm(base, { recursive: true, force: true }))
  fixtureAction('private', base)
  const root = join(base, 'sources'), backupRoot = join(base, 'private-backups')
  await mkdir(root)
  await mkdir(backupRoot)
  fixtureAction('private', backupRoot)
  const sessionIds = Array.from({ length: 6 }, (_, i) => `session-00000000-0000-0000-0000-${String(i).padStart(12, '0')}`)
  for (const id of sessionIds) {
    await mkdir(join(root, id))
    await writeFile(join(root, id, 'fixture.txt'), 'synthetic fixture')
  }
  return { root, backupRoot, sessionIds }
}

test('inspect returns deterministic relative metadata and never traverses backup contents or unrelated sessions', windows, async t => {
  const f = await fixture(t)
  const ignored = join(f.root, 'not-selected')
  await mkdir(ignored)
  fixtureAction('ads', ignored)
  const privateContent = join(f.backupRoot, 'not-inspected.txt')
  await writeFile(privateContent, 'fixture')
  fixtureAction('ads', privateContent)
  const result = await windowsSecurity.inspect(f)
  assert.deepEqual(result, await windowsSecurity.inspect({ ...f, sessionIds: [...f.sessionIds].reverse() }))
  assert.deepEqual(result, await windowsSecurity.inspect({ ...f, verifyStreams: true }))
  assert.deepEqual(Object.keys(result), ['version', 'sources', 'backup'])
  assert.equal(result.version, 1)
  assert.equal(result.sources.length, 12)
  assert.deepEqual(result.sources.map((r: any) => r.path), [...result.sources.map((r: any) => r.path)].sort())
  for (const r of [...result.sources, result.backup]) {
    assert.deepEqual(Object.keys(r), ['path', 'kind', 'sddl', 'attributes'])
    assert.match(r.sddl, /^O:.*G:.*D:/)
    assert.ok(!r.sddl.includes('S:'))
    assert.equal(typeof r.attributes, 'number')
  }
  assert.equal(result.backup.path, '.')
  assert.equal(result.backup.kind, 'directory')
})

test('default inspect never executes Add-Type; native mode and preserve do', windows, async t => {
  const f = await fixture(t)
  const expected = await windowsSecurity.inspect(f)
  const original = childProcess.execFileSync
  // Execute the real fixed script with compilation replaced by a throwing
  // function. This proves the dry-run branch never reaches Add-Type at runtime.
  t.mock.method(childProcess, 'execFileSync', (command: string, args: string[], options: any) => {
    const patched = [...args]
    const index = patched.indexOf('-EncodedCommand') + 1
    assert.ok(index > 0)
    const script = Buffer.from(patched[index], 'base64').toString('utf16le')
    patched[index] = Buffer.from("function Add-Type { throw 'fixture-compilation-forbidden' }\n" + script, 'utf16le').toString('base64')
    return original(command, patched, options)
  })
  syncBuiltinESMExports()
  try {
    assert.deepEqual(await windowsSecurity.inspect(f), expected)
    assert.deepEqual(await windowsSecurity.inspect({ ...f, verifyStreams: false }), expected)
    await assert.rejects(windowsSecurity.inspect({ ...f, verifyStreams: true }), { message: 'security-inspection-failed' })
    await assert.rejects(windowsSecurity.preserve(join(f.root, f.sessionIds[0], 'fixture.txt'), join(f.root, f.sessionIds[1], 'fixture.txt')), { message: 'security-inspection-failed' })
    await assert.rejects(windowsSecurity.inspect({ ...f, verifyStreams: 'true' }), { message: 'security-input-invalid' })
  } finally {
    t.mock.restoreAll()
    syncBuiltinESMExports()
  }
})

test('preserve copies restrictive custom Owner/Group/DACL and attributes onto an existing stage', windows, async t => {
  const f = await fixture(t)
  const source = join(f.root, f.sessionIds[0], 'fixture.txt')
  const staged = join(f.root, f.sessionIds[1], 'staged.txt')
  await writeFile(staged, 'staged replacement')
  fixtureAction('custom', source)
  assert.deepEqual(await windowsSecurity.preserve(source, staged), { verified: true })
  const result = await windowsSecurity.inspect(f)
  const a = result.sources.find((r: any) => r.path === `${f.sessionIds[0]}/fixture.txt`)
  const b = result.sources.find((r: any) => r.path === `${f.sessionIds[1]}/staged.txt`)
  assert.equal(a.sddl, b.sddl)
  assert.equal(a.attributes, b.attributes)
  assert.equal(await readFile(staged, 'utf8'), 'staged replacement')
  assert.equal(await readFile(source, 'utf8'), 'synthetic fixture')
})

for (const target of ['file', 'directory', 'backup']) {
  test(`inspect rejects ADS on ${target}`, windows, async t => {
    const f = await fixture(t)
    const path = target === 'backup' ? f.backupRoot : target === 'directory' ? join(f.root, f.sessionIds[0]) : join(f.root, f.sessionIds[0], 'fixture.txt')
    fixtureAction('ads', path)
    if (target === 'file') {
      await assert.rejects(windowsSecurity.inspect(f), { message: 'security-stream-refused' })
    } else {
      // Metadata-only preview deliberately defers directory stream verification.
      assert.equal((await windowsSecurity.inspect(f)).version, 1)
    }
    await assert.rejects(windowsSecurity.inspect({ ...f, verifyStreams: true }), { message: 'security-stream-refused' })
  })
}
for (const target of ['source', 'destination']) {
  test(`preserve rejects ${target} ADS before changing staged metadata`, windows, async t => {
    const f = await fixture(t)
    const source = join(f.root, f.sessionIds[0], 'fixture.txt'), destination = join(f.root, f.sessionIds[1], 'fixture.txt')
    fixtureAction('ads', target === 'source' ? source : destination)
    await assert.rejects(windowsSecurity.preserve(source, destination), { message: 'security-stream-refused' })
    assert.equal(await readFile(destination, 'utf8'), 'synthetic fixture')
  })
}
test('inspect refuses broad backup allow ACL by SID', windows, async t => {
  const f = await fixture(t)
  fixtureAction('broad', f.backupRoot)
  await assert.rejects(windowsSecurity.inspect(f), { message: 'security-backup-not-private' })
})
test('inspect rejects selected-tree reparse points without traversing them', windows, async t => {
  const f = await fixture(t)
  await symlink(f.backupRoot, join(f.root, f.sessionIds[0], 'junction'), 'junction')
  await assert.rejects(windowsSecurity.inspect(f), { message: 'security-reparse-refused' })
})
test('inspect rejects a reparse point in backup ancestors', windows, async t => {
  const f = await fixture(t)
  await mkdir(join(f.backupRoot, 'nested'))
  const junction = join(f.root, 'backup-junction')
  await symlink(f.backupRoot, junction, 'junction')
  await assert.rejects(windowsSecurity.inspect({ ...f, backupRoot: join(junction, 'nested') }), { message: 'security-reparse-refused' })
})
test('inspect rejects read-only files', windows, async t => {
  const f = await fixture(t)
  fixtureAction('readonly', join(f.root, f.sessionIds[0], 'fixture.txt'))
  await assert.rejects(windowsSecurity.inspect(f), { message: 'security-attributes-refused' })
})
test('invalid inputs return fixed codes without native details', windows, async () => {
  await assert.rejects(windowsSecurity.inspect({ root: 'C:\\fixture', backupRoot: 'C:\\backup', sessionIds: [] }), { message: 'security-input-invalid' })
  await assert.rejects(windowsSecurity.preserve('C:\\fixture:ads', 'C:\\destination'), { message: 'security-input-invalid' })
})
test('non-Windows entry points fail closed', { skip: process.platform === 'win32' ? 'Non-Windows contract only.' : false }, async () => {
  await assert.rejects(windowsSecurity.inspect({}), { message: 'security-unsupported-os' })
  await assert.rejects(windowsSecurity.preserve('a', 'b'), { message: 'security-unsupported-os' })
})
