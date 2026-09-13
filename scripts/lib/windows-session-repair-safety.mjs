/** Windows-only metadata gate. Never emits native diagnostics or absolute paths.
 * Caller must keep returned ACL metadata in its private token/journal storage.
 * Caller owns hardlink detection and transaction/race checks before rename.
 * Default inspect is read-only: file ADS uses the built-in provider; directory
 * ADS verification is deferred. APPLY must inspect with verifyStreams:true before
 * any transaction writes (PS5.1 native compilation can create temporary files).
 */
import { execFileSync } from 'node:child_process'
import { win32 } from 'node:path'

const ID = /^session-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
const CODES = new Set(['security-input-invalid', 'security-inspection-failed', 'security-reparse-refused', 'security-stream-refused', 'security-attributes-refused', 'security-volume-refused', 'security-directory-required', 'security-file-required', 'security-backup-not-private', 'security-preservation-failed', 'security-tree-limit'])
// Both code and native declarations are fixed; data arrives only via base64 stdin.
const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object Text.UTF8Encoding $false
function Refuse([string]$code) { throw $code }
try {
  $inputData = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([Console]::In.ReadToEnd())) | ConvertFrom-Json
  $nativeStreams = $inputData.operation -eq 'preserve' -or $inputData.verifyStreams -eq $true
  if ($nativeStreams) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class RepairStreams {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct StreamData {
    public long Size;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=296)] public string Name;
  }
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern IntPtr FindFirstStreamW(string path, int level, out StreamData data, uint flags);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  public static extern bool FindNextStreamW(IntPtr handle, out StreamData data);
  [DllImport("kernel32.dll")]
  [return: MarshalAs(UnmanagedType.Bool)]
  public static extern bool FindClose(IntPtr handle);
}
'@ | Out-Null
  }
  $sections = [Security.AccessControl.AccessControlSections]::Owner -bor [Security.AccessControl.AccessControlSections]::Group -bor [Security.AccessControl.AccessControlSections]::Access
  function NoStreams([string]$path) {
    $data = New-Object RepairStreams+StreamData
    $handle = [RepairStreams]::FindFirstStreamW($path, 0, [ref]$data, 0)
    if ($handle -eq [IntPtr](-1)) {
      # Empty directories legitimately have no streams (ERROR_HANDLE_EOF).
      if ([Runtime.InteropServices.Marshal]::GetLastWin32Error() -ne 38) { Refuse 'security-inspection-failed' }
      return
    }
    try {
      do {
        # Win32 spells the unnamed :$DATA stream as ::$DATA.
        if ($data.Name -cne '::$DATA') { Refuse 'security-stream-refused' }
        $more = [RepairStreams]::FindNextStreamW($handle, [ref]$data)
        if (!$more -and [Runtime.InteropServices.Marshal]::GetLastWin32Error() -ne 38) { Refuse 'security-inspection-failed' }
      } while ($more)
    } finally { [RepairStreams]::FindClose($handle) | Out-Null }
  }
  function Ancestors([string]$path) {
    $drive = New-Object IO.DriveInfo ([IO.Path]::GetPathRoot($path))
    if ($drive.DriveFormat -cne 'NTFS' -or $drive.DriveType -ne [IO.DriveType]::Fixed) { Refuse 'security-volume-refused' }
    for ($p = $path; $p; $p = [IO.Path]::GetDirectoryName($p)) {
      $a = [IO.File]::GetAttributes($p)
      if (($a -band [IO.FileAttributes]::ReparsePoint) -ne 0) { Refuse 'security-reparse-refused' }
    }
  }
  function Metadata([string]$path, [string]$relative) {
    $a = [IO.File]::GetAttributes($path)
    if (($a -band [IO.FileAttributes]::ReparsePoint) -ne 0) { Refuse 'security-reparse-refused' }
    $directory = ($a -band [IO.FileAttributes]::Directory) -ne 0
    # Permit ordinary metadata only; reject encrypted, sparse, offline,
    # compressed, recall/cloud and every unknown attribute, fail closed.
    $allowed = 2 -bor 4 -bor 16 -bor 32 -bor 128
    if ($directory) { $allowed = $allowed -bor 1 }
    if (([int]$a -band (-bnot $allowed)) -ne 0) { Refuse 'security-attributes-refused' }
    if ($nativeStreams) {
      NoStreams $path
    } elseif (!$directory) {
      # PS5.1's built-in file stream provider does not compile or write files.
      # Directory ADS must be verified by native enumeration during APPLY.
      $streams = @(Get-Item -LiteralPath $path -Stream '*' -Force)
      if ($streams.Count -eq 0) { Refuse 'security-inspection-failed' }
      foreach ($stream in $streams) {
        if ($stream.Stream -cne ':$DATA') { Refuse 'security-stream-refused' }
      }
    }
    $acl = Get-Acl -LiteralPath $path
    $kind = 'file'
    if ($directory) { $kind = 'directory' }
    return [ordered]@{ path=$relative; kind=$kind; sddl=$acl.GetSecurityDescriptorSddlForm($sections); attributes=[int]$a }
  }
  function PrivateBackup([string]$path) {
    $acl = Get-Acl -LiteralPath $path
    $current = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $allowedSids = @($current, 'S-1-5-18', 'S-1-5-32-544')
    $raw = New-Object Security.AccessControl.RawSecurityDescriptor ($acl.GetSecurityDescriptorSddlForm($sections))
    if ($null -eq $raw.DiscretionaryAcl -or $raw.Owner.Value -notin $allowedSids) { Refuse 'security-backup-not-private' }
    foreach ($ace in $raw.DiscretionaryAcl) {
      # Only ordinary allow/deny ACEs; reject callback/object/unknown forms.
      if ($ace.AceType -eq [Security.AccessControl.AceType]::AccessDenied) { continue }
      if ($ace.AceType -ne [Security.AccessControl.AceType]::AccessAllowed -or $ace.SecurityIdentifier.Value -notin $allowedSids) { Refuse 'security-backup-not-private' }
    }
  }
  if ($inputData.operation -eq 'inspect') {
    Ancestors $inputData.root
    Ancestors $inputData.backupRoot
    if (!([IO.File]::GetAttributes($inputData.root) -band [IO.FileAttributes]::Directory)) { Refuse 'security-directory-required' }
    $backup = Metadata $inputData.backupRoot '.'
    if ($backup.kind -ne 'directory') { Refuse 'security-directory-required' }
    PrivateBackup $inputData.backupRoot
    $records = New-Object 'Collections.Generic.List[object]'
    function Visit([string]$path, [string]$relative) {
      $record = Metadata $path $relative
      $records.Add($record)
      if ($records.Count -gt 100000) { Refuse 'security-tree-limit' }
      if ($record.kind -eq 'directory') {
        foreach ($child in [IO.Directory]::EnumerateFileSystemEntries($path)) {
          Visit $child ($relative + '/' + [IO.Path]::GetFileName($child))
        }
      }
    }
    foreach ($id in $inputData.sessionIds) {
      $path = [IO.Path]::Combine($inputData.root, $id)
      $a = [IO.File]::GetAttributes($path)
      if ($a -band [IO.FileAttributes]::ReparsePoint) { Refuse 'security-reparse-refused' }
      if (!($a -band [IO.FileAttributes]::Directory)) { Refuse 'security-directory-required' }
      Visit $path $id
    }
    $result = [ordered]@{ version=1; sources=@($records.ToArray()); backup=$backup }
  } elseif ($inputData.operation -eq 'preserve') {
    Ancestors $inputData.source
    Ancestors $inputData.destination
    $before = Metadata $inputData.source '.'
    $staged = Metadata $inputData.destination '.'
    if ($before.kind -ne 'file' -or $staged.kind -ne 'file') { Refuse 'security-file-required' }
    $acl = New-Object Security.AccessControl.FileSecurity
    $acl.SetSecurityDescriptorSddlForm($before.sddl, $sections)
    Set-Acl -LiteralPath $inputData.destination -AclObject $acl
    [IO.File]::SetAttributes($inputData.destination, [IO.FileAttributes]$before.attributes)
    $after = Metadata $inputData.destination '.'
    $sourceAfter = Metadata $inputData.source '.'
    if ($after.sddl -cne $before.sddl -or $after.attributes -ne $before.attributes -or $sourceAfter.sddl -cne $before.sddl -or $sourceAfter.attributes -ne $before.attributes) { Refuse 'security-preservation-failed' }
    $result = [ordered]@{ verified=$true }
  } else { Refuse 'security-input-invalid' }
  [Console]::Out.Write((@{ok=$true; result=$result} | ConvertTo-Json -Depth 12 -Compress))
} catch {
  $code = $_.Exception.Message
  $codes = @('security-input-invalid','security-inspection-failed','security-reparse-refused','security-stream-refused','security-attributes-refused','security-volume-refused','security-directory-required','security-file-required','security-backup-not-private','security-preservation-failed','security-tree-limit')
  if ($code -notin $codes) { $code = 'security-inspection-failed' }
  [Console]::Out.Write((@{ok=$false; code=$code} | ConvertTo-Json -Compress))
}
`
const ENCODED_SCRIPT = Buffer.from(SCRIPT, 'utf16le').toString('base64')
function fail(code) { throw new Error(code) }
function platform() { if (process.platform !== 'win32') fail('security-unsupported-os') }
function pathInput(value) {
  // Local absolute DOS paths only. No device namespace, UNC, ADS or wildcards.
  if (typeof value !== 'string' || !/^[a-z]:[\\/]/i.test(value) || /[:*?\x00-\x1f]/.test(value.slice(2)) || value.split(/[\\/]/).slice(1).some(p => p === '.' || p === '..' || /[. ]$/.test(p))) fail('security-input-invalid')
  return win32.normalize(value)
}
function invoke(input) {
  let response
  try {
    const output = execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', ENCODED_SCRIPT], {
      input: Buffer.from(JSON.stringify(input), 'utf8').toString('base64'),
      encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024, timeout: 120000,
    })
    response = JSON.parse(output.replace(/^\uFEFF/, ''))
  } catch { fail('security-inspection-failed') }
  if (response?.ok !== true) fail(CODES.has(response?.code) ? response.code : 'security-inspection-failed')
  return response.result
}
export const windowsSecurity = Object.freeze({
  async inspect(options) {
    platform()
    if (!options || !Array.isArray(options.sessionIds) || options.sessionIds.length !== 6 || options.sessionIds.some(id => typeof id !== 'string' || !ID.test(id)) || new Set(options.sessionIds).size !== 6) fail('security-input-invalid')
    if (options.verifyStreams !== undefined && typeof options.verifyStreams !== 'boolean') fail('security-input-invalid')
    const result = invoke({ operation: 'inspect', root: pathInput(options.root), backupRoot: pathInput(options.backupRoot), sessionIds: [...options.sessionIds].sort(), verifyStreams: options.verifyStreams ?? false })
    result.sources.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
    return result
  },
  async preserve(source, destination) {
    platform()
    source = pathInput(source)
    destination = pathInput(destination)
    if (source.toLowerCase() === destination.toLowerCase()) fail('security-input-invalid')
    return invoke({ operation: 'preserve', source, destination })
  },
})
