import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { apply, capabilityActionability } from '../src/index.js'

describe('dsh-alfred integration', () => {
  it('registers scoped control tools without preferred-address (persona disabled)', () => {
    const tools: string[] = []
    const skills: string[] = []
    const events: string[] = []
    apply({
      tools: { register: (tool: { name: string }) => tools.push(tool.name), schemas: () => [] },
      skills: { register: (skill: { name: string }) => skills.push(skill.name), list: async () => [] },
      on: (event: string) => events.push(event),
    } as never, { alfredRoot: process.cwd() })
    expect(tools).toEqual(['alfred_capabilities', 'alfred_activate'])
    expect(skills).toEqual(['alfred', 'alf'])
    expect(events).toEqual(['tools/change', 'skills/change', 'agent/session-start', 'agent/disposed', 'agent/pre-step'])
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

  it('does not register preferred-address tool or persona inject on session start', () => {
    const tools: any[] = []
    const listeners = new Map<string, (...args: any[]) => unknown>()
    const injected: unknown[] = []
    apply({
      tools: { register: (tool: unknown) => tools.push(tool), schemas: () => [] },
      skills: { register: () => undefined, list: async () => [] },
      on: (event: string, listener: (...args: any[]) => unknown) => listeners.set(event, listener),
    } as never, { alfredRoot: process.cwd() })
    expect(tools.some(tool => tool.name === 'alfred_set_preferred_address')).toBe(false)
    listeners.get('agent/session-start')?.({
      source: 'startup',
      agent: {
        id: 'a',
        session: { id: 's', header: { agentPreset: 'standard' } },
        inject: (value: unknown) => injected.push(value),
      },
    })
    expect(injected).toEqual([])
  })

  it('does not persist ALF availability events on session start', () => {
    const listeners = new Map<string, (...args: any[]) => unknown>()
    const appended: unknown[] = []
    apply({
      tools: { register: () => undefined, schemas: () => [] },
      skills: { register: () => undefined, list: async () => [] },
      on: (event: string, listener: (...args: any[]) => unknown) => listeners.set(event, listener),
    } as never, { alfredRoot: process.cwd() })
    listeners.get('agent/session-start')?.({
      source: 'resume',
      agent: { id: 'a', session: { id: 's', header: { agentPreset: 'standard' }, append: (...args: unknown[]) => appended.push(args) }, inject: () => undefined },
    })
    expect(appended).toEqual([])
  })

  it('prioritizes explicit natural Alfred invocation and leaves slash Skill injection authoritative', async () => {
    const listeners = new Map<string, (...args: any[]) => unknown>()
    apply({
      tools: { register: () => undefined, schemas: () => [] },
      skills: { register: () => undefined, list: async () => [] },
      on: (event: string, listener: (...args: any[]) => unknown) => listeners.set(event, listener),
    } as never, { alfredRoot: process.cwd() })
    const preStep = listeners.get('agent/pre-step')!
    const agent = { id: 'agent-explicit', session: { id: 'session-explicit', header: { agentPreset: 'standard', cwd: process.cwd() } } }
    const natural = await preStep({ agent, messages: [{ id: 'u1', role: 'user', content: [{ type: 'text', text: 'alf，帮我分析中海' }], source: { kind: 'user' } }] }, async () => ({ kind: 'enter', messages: [] })) as any
    expect(natural.messages[0]?.content[0]?.text).toContain('skill tool with name "alfred"')
    const rawSlash = await preStep({ agent, messages: [{ id: 'u2', role: 'user', content: [{ type: 'text', text: '/alf 帮我分析中海' }], source: { kind: 'user' } }] }, async () => ({ kind: 'enter', messages: [] })) as any
    expect(rawSlash.messages[0]?.content[0]?.text).toContain('skill tool with name "alfred"')
    const slash = await preStep({ agent, messages: [
      { id: 'u3', role: 'user', content: [{ type: 'text', text: '/alf 帮我分析中海' }], source: { kind: 'user' } },
      { id: 's3', role: 'user', content: [{ type: 'text', text: 'alias body' }], source: { kind: 'skill-invocation', name: 'alf', form: 'instructions' } },
    ] }, async () => ({ kind: 'enter', messages: [] })) as any
    expect(slash.messages[0]?.content[0]?.text).toContain('alfred_activate')
    expect(slash.messages[0]?.content[0]?.text).not.toContain('skill tool with name "alfred"')
  })

  it('identifies capability routing messages before they can be persisted', async () => {
    const listeners = new Map<string, (...args: any[]) => unknown>()
    apply({
      tools: { register: () => undefined, schemas: () => [] },
      skills: { register: () => undefined, list: async () => [] },
      on: (event: string, listener: (...args: any[]) => unknown) => listeners.set(event, listener),
    } as never, { alfredRoot: process.cwd() })

    const preStep = listeners.get('agent/pre-step')
    expect(preStep).toBeDefined()
    const result = await preStep!(
      {
        agent: { id: 'agent-1', session: { id: 'session-1', header: { agentPreset: 'standard', cwd: process.cwd() } } },
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

  it('authorizes a matched domain, mounts it into only the current Agent, and avoids repeat activation hints', async () => {
    const project = mkdtempSync(path.join(os.tmpdir(), 'alfred-lazy-domain-'))
    try {
      mkdirSync(path.join(project, '.git'))
      mkdirSync(path.join(project, '.agents'))
      writeFileSync(path.join(project, '.agents', 'alfred.json'), JSON.stringify({ schemaVersion: '1.0', enabled: true }))
      const tools: any[] = []
      const listeners = new Map<string, (...args: any[]) => unknown>()
      const finPlugin = { name: 'fin-fixture', apply: () => undefined }
      const mounts: Array<{ plugin: unknown; config: unknown }> = []
      let disposed = 0
      apply({
        baseUrl: 'file:///profile/',
        tools: { register: (tool: unknown) => tools.push(tool), schemas: () => [] },
        skills: { register: () => undefined, list: async () => [] },
        loader: { internal: { import: async (name: string) => { expect(name).toBe('dsh-fin-value'); return finPlugin } } },
        on: (event: string, listener: (...args: any[]) => unknown) => listeners.set(event, listener),
      } as never, { alfredRoot: process.cwd(), finValue: { timeoutMs: 12345 } })
      const fiber = Object.assign(Promise.resolve(undefined), { dispose: () => { disposed += 1 } })
      const agent = {
        id: 'agent-lazy',
        session: { id: 'session-lazy', header: { agentPreset: 'standard', cwd: project }, events: [{ type: 'turn/start', data: { turn: 1 } }] },
        ctx: { plugin: (plugin: unknown, config: unknown) => { mounts.push({ plugin, config }); return fiber } },
      }
      const messages = [{ id: 'u1', role: 'user', content: [{ type: 'text', text: '查询腾讯港股行情' }], source: { kind: 'user' } }]
      const first = await listeners.get('agent/pre-step')!({ agent, messages }, async () => ({ kind: 'enter', messages: [] })) as any
      expect(first.messages[0]?.content[0]?.text).toContain('alfred_activate')
      const activate = tools.find(tool => tool.name === 'alfred_activate')
      await expect(activate.execute({ domainId: 'fin-value' }, { agent, signal: new AbortController().signal }))
        .resolves.toContain('"status":"active"')
      expect(mounts).toEqual([{ plugin: finPlugin, config: { timeoutMs: 12345 } }])
      const second = await listeners.get('agent/pre-step')!({ agent, messages }, async () => ({ kind: 'enter', messages: [] })) as any
      expect(JSON.stringify(second.messages)).not.toContain('alfred_activate')
      await listeners.get('agent/disposed')!({ agent })
      await Promise.resolve()
      expect(disposed).toBe(1)
    } finally {
      rmSync(project, { recursive: true, force: true })
    }
  })
})
