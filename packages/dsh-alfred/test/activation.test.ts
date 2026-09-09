import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AlfredActivationConfigError, findProjectRoot, resolveAlfredActivation } from '../src/activation.js'
import { apply as applyBootstrap } from '../src/bootstrap.js'

const roots: string[] = []
function tempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'alfred-activation-'))
  roots.push(root)
  return root
}
function writeConfig(root: string, enabled: boolean): void {
  fs.mkdirSync(path.join(root, '.agents'), { recursive: true })
  fs.writeFileSync(path.join(root, '.agents', 'alfred.json'), JSON.stringify({ schemaVersion: '1.0', enabled }))
}
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }) })

describe('ALF activation configuration', () => {
  it('uses the nearest Git project config', () => {
    const home = tempRoot()
    const project = tempRoot()
    fs.mkdirSync(path.join(project, '.git'))
    const nested = path.join(project, 'packages', 'app')
    fs.mkdirSync(nested, { recursive: true })
    writeConfig(project, true)
    expect(findProjectRoot(nested)).toBe(project)
    expect(resolveAlfredActivation(nested, home)).toEqual({ enabled: true, source: 'project' })
  })

  it('finds an explicit non-Git project config from a nested cwd', () => {
    const root = tempRoot()
    const project = path.join(root, 'project')
    fs.mkdirSync(path.join(project, '.agents'), { recursive: true })
    fs.writeFileSync(path.join(project, '.agents', 'alfred.json'), JSON.stringify({ schemaVersion: '1.0', enabled: true }))
    const nested = path.join(project, 'nested', 'deeper')
    fs.mkdirSync(nested, { recursive: true })
    expect(resolveAlfredActivation(nested, path.join(root, 'home'))).toEqual({ enabled: true, source: 'project' })
  })

  it('falls back to the user config and treats false as no positive enable', () => {
    const home = tempRoot()
    const project = tempRoot()
    fs.mkdirSync(path.join(project, '.git'))
    writeConfig(project, false)
    writeConfig(home, true)
    expect(resolveAlfredActivation(project, home)).toEqual({ enabled: true, source: 'user' })
  })

  it('is disabled when neither scope positively enables Alfred', () => {
    expect(resolveAlfredActivation(tempRoot(), tempRoot())).toEqual({ enabled: false, source: 'none' })
  })

  it('fails loud for malformed or unknown configuration', () => {
    const home = tempRoot()
    const project = tempRoot()
    fs.mkdirSync(path.join(project, '.git'))
    fs.mkdirSync(path.join(project, '.agents'))
    fs.writeFileSync(path.join(project, '.agents', 'alfred.json'), '{')
    expect(() => resolveAlfredActivation(project, home)).toThrowError(AlfredActivationConfigError)
    fs.writeFileSync(path.join(project, '.agents', 'alfred.json'), JSON.stringify({ schemaVersion: '1.0', enabled: true, surprise: true }))
    expect(() => resolveAlfredActivation(project, home)).toThrow('config-unknown-field')
  })

  it('accepts a UTF-8 BOM written by Windows PowerShell 5.1', () => {
    const home = tempRoot()
    const project = tempRoot()
    fs.mkdirSync(path.join(project, '.git'))
    fs.mkdirSync(path.join(project, '.agents'))
    fs.writeFileSync(path.join(project, '.agents', 'alfred.json'), `\uFEFF${JSON.stringify({ schemaVersion: '1.0', enabled: true })}`)
    expect(resolveAlfredActivation(project, home)).toEqual({ enabled: true, source: 'project' })
  })

  it('registers a per-Agent setup extension without selecting a preset', async () => {
    const home = tempRoot()
    const project = tempRoot()
    const other = tempRoot()
    fs.mkdirSync(path.join(project, '.git'))
    writeConfig(project, true)
    let extension: any
    const finPlugin = { name: 'fin-fixture', apply: () => undefined }
    applyBootstrap({
      baseUrl: 'file:///profile/',
      agents: { registerSetupExtension: (value: unknown) => { extension = value } },
      loader: { internal: { import: (name: string, base: string) => { expect(name).toBe('dsh-fin-value'); expect(base).toBe('file:///profile/'); return finPlugin } } },
    } as never, { home, finValue: { timeoutMs: 12345 } })
    expect(extension.name).toBe('dsh-alfred')
    const plugins: Array<{ plugin: unknown; config: unknown }> = []
    const agentCtx = { plugin: async (plugin: unknown, config: unknown) => { plugins.push({ plugin, config }) } }
    await expect(extension.setup({ agentCtx, cwd: project, preset: 'standard', source: { kind: 'create' } })).resolves.toBe(true)
    expect(plugins).toHaveLength(2)
    expect(plugins[1]).toEqual({ plugin: finPlugin, config: { timeoutMs: 12345 } })
    plugins.length = 0
    await expect(extension.setup({ agentCtx, cwd: other, preset: 'standard', source: { kind: 'create' } })).resolves.toBe(false)
    await expect(extension.setup({ agentCtx, cwd: project, preset: 'minimal', source: { kind: 'create' } })).resolves.toBe(false)
    await expect(extension.setup({ agentCtx, cwd: project, preset: 'alfred', source: { kind: 'resume' } })).resolves.toBe(false)
    expect(plugins).toEqual([])
  })
})
