import type { HostSessionContext } from './types.js'

export type CapabilityActivationStatus = 'inactive' | 'activating' | 'active' | 'failed'

export interface CapabilityActivationHandle {
  dispose(): void | Promise<void>
}

export interface CapabilityDomainDefinition {
  id: string
  capabilityIds: readonly string[]
}

export interface CapabilityActivationSnapshot {
  domainId: string
  status: CapabilityActivationStatus
  error?: string
}

interface ActivationEntry {
  status: CapabilityActivationStatus
  promise?: Promise<CapabilityActivationSnapshot>
  handle?: CapabilityActivationHandle
  error?: string
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Host-neutral live activation state. The host owns module loading and supplies
 * one transactional mount callback per domain; this class owns only dedupe,
 * retry, inheritance facts, and disposal.
 */
export class CapabilityActivationRuntime {
  private readonly domainByCapability = new Map<string, string>()
  private readonly sessions = new Map<string, Map<string, ActivationEntry>>()

  constructor(readonly domains: readonly CapabilityDomainDefinition[]) {
    for (const domain of domains) {
      if (!domain.id.trim()) throw new Error('capability activation domain id must not be empty')
      for (const capabilityId of domain.capabilityIds) {
        if (this.domainByCapability.has(capabilityId)) {
          throw new Error(`capability "${capabilityId}" belongs to more than one activation domain`)
        }
        this.domainByCapability.set(capabilityId, domain.id)
      }
    }
  }

  domainForCapability(capabilityId: string): string | undefined {
    return this.domainByCapability.get(capabilityId)
  }

  snapshot(sessionId: string, domainId: string): CapabilityActivationSnapshot {
    const entry = this.sessions.get(sessionId)?.get(domainId)
    return entry === undefined
      ? { domainId, status: 'inactive' }
      : { domainId, status: entry.status, ...(entry.error === undefined ? {} : { error: entry.error }) }
  }

  isActive(sessionId: string, domainId: string): boolean {
    return this.sessions.get(sessionId)?.get(domainId)?.status === 'active'
  }

  activeDomains(sessionId: string): ReadonlySet<string> {
    return new Set([...this.sessions.get(sessionId)?.entries() ?? []]
      .filter(([, entry]) => entry.status === 'active')
      .map(([domainId]) => domainId))
  }

  canInherit(parentSessionId: string | undefined, domainId: string): boolean {
    return parentSessionId !== undefined && this.isActive(parentSessionId, domainId)
  }

  async activate(
    sessionId: string,
    domainId: string,
    mount: () => Promise<CapabilityActivationHandle>,
  ): Promise<CapabilityActivationSnapshot> {
    if (!this.domains.some(domain => domain.id === domainId)) {
      throw new Error(`unknown capability activation domain "${domainId}"`)
    }
    let session = this.sessions.get(sessionId)
    if (session === undefined) {
      session = new Map()
      this.sessions.set(sessionId, session)
    }
    const current = session.get(domainId)
    if (current?.status === 'active') return { domainId, status: 'active' }
    if (current?.status === 'activating' && current.promise !== undefined) return current.promise

    const entry: ActivationEntry = { status: 'activating' }
    session.set(domainId, entry)
    entry.promise = (async () => {
      try {
        const handle = await mount()
        entry.handle = handle
        entry.status = 'active'
        entry.error = undefined
        return { domainId, status: 'active' as const }
      } catch (error: unknown) {
        entry.status = 'failed'
        entry.error = messageOf(error)
        return { domainId, status: 'failed' as const, error: entry.error }
      } finally {
        entry.promise = undefined
      }
    })()
    return entry.promise
  }

  async disposeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    this.sessions.delete(sessionId)
    if (session === undefined) return
    const entries = [...session.values()]
    await Promise.all(entries.map(async entry => {
      if (entry.promise !== undefined) await entry.promise
      await entry.handle?.dispose()
    }))
  }
}

export interface ActivationEligibility {
  allowed: boolean
  reason?: 'excluded-mode' | 'project-disabled' | 'parent-not-active'
}

/** Decide whether a top-level or inherited child activation may proceed. */
export function activationEligibility(
  session: HostSessionContext,
  options: { projectEnabled: boolean; parentDomainActive?: boolean },
): ActivationEligibility {
  if (session.isExcludedMode) return { allowed: false, reason: 'excluded-mode' }
  if (session.isTopLevelHuman) {
    return options.projectEnabled ? { allowed: true } : { allowed: false, reason: 'project-disabled' }
  }
  return options.parentDomainActive === true
    ? { allowed: true }
    : { allowed: false, reason: 'parent-not-active' }
}
