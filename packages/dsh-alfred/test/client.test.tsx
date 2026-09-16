import { describe, expect, it } from 'vitest'
import { apply, isAlfAvailable, presetFromSummary } from '../src/client.js'

describe('ALF Web capability entry', () => {
  it('registers only official composer slots', () => {
    const rows: any[] = []
    const slots = { inject: (_name: string, factory: () => unknown) => factory(), register: (options: unknown, component: unknown) => rows.push({ options, component }) }
    apply({ slots } as never)
    expect(rows.map(row => row.options)).toEqual([
      { name: 'conversation.input.dock', id: 'alf-capabilities', order: -20 },
      { name: 'conversation.input.right', id: 'alf-capabilities-button', order: 90 },
    ])
  })

  it('reads the live preset projection before the legacy summary field', () => {
    expect(presetFromSummary({ projectionValues: { agentPreset: 'minimal' }, agentPreset: 'alfred' })).toBe('minimal')
  })

  it('shows the lightweight ALF entry in every non-minimal mode without a durable projection', () => {
    expect(isAlfAvailable('standard')).toBe(true)
    expect(isAlfAvailable('ptc')).toBe(true)
    expect(isAlfAvailable('alfred')).toBe(true)
    expect(isAlfAvailable('minimal')).toBe(false)
  })
})
