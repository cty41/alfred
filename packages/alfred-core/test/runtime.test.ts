import { describe, expect, it } from 'vitest'
import { AlfredControlRuntime, buildCapabilityView, capabilityActionability } from '../src/index.js'

const probe = {
  async snapshot() {
    return { data: { capabilities: [{ id: 'hk-equity-research', actionability: 'runtime-verification-required' }] } }
  },
  invalidate() {},
}

function session(over: Partial<import('../src/host/types.js').HostSessionContext> = {}) {
  return {
    sessionId: 's1',
    turnNumber: 1,
    turnId: 't1',
    agentId: 'a1',
    isTopLevelHuman: true,
    isExcludedMode: false,
    modeName: 'build',
    ...over,
  }
}

describe('AlfredControlRuntime (no persona)', () => {
  it('routes explicit alf invocation without persona or address tools', () => {
    const alf = new AlfredControlRuntime({ alfredRoot: process.cwd(), probe })
    const text = alf.onDirectUserTurn(session(), 'alf 帮我查港股')
    expect(text).toContain('skill tool with name "alfred"')
    expect(text).not.toContain('称呼')
  })

  it('does not inject routing for excluded or non-top-level sessions', () => {
    const alf = new AlfredControlRuntime({ alfredRoot: process.cwd(), probe })
    expect(alf.onDirectUserTurn(session({ isExcludedMode: true }), '查询港股行情')).toBeUndefined()
    expect(alf.onDirectUserTurn(session({ isTopLevelHuman: false }), '查询港股行情')).toBeUndefined()
  })

  it('suppresses repeated capability hints in one session', () => {
    const alf = new AlfredControlRuntime({ alfredRoot: process.cwd(), probe })
    const first = alf.onDirectUserTurn(session(), '查询港股估值')
    expect(first).toBeTruthy()
    const second = alf.onDirectUserTurn(session({ turnNumber: 2, turnId: 't2' }), '查询港股估值')
    expect(second).toBeUndefined()
  })

  it('builds capability view without preferred-address entry points', async () => {
    const view = await buildCapabilityView({
      routes: [{ id: 'hk-equity-research', module: 'fin-value', summary: 's', skills: [], tools: ['t'], mutation: 'read-only' }],
      localFacts: { data: { capabilities: [] } },
      visibleSkillNames: new Set(),
      visibleToolNames: new Set(['t']),
      excluded: false,
      modeName: 'build',
    }) as any
    expect(view.capabilities[0].runtimeVisibility).toBe('visible')
    expect(JSON.stringify(view)).not.toContain('preferred_address')
  })

  it('reports installed, eligible, and active on-demand domain state', async () => {
    const view = await buildCapabilityView({
      routes: [{ id: 'hk-equity-research', module: 'fin-value', summary: 's', skills: ['fin'], tools: ['quote'], mutation: 'read-only' }],
      localFacts: { data: { capabilities: [] } },
      visibleSkillNames: new Set(),
      visibleToolNames: new Set(),
      excluded: false,
      modeName: 'standard',
      activation: {
        managedModules: new Set(['fin-value']),
        installedModules: new Set(['fin-value']),
        eligibleModules: new Set(['fin-value']),
        activeModules: new Set(),
      },
    }) as any
    expect(view.capabilities[0]).toMatchObject({
      installed: true,
      eligible: true,
      active: false,
      activation: 'on-demand',
      runtimeVisibility: 'not-visible',
    })
  })

  it('keeps actionability mapping host-agnostic', () => {
    expect(capabilityActionability('runtime-verification-required', false, true)).toBe('ready')
    expect(capabilityActionability('runtime-verification-required', true, true)).toBe('not-in-current-mode')
  })
})
