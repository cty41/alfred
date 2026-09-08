import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export interface AlfredPreferences { preferredAddress?: string }

export function preferencesPath(platform = process.platform, env = process.env): string {
  if (platform === 'win32') return path.join(env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'alfred', 'preferences.json')
  if (platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'alfred', 'preferences.json')
  return path.join(env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'alfred', 'preferences.json')
}

export function readPreferences(filePath = preferencesPath()): AlfredPreferences {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as AlfredPreferences
    return typeof parsed.preferredAddress === 'string' ? { preferredAddress: parsed.preferredAddress } : {}
  } catch { return {} }
}

export function writePreferredAddress(address: string, filePath = preferencesPath()): AlfredPreferences {
  const normalized = address.trim()
  if (!normalized || normalized.length > 80 || /[\r\n\0]/u.test(normalized)) throw new Error('称呼必须是 1–80 个字符的单行文本。')
  const directory = path.dirname(filePath)
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  if (process.platform !== 'win32') fs.chmodSync(directory, 0o700)
  const value = { preferredAddress: normalized }
  const temporary = `${filePath}.${process.pid}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(temporary, filePath)
  if (process.platform !== 'win32') fs.chmodSync(filePath, 0o600)
  return value
}
