import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { apply, capabilityActionability } from '../src/index.js'

describe('dsh-alfred integration', () => {
  it('registers scoped control tools and direct-user lifecycle hooks', () => {
    const tools: string[] = []
    const skills: string[] = []
    const events: string[] = []
    apply({
      tools: { register: (tool: { name: string }) => tools.push(tool.name), schemas: async () => [] },
      skills: { register: (skill: { name: string }) => skills.push(skill.name), list: async () => [] },
      sessionProjections: { register: () => undefined, stateOf: () => false },
      on: (event: string) => events.push(event),
    } as never, { alfredRoot: process.cwd() })
    expect(tools).toEqual(['alfred_capabilities', 'alfred_set_preferred_address'])
    expect(skills).toEqual(['alfred', 'alf'])
    expect(events).toEqual(['tools/change', 'skills/change', 'agent/session-start', 'agent/pre-step'])
  })

  it('requires healthy local facts before reporting runtime readiness', () => {
    expect(capabilityActionability('receipt-stale', false, true)).toBe('receipt-stale')
    expect(capabilityActionability('runtime-verification-required', false, true)).toBe('ready')
    expect(capabilityActionability('runtime-verification-required', true, true)).toBe('not-in-current-mode')
  })

  it('ships a bootstrap-only profile patch and hidden historical composition', () => {
    const patch = readFileSync(path.resolve('packages/dsh-alfred/cordis.patch.yml'), 'utf8')
    expect(patch).toContain('name: dsh-alfred/bootstrap')
    expect(patch).not.toMatch(/^\s+name: dsh-alfred\s*$/mu)
    expect(readFileSync(path.resolve('packages/dsh-alfred/presets/alfred/preset.yml'), 'utf8')).toContain('hidden: true')
    const preset = readFileSync(path.resolve('packages/dsh-alfred/presets/alfred/agent.cordis.yml'), 'utf8')
    for (const id of ['tool-pwsh', 'tool-fs', 'tool-jobs', 'alf-control', 'fin-value', 'tool-goal', 'plan-mode', 'compaction-basic', 'tool-subagent', 'tool-workflow', 'tool-ask-user', 'tool-todo', 'tool-web']) {
      expect(preset).toContain(`id: ${id}`)
    }
  })

  it('rejects preferred-address writes from subagents and excluded presets', async () => {
    const tools: any[] = []
    apply({
      tools: { register: (tool: unknown) => tools.push(tool), schemas: () => [] },
      skills: { register: () => undefined, list: async () => [] },
      sessionProjections: { register: () => undefined, stateOf: () => false },
      on: () => undefined,
    } as never, { alfredRoot: process.cwd() })
    const address = tools.find(tool => tool.name === 'alfred_set_preferred_address')
    await expect(address.execute({ address: '先生' }, { agent: { session: { meta: { origin: 'subagent' } } } })).rejects.toThrow()
    await expect(address.execute({ address: '先生' }, { agent: { session: { projectionValues: { agentPreset: 'minimal' }, meta: {} } } })).rejects.toThrow()
    await expect(address.execute({ address: '先生' }, { agent: { session: { id: 'top-level', projectionValues: { agentPreset: 'alfred' }, meta: {} } } })).rejects.toThrow('本轮直接用户')
  })

  it.each([false, true])('records ignorable Web visibility metadata (legacyGlobal=%s)', (legacyGlobal) => {
    const listeners = new Map<string, (...args: any[]) => unknown>()
    const appended: unknown[] = []
    apply({
      tools: { register: () => undefined, schemas: () => [] },
      skills: { register: () => undefined, list: async () => [] },
      sessionProjections: { register: () => undefined, stateOf: () => false },
      on: (event: string, listener: (...args: any[]) => unknown) => listeners.set(event, listener),
    } as never, { alfredRoot: process.cwd(), legacyGlobal })
    listeners.get('agent/session-start')?.({
      source: 'resume',
      agent: { id: 'a', session: { id: 's', header: { agentPreset: 'standard' }, appendIgnorable: (type: string, data: unknown) => appended.push({ type, data, ignorable: true }) }, inject: () => undefined },
    })
    expect(appended).toEqual([{ type: legacyGlobal ? 'alfred/legacy-global' : 'alfred/available', data: {}, ignorable: true }])
  })

  it('rejects an older harness before it can append an unreadable visibility event', () => {
    const listeners = new Map<string, (...args: any[]) => unknown>()
    const appended: unknown[] = []
    apply({
      tools: { register: () => undefined, schemas: () => [] },
      skills: { register: () => undefined, list: async () => [] },
      sessionProjections: { register: () => undefined, stateOf: () => false },
      on: (event: string, listener: (...args: any[]) => unknown) => listeners.set(event, listener),
    } as never, { alfredRoot: process.cwd() })
    expect(() => listeners.get('agent/session-start')?.({
      source: 'startup',
      agent: { id: 'a', session: { id: 's', header: { agentPreset: 'standard' }, append: (...args: unknown[]) => appended.push(args) }, inject: () => undefined },
    })).toThrow('requires DSH Session.appendIgnorable')
    expect(appended).toEqual([])
  })

  it('prioritizes explicit natural Alfred invocation and leaves slash Skill injection authoritative', async () => {
    const listeners = new Map<string, (...args: any[]) => unknown>()
    apply({
      tools: { register: () => undefined, schemas: () => [] },
      skills: { register: () => undefined, list: async () => [] },
      sessionProjections: { register: () => undefined, stateOf: () => false },
      on: (event: string, listener: (...args: any[]) => unknown) => listeners.set(event, listener),
    } as never, { alfredRoot: process.cwd() })
    const preStep = listeners.get('agent/pre-step')!
    const agent = { id: 'agent-explicit', session: { id: 'session-explicit', header: { agentPreset: 'standard' } } }
    const natural = await preStep({ agent, messages: [{ id: 'u1', role: 'user', content: [{ type: 'text', text: 'alf，帮我分析中海' }], source: { kind: 'user' } }] }, async () => ({ kind: 'enter', messages: [] })) as any
    expect(natural.messages[0]?.content[0]?.text).toContain('skill tool with name "alfred"')
    const rawSlash = await preStep({ agent, messages: [{ id: 'u2', role: 'user', content: [{ type: 'text', text: '/alf 帮我分析中海' }], source: { kind: 'user' } }] }, async () => ({ kind: 'enter', messages: [] })) as any
    expect(rawSlash.messages[0]?.content[0]?.text).toContain('skill tool with name "alfred"')
    const slash = await preStep({ agent, messages: [
      { id: 'u3', role: 'user', content: [{ type: 'text', text: '/alf 帮我分析中海' }], source: { kind: 'user' } },
      { id: 's3', role: 'user', content: [{ type: 'text', text: 'alias body' }], source: { kind: 'skill-invocation', name: 'alf', form: 'instructions' } },
    ] }, async () => ({ kind: 'enter', messages: [] })) as any
    expect(slash.messages).toEqual([])
  })

  it('identifies capability routing messages before they can be persisted', async () => {
    const listeners = new Map<string, (...args: any[]) => unknown>()
    apply({
      tools: { register: () => undefined, schemas: () => [] },
      skills: { register: () => undefined, list: async () => [] },
      sessionProjections: { register: () => undefined, stateOf: () => false },
      on: (event: string, listener: (...args: any[]) => unknown) => listeners.set(event, listener),
    } as never, { alfredRoot: process.cwd() })

    const preStep = listeners.get('agent/pre-step')
    expect(preStep).toBeDefined()
    const result = await preStep!(
      {
        agent: { id: 'agent-1', session: { id: 'session-1', header: { agentPreset: 'standard' } } },
        messages: [{
          id: 'human-1',
          role: 'user',
          content: [{ type: 'text', text: '查询港股行情' }],
          source: { kind: 'user' },
        }],
      },
      async () => ({ kind: 'enter', messages: [] }),
    ) as { kind: string; messages: Array<{ id?: unknown; source?: { plugin?: string } }> }

    expect(result.kind).toBe('enter')
    expect(result.messages).toHaveLength(1)
    expect(result.messages[0]?.source?.plugin).toBe('dsh-alfred')
    expect(result.messages[0]?.id).toEqual(expect.any(String))
    expect(result.messages[0]?.id).not.toBe('')
  })
})
