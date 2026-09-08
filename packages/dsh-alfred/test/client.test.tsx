import { describe, expect, it } from 'vitest'
import { apply, isAlfAvailablePreset, presetFromSummary } from '../src/client.js'

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

  it('keeps minimal excluded and full presets available', () => {
    expect(isAlfAvailablePreset('standard')).toBe(true)
    expect(isAlfAvailablePreset('ptc')).toBe(true)
    expect(isAlfAvailablePreset('alfred')).toBe(true)
    expect(isAlfAvailablePreset('minimal')).toBe(false)
  })
})
