import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export type ActivationSource = 'project' | 'user' | 'none'
export interface ActivationResolution { enabled: boolean; source: ActivationSource }

export class AlfredActivationConfigError extends Error {
  readonly code: string
  constructor(code: string) {
    super(`Alfred activation configuration is invalid (${code}).`)
    this.name = 'AlfredActivationConfigError'
    this.code = code
  }
}

interface ActivationConfig { schemaVersion: '1.0'; enabled: boolean }

function readConfig(filePath: string): ActivationConfig | undefined {
  if (!fs.existsSync(filePath)) return undefined
  let value: unknown
  try { value = JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')) }
  catch { throw new AlfredActivationConfigError('config-json-invalid') }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new AlfredActivationConfigError('config-shape-invalid')
  const row = value as Record<string, unknown>
  const allowed = new Set(['$schema', 'schemaVersion', 'enabled'])
  if (Object.keys(row).some(key => !allowed.has(key))) throw new AlfredActivationConfigError('config-unknown-field')
  if (row.schemaVersion !== '1.0') throw new AlfredActivationConfigError('config-version-unsupported')
  if (typeof row.enabled !== 'boolean') throw new AlfredActivationConfigError('config-enabled-invalid')
  if (row.$schema !== undefined && typeof row.$schema !== 'string') throw new AlfredActivationConfigError('config-schema-invalid')
  return { schemaVersion: '1.0', enabled: row.enabled }
}

export function findProjectRoot(cwd: string): string {
  const initial = path.resolve(cwd)
  let current = initial
  while (true) {
    if (fs.existsSync(path.join(current, '.agents', 'alfred.json'))) return current
    if (fs.existsSync(path.join(current, '.git'))) return current
    const parent = path.dirname(current)
    if (parent === current) return initial
    current = parent
  }
}

export function resolveAlfredActivation(cwd: string, home = os.homedir()): ActivationResolution {
  const project = readConfig(path.join(findProjectRoot(cwd), '.agents', 'alfred.json'))
  if (project?.enabled === true) return { enabled: true, source: 'project' }
  const user = readConfig(path.join(path.resolve(home), '.agents', 'alfred.json'))
  if (user?.enabled === true) return { enabled: true, source: 'user' }
  return { enabled: false, source: 'none' }
}
