import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { preferencesPath, readPreferences, writePreferredAddress } from '../src/preferences.js'

describe('control preferences', () => {
  it('uses platform-specific application data roots', () => {
    expect(preferencesPath('win32', { LOCALAPPDATA: 'C:\\Local' } as NodeJS.ProcessEnv)).toContain(path.join('alfred', 'preferences.json'))
    expect(preferencesPath('darwin', {} as NodeJS.ProcessEnv)).toContain(path.join('Library', 'Application Support', 'alfred'))
  })

  it('writes preferences atomically and validates text', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alf-preferences-'))
    const file = path.join(dir, 'preferences.json')
    try {
      writePreferredAddress('韦恩少爷', file)
      expect(readPreferences(file)).toEqual({ preferredAddress: '韦恩少爷' })
      expect(() => writePreferredAddress('bad\nname', file)).toThrow()
    } finally { fs.rmSync(dir, { recursive: true, force: true }) }
  })
})
