import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src')
const banned = /@deepseek-ai\/|@mimo-ai\//

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return walk(full)
    return full.endsWith('.ts') ? [full] : []
  })
}

describe('alfred-core host isolation', () => {
  it('never imports DSH or MiMo host SDKs', () => {
    for (const file of walk(root)) {
      const source = readFileSync(file, 'utf8')
      expect(source, file).not.toMatch(banned)
    }
  })
})
