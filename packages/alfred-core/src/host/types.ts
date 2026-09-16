/** Minimal session facts a host must supply. No host SDK types. */
export interface HostSessionContext {
  sessionId: string
  turnNumber: number
  turnId: string
  agentId: string
  isTopLevelHuman: boolean
  isExcludedMode: boolean
  cwd?: string
  modeName: string
  /** Trusted host lineage used only for bounded capability inheritance. */
  parentSessionId?: string
}

export interface HostVisibility {
  listVisibleSkills(): Promise<Array<{ name: string }>>
  listVisibleTools(): Array<{ name: string }>
}

export type InstructionForm = 'routing'

export type ToolHandler<A, R> = (args: A, session: HostSessionContext, signal?: AbortSignal) => Promise<R>

/**
 * Glue contract every agent host implements. Domain/runtime never import host SDKs.
 * Persona / preferred-address are out of scope for this version.
 */
import type { AlfredControlRuntime } from './runtime.js'

export interface AgentHost {
  readonly id: string
  registerAlfTools(runtime: AlfredControlRuntime): void | Promise<void>
  registerAlfSkills(runtime: AlfredControlRuntime): void | Promise<void>
  resolveSession(raw: unknown): HostSessionContext | null
  visibility(session: HostSessionContext): HostVisibility
  injectInstruction(session: HostSessionContext, text: string, form: InstructionForm): void
}
