import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'
import {
  AlfredControlRuntime,
  CapabilityActivationRuntime,
  CapabilityProbe,
  ROUTES,
  activationEligibility,
  capabilityActionability,
  defaultAlfredRoot,
  directUserText,
  isCapabilityQuestion,
  isTopLevelHumanAgent,
  loadRoutes,
  matchRoutes,
  parseAlfredInvocation,
  resolveAlfredActivation,
  routeForTurn,
  routingInstruction,
  type HostSessionContext,
  type HostVisibility,
} from 'alfred-core'

export const name = 'dsh-alfred'
export const inject = ['tools', 'skills', 'loader']

interface ControlConfig {
  alfredRoot?: string
  home?: string
  probeTtlMs?: number
  probeTimeoutMs?: number
  excludedPresets?: string[]
  finValue?: Record<string, unknown>
}

export const Config: z<ControlConfig> = z.object({
  alfredRoot: z.string().default(''),
  home: z.string().default(''),
  probeTtlMs: z.number().default(300_000),
  probeTimeoutMs: z.number().default(5_000),
  excludedPresets: z.array(z.string()).default(['minimal']),
  finValue: z.any().default({}),
})

function textOutput() {
  return { schema: { type: 'string' as const }, render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }] }
}

function sessionKey(agent: any): string {
  return String(agent?.session?.id ?? agent?.id ?? 'unknown')
}

function sessionMeta(agent: any): Record<string, unknown> {
  return { ...(agent?.session?.header ?? {}), ...(agent?.session?.meta ?? {}) }
}

function presetOf(agent: any): string {
  return String(agent?.session?.projectionValues?.agentPreset ?? agent?.session?.meta?.agentPreset ?? agent?.session?.header?.agentPreset ?? '')
}

function currentTurn(agent: any): number {
  const events = agent?.session?.events
  if (!Array.isArray(events)) return 0
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event?.type === 'turn/start' && Number.isSafeInteger(event?.data?.turn)) return event.data.turn
  }
  return 0
}

function turnIdOf(messages: readonly any[], text: string): string {
  const direct = [...messages].reverse().find((message: any) => message?.source?.kind === 'user')
  return String(direct?.id ?? text.slice(0, 64))
}

function toHostSession(agent: any, excluded: Set<string>, messages?: readonly any[], text?: string): HostSessionContext {
  const mode = presetOf(agent)
  const meta = sessionMeta(agent)
  const parentSession = typeof meta.parentSession === 'string' ? meta.parentSession : undefined
  return {
    sessionId: sessionKey(agent),
    turnNumber: currentTurn(agent),
    turnId: turnIdOf(messages ?? [], text ?? ''),
    agentId: String(agent?.id ?? 'unknown'),
    isTopLevelHuman: isTopLevelHumanAgent(agent),
    isExcludedMode: excluded.has(mode),
    cwd: agent?.session?.cwd ?? agent?.session?.header?.cwd,
    modeName: mode || 'unknown',
    ...(parentSession === undefined ? {} : { parentSessionId: parentSession }),
  }
}

function packagedSkill(name: 'alf' | 'alfred'): string {
  const markdown = readFileSync(new URL(`../skills/${name}/SKILL.md`, import.meta.url), 'utf8')
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, '')
}

interface AuthorizedIntent {
  domains: Set<string>
  text: string
}

const FIN_VALUE_DOMAIN = 'fin-value'
const FIN_VALUE_CAPABILITIES = ROUTES.filter(route => route.module === FIN_VALUE_DOMAIN).map(route => route.id)

export function apply(ctx: Context, config: ControlConfig = {}): void {
  const runtime = ctx as Context & {
    tools: { register(value: unknown): unknown; schemas(agent?: unknown): Array<{ name: string }> }
    skills: {
      register(skill: { name: string; description: string; content: string; source: 'runtime'; provider?: string }): unknown
      list(options?: unknown): Promise<Array<{ name: string; description: string; source: string }>>
    }
    loader: { internal?: { import(name: string, baseUrl: string, options: Record<string, unknown>): unknown } }
    on(event: string, listener: (...args: any[]) => unknown): unknown
  }
  const root = config.alfredRoot || defaultAlfredRoot(import.meta.url)
  const probe = new CapabilityProbe({ alfredRoot: root, ttlMs: config.probeTtlMs ?? 300_000, timeoutMs: config.probeTimeoutMs ?? 5_000 })
  const excluded = new Set(config.excludedPresets ?? ['minimal'])
  const alf = new AlfredControlRuntime({ alfredRoot: root, probe })
  const activations = new CapabilityActivationRuntime([
    { id: FIN_VALUE_DOMAIN, capabilityIds: FIN_VALUE_CAPABILITIES },
  ])
  const intents = new Map<string, AuthorizedIntent>()
  const baseUrl = ctx.baseUrl ?? import.meta.url
  let finValueModule: unknown | undefined
  let finValueImport: Promise<unknown> | undefined

  async function resolveFinValue(): Promise<unknown> {
    if (finValueModule !== undefined) return finValueModule
    if (finValueImport !== undefined) return finValueImport
    const internal = runtime.loader.internal
    if (internal === undefined) throw new Error('dsh-alfred: DSH module loader is unavailable')
    finValueImport = Promise.resolve(internal.import('dsh-fin-value', baseUrl, {}))
      .then((plugin) => {
        finValueModule = plugin
        return plugin
      })
      .finally(() => { finValueImport = undefined })
    return finValueImport
  }

  function projectEnabled(session: HostSessionContext): boolean {
    return Boolean(session.cwd && resolveAlfredActivation(session.cwd, config.home || undefined).enabled)
  }

  function eligible(session: HostSessionContext, domainId: string): boolean {
    return activationEligibility(session, {
      projectEnabled: projectEnabled(session),
      parentDomainActive: activations.canInherit(session.parentSessionId, domainId),
    }).allowed
  }

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

  function visibilityFor(agent: any): HostVisibility {
    return {
      listVisibleSkills: async () => {
        const skills = await runtime.skills
          .list({ cwd: agent?.session?.cwd ?? agent?.session?.header?.cwd, scope: agent })
          .catch(() => [])
        return skills.map(skill => ({ name: skill.name }))
      },
      listVisibleTools: () => runtime.tools.schemas(agent).map(tool => ({ name: tool.name })),
    }
  }

  runtime.tools.register(defineTool({
    name: 'alfred_capabilities',
    description: '查询 ALF 管理的增强能力及当前会话可见性；区分安装、可激活、已激活和运行时事实，不把通用大模型或 DSH 能力算作 Alfred 特有能力。只读。',
    parameters: {},
    output: textOutput(),
    execute: async (_args, exec) => {
      const session = toHostSession(exec.agent, excluded)
      let installed = false
      try {
        await resolveFinValue()
        installed = true
      } catch {}
      const snapshot = activations.snapshot(session.sessionId, FIN_VALUE_DOMAIN)
      const failed = snapshot.status === 'failed' && snapshot.error
        ? new Map([[FIN_VALUE_DOMAIN, snapshot.error]])
        : new Map<string, string>()
      return alf.handleCapabilities(session, visibilityFor(exec.agent), exec.signal, {
        managedModules: new Set([FIN_VALUE_DOMAIN]),
        installedModules: installed ? new Set([FIN_VALUE_DOMAIN]) : new Set(),
        eligibleModules: eligible(session, FIN_VALUE_DOMAIN) ? new Set([FIN_VALUE_DOMAIN]) : new Set(),
        activeModules: activations.activeDomains(session.sessionId),
        failedModules: failed,
      })
    },
  }))

  runtime.tools.register(defineTool({
    name: 'alfred_activate',
    description: '仅为当前 Agent 按需激活由当前直接用户意图授权的 ALF 领域能力；不安装软件、不修改配置、不授权任何领域写入。',
    parameters: {
      domainId: { type: 'string', required: true, enum: [FIN_VALUE_DOMAIN] },
    },
    output: textOutput(),
    execute: async (args, exec) => {
      if (exec.agent === undefined) throw new Error('ALF 领域激活需要当前 Agent 上下文。')
      const agent = exec.agent
      const session = toHostSession(agent, excluded)
      const domainId = String(args.domainId)
      const intent = intents.get(session.sessionId)
      if (!intent?.domains.has(domainId)) {
        throw new Error(`当前用户请求没有授权激活领域 "${domainId}"。`)
      }
      const decision = activationEligibility(session, {
        projectEnabled: projectEnabled(session),
        parentDomainActive: activations.canInherit(session.parentSessionId, domainId),
      })
      if (!decision.allowed) throw new Error(`当前会话不能激活领域 "${domainId}": ${decision.reason}`)
      const result = await activations.activate(session.sessionId, domainId, async () => {
        const plugin = await resolveFinValue()
        const mount = agent.ctx.plugin as unknown as (plugin: unknown, pluginConfig?: unknown) => PromiseLike<unknown> & { dispose(): void | Promise<void> }
        const fiber = mount.call(agent.ctx, plugin, config.finValue ?? {})
        await fiber
        return { dispose: () => fiber.dispose() }
      })
      if (result.status !== 'active') throw new Error(`领域 "${domainId}" 激活失败: ${result.error ?? 'unknown error'}`)
      probe.invalidate()
      return JSON.stringify({ ok: true, domainId, status: 'active', scope: 'current-agent', writesAuthorized: false })
    },
  }))

  runtime.on('tools/change', () => probe.invalidate())
  runtime.on('skills/change', () => probe.invalidate())

  runtime.on('agent/session-start', ({ agent, source }: any) => {
    const session = toHostSession(agent, excluded)
    intents.delete(session.sessionId)
    alf.onSessionStart(session, source)
  })

  runtime.on('agent/disposed', ({ agent }: any) => {
    const sessionId = sessionKey(agent)
    intents.delete(sessionId)
    void activations.disposeSession(sessionId)
  })

  runtime.on('agent/pre-step', async ({ agent, messages }: any, next: () => Promise<any>) => {
    const downstream = await next()
    if (downstream.kind !== 'enter') return downstream
    const userText = directUserText(messages ?? [])
    const session = toHostSession(agent, excluded, messages, userText)
    if (session.isExcludedMode) {
      intents.set(session.sessionId, { domains: new Set(), text: userText })
      return downstream
    }

    let domains = new Set<string>()
    let instruction: string | undefined
    if (session.isTopLevelHuman) {
      if (!userText || !projectEnabled(session)) {
        intents.set(session.sessionId, { domains, text: userText })
        return downstream
      }
      domains = new Set(matchRoutes(userText, alf.capabilityRoutes, 20)
        .map(route => route.module)
        .filter(module => module === FIN_VALUE_DOMAIN && !activations.isActive(session.sessionId, module)))
      const slashSkillInjected = (messages ?? []).some((message: any) =>
        message?.source?.kind === 'skill-invocation' && (message.source.name === 'alf' || message.source.name === 'alfred'))
      instruction = alf.onMessagesTurn(session, messages, { slashSkillInjected })
    } else if (session.parentSessionId !== undefined) {
      domains = new Set([...activations.activeDomains(session.parentSessionId)]
        .filter(domainId => !activations.isActive(session.sessionId, domainId)))
    }
    intents.set(session.sessionId, { domains, text: userText })

    const activationInstruction = domains.size === 0
      ? undefined
      : `Before using the matched ALF domain, call alfred_activate once for each required domainId: ${[...domains].join(', ')}. This only mounts already-installed tools into the current Agent; it does not authorize any domain write. Continue the original request in the same user turn after activation.`
    const combined = [instruction, activationInstruction].filter(Boolean).join('\n\n')
    if (!combined) return downstream
    return {
      ...downstream,
      messages: [...downstream.messages, {
        id: randomUUID(),
        role: 'user',
        content: [{ type: 'text', text: combined }],
        source: { kind: 'plugin', plugin: 'dsh-alfred', form: 'instructions' },
      }],
    }
  })
}

export {
  ROUTES,
  loadRoutes,
  isCapabilityQuestion,
  matchRoutes,
  directUserText,
  isTopLevelHumanAgent,
  routeForTurn,
  routingInstruction,
  parseAlfredInvocation,
  capabilityActionability,
  AlfredControlRuntime,
} from 'alfred-core'
export { preferencesPath, readPreferences, writePreferredAddress } from './preferences.js'
