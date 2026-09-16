import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolveAlfredActivation } from 'alfred-core'

export const MANAGED_HEADER = '// managed-by: mimo-alfred'
export const BACKUP_DIR = '.alfred-backup'
export const RECEIPT_NAME = '.alfred-install.json'

export interface InstallOptions {
  projectRoot: string
  alfredRoot: string
  dryRun?: boolean
  uninstall?: boolean
  /** Also copy skills to ~/.config/mimocode/skills (Desktop global skills root). */
  globalSkills?: boolean
  home?: string
}

export interface InstallPlanEntry {
  action: 'write' | 'skip' | 'remove'
  path: string
  reason?: string
}

export interface InstallResult {
  command: 'install-desktop-alfred'
  status: 'planned' | 'ok' | 'failed' | 'refused'
  writes: boolean
  projectRoot: string
  entries: InstallPlanEntry[]
  issues: string[]
  envHints: string[]
  receiptPath?: string
}

const ALF_SKILL_IDS = ['alfred', 'alf'] as const
const OPTIONAL_SKILL_IDS = ['fin-value-investment-research'] as const

function packageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
}

function templatePath(...parts: string[]): string {
  return path.join(packageRoot(), 'templates', ...parts)
}

function skillSourceRoots(alfredRoot: string): string[] {
  return [
    path.join(alfredRoot, 'packages', 'dsh-alfred', 'skills'),
    path.join(alfredRoot, 'repos', 'fin-value', 'packages', 'dsh-fin-value', 'skills'),
    path.join(packageRoot(), 'templates', 'skills'),
  ]
}

function findSkillSource(alfredRoot: string, id: string): string | undefined {
  for (const root of skillSourceRoots(alfredRoot)) {
    const candidate = path.join(root, id)
    if (fs.existsSync(path.join(candidate, 'SKILL.md'))) return candidate
  }
  return undefined
}

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name)
    const to = path.join(dest, entry.name)
    if (entry.isDirectory()) copyDir(from, to)
    else if (entry.isFile()) fs.copyFileSync(from, to)
  }
}

function writeFileAtomic(dest: string, content: string): void {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  const temp = `${dest}.${process.pid}.tmp`
  fs.writeFileSync(temp, content, 'utf8')
  fs.renameSync(temp, dest)
}

function isManagedFile(file: string): boolean {
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return false
  return fs.readFileSync(file, 'utf8').slice(0, 240).includes('managed-by: mimo-alfred')
}

function renderTemplate(file: string, alfredRoot: string): string {
  const raw = fs.readFileSync(file, 'utf8')
  return raw.replace('{{ALFRED_ROOT}}', JSON.stringify(alfredRoot))
}

function localesFor(id: string): Record<string, { displayName: string; brief: string }> {
  const zh: Record<string, { displayName: string; brief: string }> = {
    alfred: { displayName: 'Alfred 调度', brief: '显式 alf/alfred 调用与能力调度' },
    alf: { displayName: 'Alfred 别名', brief: '/alf 与 alf 前缀调用入口' },
    'fin-value-investment-research': { displayName: '港股价值研究', brief: 'Fin Value 港股研究领域技能' },
  }
  const meta = zh[id] ?? { displayName: id, brief: id }
  return {
    'zh-CN': meta,
    'en-US': { displayName: id, brief: id },
  }
}

function globalSkillsRoot(home?: string): string {
  const userHome = home || process.env.USERPROFILE || process.env.HOME || ''
  return path.join(userHome, '.config', 'mimocode', 'skills')
}

function backupThenWrite(
  dest: string,
  backupRoot: string,
  apply: () => void,
): void {
  if (fs.existsSync(dest)) {
    fs.mkdirSync(backupRoot, { recursive: true })
    const backupTo = path.join(backupRoot, path.basename(dest) + '.' + Date.now())
    if (fs.statSync(dest).isDirectory()) copyDir(dest, backupTo)
    else fs.copyFileSync(dest, backupTo)
  }
  apply()
}

export function planInstall(options: InstallOptions): {
  result: InstallResult
  plan: {
    targets: Array<{ dest: string; content?: string; copyFrom?: string; dirCopy?: boolean }>
    localeFiles: Array<{ dest: string; content: string }>
    globalSkillIds: string[]
  }
} {
  const issues: string[] = []
  const entries: InstallPlanEntry[] = []
  const projectRoot = path.resolve(options.projectRoot)
  const mimocode = path.join(projectRoot, '.mimocode')
  const receiptPath = path.join(mimocode, RECEIPT_NAME)
  const result: InstallResult = {
    command: 'install-desktop-alfred',
    status: 'planned',
    writes: false,
    projectRoot,
    entries,
    issues,
    receiptPath,
    envHints: [
      'FIN_VALUE_DB_PATH (optional Fin Value ledger)',
      'FIN_VALUE_PYTHON_PATH (optional)',
      'FIN_VALUE_TUSHARE_TOKEN (optional)',
      'FUTU_OPEND_HOST / FUTU_OPEND_PORT (optional)',
    ],
  }

  const plan = {
    targets: [] as Array<{ dest: string; content?: string; copyFrom?: string; dirCopy?: boolean }>,
    localeFiles: [] as Array<{ dest: string; content: string }>,
    globalSkillIds: [] as string[],
  }

  let activation: { enabled: boolean; source: string }
  try {
    activation = resolveAlfredActivation(projectRoot, options.home)
  } catch (error) {
    result.status = 'refused'
    issues.push(error instanceof Error ? error.message : 'activation-invalid')
    return { result, plan }
  }
  if (!activation.enabled) {
    result.status = 'refused'
    issues.push('alfred-not-enabled: create .agents/alfred.json with enabled true')
    return { result, plan }
  }

  const coreDist = path.join(options.alfredRoot, 'packages', 'alfred-core', 'dist')
  if (!fs.existsSync(path.join(coreDist, 'index.js'))) {
    issues.push('alfred-core-not-built: run npm run build in alfred umbrella')
    result.status = 'failed'
    return { result, plan }
  }

  const managedPaths = [
    path.join(mimocode, 'tools', 'alfred_capabilities.ts'),
    path.join(mimocode, 'hooks', 'alfred-routing.ts'),
    path.join(mimocode, 'alfred-lib'),
    receiptPath,
    ...ALF_SKILL_IDS.map(id => path.join(mimocode, 'skills', id)),
    ...OPTIONAL_SKILL_IDS.map(id => path.join(mimocode, 'skills', id)),
  ]

  if (options.uninstall) {
    for (const dest of managedPaths) {
      if (fs.existsSync(dest)) {
        entries.push({ action: 'remove', path: dest })
        plan.targets.push({ dest })
      } else {
        entries.push({ action: 'skip', path: dest, reason: 'absent' })
      }
    }
    if (options.globalSkills) {
      const gRoot = globalSkillsRoot(options.home)
      for (const id of ALF_SKILL_IDS) {
        const dest = path.join(gRoot, id)
        if (fs.existsSync(dest)) {
          entries.push({ action: 'remove', path: dest })
          plan.targets.push({ dest })
        }
      }
    }
    result.writes = entries.some(e => e.action === 'remove')
    result.status = result.writes ? (options.dryRun ? 'planned' : 'ok') : 'ok'
    return { result, plan }
  }

  plan.targets.push({ dest: path.join(mimocode, 'alfred-lib'), copyFrom: coreDist, dirCopy: true })
  entries.push({ action: 'write', path: path.join(mimocode, 'alfred-lib') })

  const toolPath = path.join(mimocode, 'tools', 'alfred_capabilities.ts')
  plan.targets.push({
    dest: toolPath,
    content: renderTemplate(templatePath('tools', 'alfred_capabilities.ts.tmpl'), options.alfredRoot),
  })
  entries.push({ action: 'write', path: toolPath })

  const hookPath = path.join(mimocode, 'hooks', 'alfred-routing.ts')
  plan.targets.push({
    dest: hookPath,
    content: renderTemplate(templatePath('hooks', 'alfred-routing.ts.tmpl'), options.alfredRoot),
  })
  entries.push({ action: 'write', path: hookPath })

  const installedSkillIds: string[] = []
  for (const id of [...ALF_SKILL_IDS, ...OPTIONAL_SKILL_IDS]) {
    const src = findSkillSource(options.alfredRoot, id)
    const required = (ALF_SKILL_IDS as readonly string[]).includes(id)
    if (!src) {
      if (required) issues.push(`skill-source-missing:${id}`)
      else entries.push({ action: 'skip', path: path.join(mimocode, 'skills', id), reason: 'optional-skill-absent' })
      continue
    }
    const dest = path.join(mimocode, 'skills', id)
    plan.targets.push({ dest, copyFrom: src, dirCopy: true })
    entries.push({ action: 'write', path: dest })
    installedSkillIds.push(id)
    for (const locale of ['zh-CN', 'en-US'] as const) {
      plan.localeFiles.push({
        dest: path.join(dest, 'locales', `${locale}.json`),
        content: JSON.stringify(localesFor(id)[locale], null, 2) + '\n',
      })
    }
  }

  if (options.globalSkills) {
    const gRoot = globalSkillsRoot(options.home)
    for (const id of installedSkillIds.filter(x => (ALF_SKILL_IDS as readonly string[]).includes(x))) {
      const src = findSkillSource(options.alfredRoot, id)
      if (!src) continue
      const dest = path.join(gRoot, id)
      plan.targets.push({ dest, copyFrom: src, dirCopy: true })
      entries.push({ action: 'write', path: dest, reason: 'global-skills-root' })
      plan.globalSkillIds.push(id)
      for (const locale of ['zh-CN', 'en-US'] as const) {
        plan.localeFiles.push({
          dest: path.join(dest, 'locales', `${locale}.json`),
          content: JSON.stringify(localesFor(id)[locale], null, 2) + '\n',
        })
      }
    }
    entries.push({ action: 'write', path: gRoot, reason: 'all-project-coding-sessions-may-see-these-skills' })
  }

  result.writes = true
  if (issues.length) result.status = 'failed'
  return { result, plan }
}

export function installDesktopAlfred(options: InstallOptions): InstallResult {
  const { result, plan } = planInstall(options)
  if (result.status !== 'planned' && result.status !== 'ok') return result
  if (options.dryRun) {
    if (result.writes) result.status = 'planned'
    return result
  }

  const mimocode = path.join(path.resolve(options.projectRoot), '.mimocode')
  const backupRoot = path.join(mimocode, BACKUP_DIR, new Date().toISOString().replace(/[:.]/g, '-'))
  try {
    if (options.uninstall) {
      for (const target of plan.targets) {
        if (!fs.existsSync(target.dest)) continue
        backupThenWrite(target.dest, backupRoot, () => {
          fs.rmSync(target.dest, { recursive: true, force: true })
        })
      }
      result.status = 'ok'
      return result
    }
    for (const target of plan.targets) {
      backupThenWrite(target.dest, backupRoot, () => {
        if (target.dirCopy && target.copyFrom) {
          if (fs.existsSync(target.dest)) fs.rmSync(target.dest, { recursive: true, force: true })
          copyDir(target.copyFrom, target.dest)
        } else if (target.content !== undefined) {
          writeFileAtomic(target.dest, target.content)
        }
      })
    }
    for (const file of plan.localeFiles) writeFileAtomic(file.dest, file.content)
    const receipt = {
      version: 1,
      installer: 'mimo-alfred',
      installedAt: new Date().toISOString(),
      alfredRoot: path.resolve(options.alfredRoot),
      globalSkills: Boolean(options.globalSkills),
      skills: plan.targets.filter(t => t.dest.includes(`${path.sep}skills${path.sep}`)).map(t => t.dest),
    }
    writeFileAtomic(path.join(mimocode, RECEIPT_NAME), JSON.stringify(receipt, null, 2) + '\n')
    result.status = 'ok'
    return result
  } catch (error) {
    result.status = 'failed'
    result.issues.push(error instanceof Error ? error.message : 'install-failed')
    return result
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const args = process.argv.slice(2)
  const read = (flag: string) => {
    const i = args.indexOf(flag)
    return i >= 0 ? args[i + 1] : undefined
  }
  const result = installDesktopAlfred({
    projectRoot: read('--project-root') || process.cwd(),
    alfredRoot: read('--alfred-root') || path.resolve(packageRoot(), '..', '..'),
    dryRun: args.includes('--dry-run'),
    uninstall: args.includes('--uninstall'),
    globalSkills: args.includes('--global-skills'),
  })
  console.log(JSON.stringify(result, null, 2))
  process.exitCode = result.status === 'ok' || result.status === 'planned' ? 0 : 1
}
