import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'
import { loadRoutes } from './catalog.js'
import { CapabilityProbe, defaultAlfredRoot } from './probe.js'
import { readPreferences, writePreferredAddress } from './preferences.js'
import { directUserText, isTopLevelHumanAgent, routeForTurn, routingInstruction, type SessionRoutingState } from './routing.js'

export const name = 'dsh-alfred'
export const inject = ['tools', 'skills']

interface ControlConfig {
  alfredRoot?: string
  probeTtlMs?: number
  probeTimeoutMs?: number
  excludedPresets?: string[]
}

export const Config: z<ControlConfig> = z.object({
  alfredRoot: z.string().default(''),
  probeTtlMs: z.number().default(300_000),
  probeTimeoutMs: z.number().default(5_000),
  excludedPresets: z.array(z.string()).default(['minimal']),
})

function textOutput() {
  return { schema: { type: 'string' as const }, render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }] }
}

function sessionKey(agent: any): string { return String(agent?.session?.id ?? agent?.id ?? 'unknown') }
function presetOf(agent: any): string { return String(agent?.session?.projectionValues?.agentPreset ?? agent?.session?.meta?.agentPreset ?? agent?.session?.header?.agentPreset ?? '') }

export function apply(ctx: Context, config: ControlConfig = {}): void {
  const runtime = ctx as Context & {
    tools: { register(value: unknown): unknown; schemas(agent?: unknown): Array<{ name: string }> }
    skills: { list(options?: unknown): Promise<Array<{ name: string; description: string; source: string }>> }
    on(event: string, listener: (...args: any[]) => unknown): unknown
  }
  const root = config.alfredRoot || defaultAlfredRoot(import.meta.url)
  const probe = new CapabilityProbe({ alfredRoot: root, ttlMs: config.probeTtlMs ?? 300_000, timeoutMs: config.probeTimeoutMs ?? 5_000 })
  const routes = loadRoutes(root)
  const excluded = new Set(config.excludedPresets ?? ['minimal'])
  const sessions = new Map<string, SessionRoutingState>()

  async function capabilityView(agent: any, signal?: AbortSignal): Promise<unknown> {
    const [base, skills] = await Promise.all([
      probe.snapshot(signal),
      runtime.skills.list({ cwd: agent?.session?.cwd ?? agent?.session?.header?.cwd, scope: agent, signal }).catch(() => []),
    ])
    const visibleSkills = new Set(skills.map(skill => skill.name))
    const visibleTools = new Set(runtime.tools.schemas(agent).map(tool => tool.name))
    const capabilities = routes.map(route => {
      const skillsExpected = route.skills
      const toolsExpected = route.tools
      const skillVisibility = skillsExpected.map(id => ({ id, visible: visibleSkills.has(id) }))
      const toolVisibility = toolsExpected.map(id => ({ id, visible: visibleTools.has(id) }))
      const hasExpected = [...skillVisibility, ...toolVisibility]
      const runtimeVisible = hasExpected.length > 0 && hasExpected.every(row => row.visible)
      const partiallyVisible = !runtimeVisible && hasExpected.some(row => row.visible)
      return {
        id: route.id,
        module: route.module,
        summary: route.summary,
        declaration: 'declared',
        runtimeVisibility: excluded.has(presetOf(agent)) ? 'excluded-mode' : runtimeVisible ? 'visible' : partiallyVisible ? 'partial' : 'not-visible',
        entryPoints: { skills: skillVisibility, tools: toolVisibility },
        mutationPolicy: route.mutation,
        actionability: excluded.has(presetOf(agent)) ? 'not-in-current-mode' : runtimeVisible ? 'ready' : 'setup-required',
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
      return JSON.stringify({ ok: true, preferences: writePreferredAddress(args.address) })
    },
  }))

  runtime.on('tools/change', () => probe.invalidate())
  runtime.on('skills/change', () => probe.invalidate())
  runtime.on('agent/session-start', ({ agent, source }: any) => {
    if (excluded.has(presetOf(agent)) || !isTopLevelHumanAgent(agent)) return
    const key = sessionKey(agent)
    if (source === 'startup' || source === 'clear' || !sessions.has(key)) sessions.set(key, { prompted: new Set(), suppressed: false })
    const preferred = presetOf(agent) === 'alfred' ? readPreferences().preferredAddress : undefined
    const persona = presetOf(agent) !== 'alfred'
      ? ''
      : preferred
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
    const state = sessions.get(key) ?? { prompted: new Set<string>(), suppressed: false }
    sessions.set(key, state)
    const instruction = routingInstruction(routeForTurn(text, state, routes))
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
export { directUserText, isTopLevelHumanAgent, routeForTurn, routingInstruction } from './routing.js'
