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

  it('shows ALF from actual session availability instead of an Alfred mode', () => {
    expect(isAlfAvailable('standard')).toBe(false)
    expect(isAlfAvailable('standard', true)).toBe(true)
    expect(isAlfAvailable('ptc', true)).toBe(true)
    expect(isAlfAvailable('alfred', true)).toBe(true)
    expect(isAlfAvailable('minimal', true)).toBe(false)
  })
})
