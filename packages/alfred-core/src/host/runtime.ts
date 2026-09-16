import type { CapabilityRoute } from '../domain/catalog.js'
import { loadRoutes } from '../domain/catalog.js'
import { parseAlfredInvocation } from '../domain/trigger.js'
import { directUserText, routeForTurn, routingInstruction, type SessionRoutingState } from '../domain/routing.js'
import { handleCapabilities, type ProbeSnapshotSource } from '../domain/handlers.js'
import type { CapabilityActivationView } from '../domain/capability-view.js'
import type { HostSessionContext, HostVisibility } from './types.js'

export interface AlfredControlRuntimeOptions {
  alfredRoot: string
  probe: ProbeSnapshotSource
  routes?: readonly CapabilityRoute[]
}

/**
 * Host-agnostic wiring: routing state + capability handler.
 * Persona and preferred-address are intentionally absent (disabled this version).
 */
export class AlfredControlRuntime {
  private readonly sessions = new Map<string, SessionRoutingState>()
  private readonly routes: readonly CapabilityRoute[]
  readonly probe: ProbeSnapshotSource

  constructor(private readonly options: AlfredControlRuntimeOptions) {
    this.probe = options.probe
    this.routes = options.routes ?? loadRoutes(options.alfredRoot)
  }

  get capabilityRoutes(): readonly CapabilityRoute[] {
    return this.routes
  }

  resetSession(sessionId: string): void {
    this.sessions.set(sessionId, { prompted: new Set(), suppressed: false })
  }

  /**
   * Session start: persona injection is disabled this version.
   * Hosts may still call this to reset routing state.
   */
  onSessionStart(session: HostSessionContext, source: 'startup' | 'resume' | 'clear' | string = 'resume'): void {
    if (source === 'startup' || source === 'clear' || !this.sessions.has(session.sessionId)) {
      this.resetSession(session.sessionId)
    }
  }

  /**
   * Direct user turn: returns routing/explicit-invocation instruction text, or undefined.
   */
  onDirectUserTurn(
    session: HostSessionContext,
    text: string,
    options: { slashSkillInjected?: boolean } = {},
  ): string | undefined {
    if (session.isExcludedMode || !session.isTopLevelHuman) return undefined
    const trimmed = text.trim()
    if (!trimmed) return undefined
    const state = this.sessions.get(session.sessionId) ?? { prompted: new Set<string>(), suppressed: false }
    this.sessions.set(session.sessionId, state)
    const invocation = parseAlfredInvocation(trimmed)
    if (invocation.explicit) {
      if (options.slashSkillInjected) return undefined
      return invocation.task
        ? 'The direct user explicitly invoked Alfred. Before acting, call the skill tool with name "alfred"; then inspect current capability facts and load only the relevant domain Skill. The invocation does not authorize installation, migration, configuration, or writes.'
        : 'The direct user invoked Alfred without a task. Ask what they want help with; do not advertise the whole capability catalog and do not install or change anything.'
    }
    return routingInstruction(routeForTurn(trimmed, state, this.routes))
  }

  /** Convenience: extract last direct-user text then route. */
  onMessagesTurn(
    session: HostSessionContext,
    messages: readonly unknown[],
    options: { slashSkillInjected?: boolean } = {},
  ): string | undefined {
    const text = directUserText(messages)
    if (!text) return undefined
    return this.onDirectUserTurn(session, text, options)
  }

  async handleCapabilities(
    session: HostSessionContext,
    visibility: HostVisibility,
    signal?: AbortSignal,
    activation?: CapabilityActivationView,
  ): Promise<string> {
    return handleCapabilities(session, visibility, this.routes, this.probe, signal, activation)
  }
}
