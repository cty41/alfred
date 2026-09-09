import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'
import { loadRoutes } from './catalog.js'
import { CapabilityProbe, defaultAlfredRoot } from './probe.js'
import { readPreferences, writePreferredAddress } from './preferences.js'
import { directUserText, isTopLevelHumanAgent, preferredAddressFromText, routeForTurn, routingInstruction, type SessionRoutingState } from './routing.js'
import { parseAlfredInvocation } from './trigger.js'

export const name = 'dsh-alfred'
export const inject = ['tools', 'skills', 'sessionProjections']

interface ControlConfig {
  alfredRoot?: string
  probeTtlMs?: number
  probeTimeoutMs?: number
  excludedPresets?: string[]
  legacyGlobal?: boolean
}

export const Config: z<ControlConfig> = z.object({
  alfredRoot: z.string().default(''),
  probeTtlMs: z.number().default(300_000),
  probeTimeoutMs: z.number().default(5_000),
  excludedPresets: z.array(z.string()).default(['minimal']),
  legacyGlobal: z.boolean().default(false),
})

function textOutput() {
  return { schema: { type: 'string' as const }, render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }] }
}

function sessionKey(agent: any): string { return String(agent?.session?.id ?? agent?.id ?? 'unknown') }
function presetOf(agent: any): string { return String(agent?.session?.projectionValues?.agentPreset ?? agent?.session?.meta?.agentPreset ?? agent?.session?.header?.agentPreset ?? '') }

export function capabilityActionability(localActionability: unknown, excluded: boolean, runtimeVisible: boolean): string {
  if (excluded) return 'not-in-current-mode'
  if (localActionability !== 'runtime-verification-required') return typeof localActionability === 'string' ? localActionability : 'local-facts-unavailable'
  return runtimeVisible ? 'ready' : 'setup-required'
}

const booleanSchema = { parse(value: unknown): boolean { if (typeof value !== 'boolean') throw new TypeError('expected boolean'); return value } }
function packagedSkill(name: 'alf' | 'alfred'): string {
  const markdown = readFileSync(new URL(`../skills/${name}/SKILL.md`, import.meta.url), 'utf8')
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, '')
}

const alfredAvailableProjection = {
  key: 'alfredAvailable',
  stateSchema: booleanSchema,
  init: () => false,
  apply: (state: boolean, event: any) => event?.type === 'alfred/available' || event?.type === 'alfred/legacy-global' ? true : state,
  wire: { viewSchema: booleanSchema, view: (state: boolean) => state },
  stateVersion: 1,
}

export function apply(ctx: Context, config: ControlConfig = {}): void {
  const runtime = ctx as Context & {
    tools: { register(value: unknown): unknown; schemas(agent?: unknown): Array<{ name: string }> }
    skills: {
      register(skill: { name: string; description: string; content: string; source: 'runtime'; provider?: string }): unknown
      list(options?: unknown): Promise<Array<{ name: string; description: string; source: string }>>
    }
    sessionProjections: { register(definition: unknown): unknown; stateOf(session: unknown, key: string): unknown }
    on(event: string, listener: (...args: any[]) => unknown): unknown
  }
  const root = config.alfredRoot || defaultAlfredRoot(import.meta.url)
  const probe = new CapabilityProbe({ alfredRoot: root, ttlMs: config.probeTtlMs ?? 300_000, timeoutMs: config.probeTimeoutMs ?? 5_000 })
  const routes = loadRoutes(root)
  const excluded = new Set(config.excludedPresets ?? ['minimal'])
  const sessions = new Map<string, SessionRoutingState>()
  const addressAuthorizations = new Map<string, { turnId: string; address: string; consumed: boolean }>()
  runtime.skills.register({
    name: 'alfred',
    description: 'Use when the user explicitly addresses alf or alfred, or asks Alfred to coordinate available capabilities — inspect current capability facts first, then load the most relevant domain Skill before acting.',
    content: packagedSkill('alfred'),
    source: 'runtime',
    provider: 'dsh-alfred',
  })
  runtime.skills.register({
    name: 'alf',
    description: 'Use when the direct user invokes /alf or starts a request with alf — route the request through the canonical alfred capability-dispatch Skill.',
    content: packagedSkill('alf'),
    source: 'runtime',
    provider: 'dsh-alfred',
  })
  runtime.sessionProjections.register(alfredAvailableProjection)

  async function capabilityView(agent: any, signal?: AbortSignal): Promise<unknown> {
    const [base, skills] = await Promise.all([
      probe.snapshot(signal),
      runtime.skills.list({ cwd: agent?.session?.cwd ?? agent?.session?.header?.cwd, scope: agent, signal }).catch(() => []),
    ])
    const visibleSkills = new Set(skills.map(skill => skill.name))
    const visibleTools = new Set(runtime.tools.schemas(agent).map(tool => tool.name))
    const localRows = Array.isArray((base as any)?.data?.capabilities) ? (base as any).data.capabilities : []
    const localById = new Map(localRows.map((row: any) => [String(row.id), row]))
    const capabilities = routes.map(route => {
      const skillsExpected = route.skills
      const toolsExpected = route.tools
      const skillVisibility = skillsExpected.map(id => ({ id, visible: visibleSkills.has(id) }))
      const toolVisibility = toolsExpected.map(id => ({ id, visible: visibleTools.has(id) }))
      const hasExpected = [...skillVisibility, ...toolVisibility]
      const runtimeVisible = hasExpected.length > 0 && hasExpected.every(row => row.visible)
      const partiallyVisible = !runtimeVisible && hasExpected.some(row => row.visible)
      const local = localById.get(route.id) as any
      return {
        id: route.id,
        module: route.module,
        summary: route.summary,
        declaration: 'declared',
        runtimeVisibility: excluded.has(presetOf(agent)) ? 'excluded-mode' : runtimeVisible ? 'visible' : partiallyVisible ? 'partial' : 'not-visible',
        entryPoints: { skills: skillVisibility, tools: toolVisibility },
        mutationPolicy: route.mutation,
        actionability: capabilityActionability(local?.actionability, excluded.has(presetOf(agent)), runtimeVisible),
      }
    })
    return {
      ok: true,
      product: 'Alfred',
      shortName: 'ALF',
      scope: { currentSession: true, preset: presetOf(agent) || 'unknown' },
      capabilities,
      localFacts: base,
      limitations: ['runtime visibility does not guarantee permission, network, upstream, or write approval success'],
      observedAt: new Date().toISOString(),
    }
  }

  runtime.tools.register(defineTool({
    name: 'alfred_capabilities',
    description: '查询 ALF 管理的增强能力及当前会话可见性；区分源码、安装、配置和运行时事实，不把通用大模型或 DSH 能力算作 Alfred 特有能力。只读。',
    parameters: {},
    output: textOutput(),
    execute: async (_args, exec) => JSON.stringify(await capabilityView(exec.agent, exec.signal)),
  }))

  runtime.tools.register(defineTool({
    name: 'alfred_set_preferred_address',
    description: '保存用户明确指定的称呼偏好，供本机后续 Alfred/ALF persona 会话使用；不读取或修改任何领域账本。',
    parameters: { address: { type: 'string', required: true, description: '用户明确指定的称呼。' } },
    output: textOutput(),
    execute: async (args, exec) => {
      if (!isTopLevelHumanAgent(exec.agent) || excluded.has(presetOf(exec.agent))) throw new Error('称呼偏好只能由当前非排除模式的顶层用户会话保存。')
      const authorization = addressAuthorizations.get(sessionKey(exec.agent))
      const requested = String(args.address).trim()
      if (!authorization || authorization.consumed || authorization.address !== requested) throw new Error('本轮直接用户没有明确授权保存这一称呼。')
      authorization.consumed = true
      return JSON.stringify({ ok: true, preferences: writePreferredAddress(requested) })
    },
  }))

  runtime.on('tools/change', () => probe.invalidate())
  runtime.on('skills/change', () => probe.invalidate())
  runtime.on('agent/session-start', ({ agent, source }: any) => {
    if (excluded.has(presetOf(agent)) || !isTopLevelHumanAgent(agent)) return
    if (runtime.sessionProjections.stateOf(agent.session, 'alfredAvailable') !== true) {
      agent.session.append(config.legacyGlobal ? 'alfred/legacy-global' : 'alfred/available', {})
    }
    const key = sessionKey(agent)
    if (source === 'startup' || source === 'clear' || !sessions.has(key)) {
      sessions.set(key, { prompted: new Set(), suppressed: false })
      addressAuthorizations.delete(key)
    }
    const preferred = readPreferences().preferredAddress
    const persona = preferred
      ? `用户持久化称呼偏好是「${preferred}」。请沿用，除非用户更改。\n`
      : '尚未保存称呼偏好；请在自然合适时询问一次，不得臆造。\n'
    agent.inject({
      id: `alf-control-${String(agent.id)}-${String(source)}`,
      role: 'user',
      content: [{ type: 'text', text: `${persona}ALF is the Alfred control plane, not a domain module. On direct human requests, use the current scope's tools and skill catalog. Do not advertise unrelated capabilities. Capability suggestions never authorize installation, migration, or writes.` }],
      source: { kind: 'plugin', plugin: 'dsh-alfred', form: 'instructions' },
    })
  })

  runtime.on('agent/pre-step', async ({ agent, messages }: any, next: () => Promise<any>) => {
    const downstream = await next()
    if (downstream.kind !== 'enter' || excluded.has(presetOf(agent)) || !isTopLevelHumanAgent(agent)) return downstream
    const text = directUserText(messages)
    if (!text) return downstream
    const key = sessionKey(agent)
    const directMessage = [...messages].reverse().find((message: any) => message?.source?.kind === 'user')
    const turnId = String(directMessage?.id ?? `${messages.length}:${text}`)
    if (addressAuthorizations.get(key)?.turnId !== turnId) {
      const address = preferredAddressFromText(text)
      if (address) addressAuthorizations.set(key, { turnId, address, consumed: false })
      else addressAuthorizations.delete(key)
    }
    const state = sessions.get(key) ?? { prompted: new Set<string>(), suppressed: false }
    sessions.set(key, state)
    const invocation = parseAlfredInvocation(text)
    const slashSkillInjected = invocation.slash && messages.some((message: any) =>
      message?.source?.kind === 'skill-invocation' && (message.source.name === 'alf' || message.source.name === 'alfred'))
    const instruction = invocation.explicit
      ? slashSkillInjected
        ? undefined
        : invocation.task
          ? 'The direct user explicitly invoked Alfred. Before acting, call the skill tool with name "alfred"; then inspect current capability facts and load only the relevant domain Skill. The invocation does not authorize installation, migration, configuration, or writes.'
          : 'The direct user invoked Alfred without a task. Ask what they want help with; do not advertise the whole capability catalog and do not install or change anything.'
      : routingInstruction(routeForTurn(text, state, routes))
    if (!instruction) return downstream
    return {
      ...downstream,
      messages: [...downstream.messages, {
        id: randomUUID(),
        role: 'user',
        content: [{ type: 'text', text: instruction }],
        source: { kind: 'plugin', plugin: 'dsh-alfred', form: 'instructions' },
      }],
    }
  })
}

export { ROUTES, loadRoutes, isCapabilityQuestion, matchRoutes } from './catalog.js'
export { preferencesPath, readPreferences, writePreferredAddress } from './preferences.js'
export { directUserText, isTopLevelHumanAgent, preferredAddressFromText, routeForTurn, routingInstruction } from './routing.js'
export { parseAlfredInvocation } from './trigger.js'
