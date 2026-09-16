import { describe, expect, it } from 'vitest'
import { CapabilityActivationRuntime, activationEligibility } from '../src/index.js'
import type { HostSessionContext } from '../src/index.js'

const domains = [{ id: 'fin-value', capabilityIds: ['hk-equity-research', 'investment-ledger'] }]

function session(over: Partial<HostSessionContext> = {}): HostSessionContext {
  return {
    sessionId: 's1', turnNumber: 1, turnId: 't1', agentId: 'a1',
    isTopLevelHuman: true, isExcludedMode: false, modeName: 'standard',
    ...over,
  }
}

describe('CapabilityActivationRuntime', () => {
  it('maps capabilities to one domain and starts inactive', () => {
    const runtime = new CapabilityActivationRuntime(domains)
    expect(runtime.domainForCapability('hk-equity-research')).toBe('fin-value')
    expect(runtime.snapshot('s1', 'fin-value')).toEqual({ domainId: 'fin-value', status: 'inactive' })
  })

  it('deduplicates concurrent activation and disposes the mounted handle', async () => {
    const runtime = new CapabilityActivationRuntime(domains)
    let mounts = 0
    let disposals = 0
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const mount = async () => {
      mounts += 1
      await gate
      return { dispose: () => { disposals += 1 } }
    }
    const first = runtime.activate('s1', 'fin-value', mount)
    const second = runtime.activate('s1', 'fin-value', mount)
    expect(runtime.snapshot('s1', 'fin-value').status).toBe('activating')
    release()
    await expect(Promise.all([first, second])).resolves.toEqual([
      { domainId: 'fin-value', status: 'active' },
      { domainId: 'fin-value', status: 'active' },
    ])
    expect(mounts).toBe(1)
    expect(runtime.canInherit('s1', 'fin-value')).toBe(true)
    await runtime.disposeSession('s1')
    expect(disposals).toBe(1)
    expect(runtime.snapshot('s1', 'fin-value').status).toBe('inactive')
  })

  it('records a failed mount and permits an explicit retry', async () => {
    const runtime = new CapabilityActivationRuntime(domains)
    await expect(runtime.activate('s1', 'fin-value', async () => { throw new Error('missing runtime') }))
      .resolves.toEqual({ domainId: 'fin-value', status: 'failed', error: 'missing runtime' })
    expect(runtime.snapshot('s1', 'fin-value')).toEqual({ domainId: 'fin-value', status: 'failed', error: 'missing runtime' })
    await expect(runtime.activate('s1', 'fin-value', async () => ({ dispose() {} })))
      .resolves.toEqual({ domainId: 'fin-value', status: 'active' })
  })

  it('rejects duplicate capability ownership', () => {
    expect(() => new CapabilityActivationRuntime([
      ...domains,
      { id: 'other', capabilityIds: ['hk-equity-research'] },
    ])).toThrow('belongs to more than one')
  })
})

describe('activationEligibility', () => {
  it('requires project enablement for top-level sessions', () => {
    expect(activationEligibility(session(), { projectEnabled: true })).toEqual({ allowed: true })
    expect(activationEligibility(session(), { projectEnabled: false })).toEqual({ allowed: false, reason: 'project-disabled' })
  })

  it('allows child sessions only when the parent domain is active', () => {
    const child = session({ isTopLevelHuman: false })
    expect(activationEligibility(child, { projectEnabled: false, parentDomainActive: true })).toEqual({ allowed: true })
    expect(activationEligibility(child, { projectEnabled: true, parentDomainActive: false })).toEqual({ allowed: false, reason: 'parent-not-active' })
  })

  it('always rejects excluded modes', () => {
    expect(activationEligibility(session({ isExcludedMode: true }), { projectEnabled: true })).toEqual({ allowed: false, reason: 'excluded-mode' })
  })
})
