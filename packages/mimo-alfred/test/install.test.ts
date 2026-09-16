import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { installDesktopAlfred, planInstall, RECEIPT_NAME } from '../src/install.js'

const alfredRoot = path.resolve(import.meta.dirname, '../../..')
const temps: string[] = []

function tempProject(enabled = true): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mimo-alfred-'))
  temps.push(root)
  fs.mkdirSync(path.join(root, '.agents'), { recursive: true })
  if (enabled) {
    fs.writeFileSync(path.join(root, '.agents', 'alfred.json'), JSON.stringify({ schemaVersion: '1.0', enabled: true }))
  }
  return root
}

function tempHome(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mimo-alfred-home-'))
  temps.push(root)
  return root
}

afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('mimo-alfred desktop installer', () => {
  it('refuses when project is not enabled', () => {
    const project = tempProject(false)
    const result = installDesktopAlfred({ projectRoot: project, alfredRoot })
    expect(result.status).toBe('refused')
    expect(result.writes).toBe(false)
    expect(fs.existsSync(path.join(project, '.mimocode'))).toBe(false)
  })

  it('dry-run lists writes without touching disk', () => {
    const project = tempProject()
    const { result } = planInstall({ projectRoot: project, alfredRoot, dryRun: true })
    expect(result.status).toBe('planned')
    expect(result.entries.some(e => e.path.endsWith('alfred_capabilities.ts'))).toBe(true)
    expect(result.entries.some(e => e.path.endsWith('alfred-routing.ts'))).toBe(true)
    expect(fs.existsSync(path.join(project, '.mimocode'))).toBe(false)
  })

  it('installs tools, hooks, skills, locales, alfred-lib, and receipt', () => {
    const project = tempProject()
    const result = installDesktopAlfred({ projectRoot: project, alfredRoot })
    expect(result.status).toBe('ok')
    const tool = path.join(project, '.mimocode', 'tools', 'alfred_capabilities.ts')
    const hook = path.join(project, '.mimocode', 'hooks', 'alfred-routing.ts')
    const skill = path.join(project, '.mimocode', 'skills', 'alfred', 'SKILL.md')
    const locale = path.join(project, '.mimocode', 'skills', 'alfred', 'locales', 'zh-CN.json')
    const lib = path.join(project, '.mimocode', 'alfred-lib', 'index.js')
    const receipt = path.join(project, '.mimocode', RECEIPT_NAME)
    for (const file of [tool, hook, skill, locale, lib, receipt]) {
      expect(fs.existsSync(file), file).toBe(true)
    }
    expect(fs.readFileSync(tool, 'utf8')).toContain('managed-by: mimo-alfred')
    expect(fs.readFileSync(tool, 'utf8')).not.toContain('~/.claude/skills')
    expect(fs.readFileSync(hook, 'utf8')).toContain('session.userQuery.pre')
    expect(fs.readFileSync(hook, 'utf8')).not.toMatch(/experimental\.chat\.system\.transform/)
    const parsed = JSON.parse(fs.readFileSync(receipt, 'utf8'))
    expect(parsed.installer).toBe('mimo-alfred')
  })

  it('reinstall is idempotent and keeps managed header', () => {
    const project = tempProject()
    expect(installDesktopAlfred({ projectRoot: project, alfredRoot }).status).toBe('ok')
    expect(installDesktopAlfred({ projectRoot: project, alfredRoot }).status).toBe('ok')
    const tool = path.join(project, '.mimocode', 'tools', 'alfred_capabilities.ts')
    expect(fs.readFileSync(tool, 'utf8').startsWith('// managed-by: mimo-alfred')).toBe(true)
  })

  it('global skills writes only ALF dispatcher skills under the provided home', () => {
    const project = tempProject()
    const home = tempHome()
    const result = installDesktopAlfred({ projectRoot: project, alfredRoot, globalSkills: true, home })
    expect(result.status).toBe('ok')
    expect(fs.existsSync(path.join(home, '.config', 'mimocode', 'skills', 'alfred', 'SKILL.md'))).toBe(true)
    expect(fs.existsSync(path.join(home, '.config', 'mimocode', 'skills', 'alf', 'SKILL.md'))).toBe(true)
    expect(fs.existsSync(path.join(home, '.config', 'mimocode', 'skills', 'fin-value-investment-research'))).toBe(false)
  })

  it('uninstall removes managed paths including optional global skills', () => {
    const project = tempProject()
    const home = tempHome()
    expect(installDesktopAlfred({ projectRoot: project, alfredRoot, globalSkills: true, home }).status).toBe('ok')
    const result = installDesktopAlfred({ projectRoot: project, alfredRoot, uninstall: true, globalSkills: true, home })
    expect(result.status).toBe('ok')
    expect(fs.existsSync(path.join(project, '.mimocode', 'tools', 'alfred_capabilities.ts'))).toBe(false)
    expect(fs.existsSync(path.join(home, '.config', 'mimocode', 'skills', 'alfred'))).toBe(false)
  })
})
