import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { apply } from '../src/index.js'

describe('dsh-alfred integration', () => {
  it('registers root-owned tools and direct-user lifecycle hooks', () => {
    const tools: string[] = []
    const events: string[] = []
    apply({
      tools: { register: (tool: { name: string }) => tools.push(tool.name), schemas: async () => [] },
      skills: { list: async () => [] },
      on: (event: string) => events.push(event),
    } as never, { alfredRoot: process.cwd() })
    expect(tools).toEqual(['alfred_capabilities', 'alfred_set_preferred_address'])
    expect(events).toEqual(['tools/change', 'skills/change', 'agent/session-start', 'agent/pre-step'])
  })

  it('ships a full Alfred agent-plane composition', () => {
    const preset = readFileSync(path.resolve('packages/dsh-alfred/presets/alfred/agent.cordis.yml'), 'utf8')
    for (const id of ['tool-pwsh', 'tool-fs', 'tool-jobs', 'tool-goal', 'plan-mode', 'compaction-basic', 'tool-subagent', 'tool-workflow', 'tool-ask-user', 'tool-todo', 'tool-web']) {
      expect(preset).toContain(`id: ${id}`)
    }
  })

  it('rejects preferred-address writes from subagents and excluded presets', async () => {
    const tools: any[] = []
    apply({
      tools: { register: (tool: unknown) => tools.push(tool), schemas: () => [] },
      skills: { list: async () => [] },
      on: () => undefined,
    } as never, { alfredRoot: process.cwd() })
    const address = tools.find(tool => tool.name === 'alfred_set_preferred_address')
    await expect(address.execute({ address: '先生' }, { agent: { session: { meta: { origin: 'subagent' } } } })).rejects.toThrow()
    await expect(address.execute({ address: '先生' }, { agent: { session: { projectionValues: { agentPreset: 'minimal' }, meta: {} } } })).rejects.toThrow()
  })

  it('identifies capability routing messages before they can be persisted', async () => {
    const listeners = new Map<string, (...args: any[]) => unknown>()
    apply({
      tools: { register: () => undefined, schemas: () => [] },
      skills: { list: async () => [] },
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
