import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import * as control from './index.js'

interface BootstrapConfig {
  home?: string
  alfredRoot?: string
  probeTtlMs?: number
  probeTimeoutMs?: number
  excludedPresets?: string[]
  finValue?: Record<string, unknown>
}

export const name = 'dsh-alfred-bootstrap'
export const Config: z<BootstrapConfig> = z.object({
  home: z.string().default(''),
  alfredRoot: z.string().default(''),
  probeTtlMs: z.number().default(300_000),
  probeTimeoutMs: z.number().default(5_000),
  excludedPresets: z.array(z.string()).default(['minimal']),
  finValue: z.any().default({}),
})

/** Mount the lightweight ALF dispatcher globally; domain plugins remain Agent-scoped and lazy. */
export async function apply(ctx: Context, config: BootstrapConfig = {}): Promise<void> {
  await ctx.plugin(control, config)
}
