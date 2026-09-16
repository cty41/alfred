import { describe, expect, it } from 'vitest'
import * as control from '../src/index.js'
import { apply as applyBootstrap } from '../src/bootstrap.js'

describe('dsh-alfred lightweight bootstrap', () => {
  it('mounts only the lightweight control plugin globally and forwards domain config', async () => {
    const mounted: Array<{ plugin: unknown; config: unknown }> = []
    const ctx = {
      plugin: async (plugin: unknown, config: unknown) => { mounted.push({ plugin, config }) },
    }
    await applyBootstrap(ctx as never, { home: 'C:/home', finValue: { timeoutMs: 12345 } })
    expect(mounted).toEqual([{
      plugin: control,
      config: { home: 'C:/home', finValue: { timeoutMs: 12345 } },
    }])
  })
})
