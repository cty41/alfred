import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import * as control from './index.js'
import { resolveAlfredActivation } from './activation.js'

interface BootstrapConfig {
  home?: string
  finValue?: Record<string, unknown>
}

export const name = 'dsh-alfred-bootstrap'
export const inject = ['agents']
export const Config: z<BootstrapConfig> = z.object({
  home: z.string().default(''),
  finValue: z.any().default({}),
})

/** Register a per-Agent Alfred capability layer without selecting a preset. */
export function apply(ctx: Context, config: BootstrapConfig = {}): void {
  const runtime = ctx as Context & {
    agents: {
      registerSetupExtension(extension: {
        name: string
        setup(context: {
          agentCtx: Context
          cwd?: string
          preset?: string
          source: { kind: 'create' | 'resume' | 'fork' | 'spawn' }
        }): boolean | void | Promise<boolean | void>
      }): unknown
    }
    loader: {
      internal?: { import(name: string, baseUrl: string, options: Record<string, unknown>): unknown }
    }
  }
  const baseUrl = ctx.baseUrl ?? import.meta.url
  runtime.agents.registerSetupExtension({
    name: 'dsh-alfred',
    setup: async ({ agentCtx, cwd, preset, source }) => {
      if (preset === 'minimal' || preset === 'alfred') return false
      const inherited = source.kind === 'fork' || source.kind === 'spawn'
      if (!inherited && (!cwd || !resolveAlfredActivation(cwd, config.home || undefined).enabled)) return false
      const internal = runtime.loader.internal
      if (internal === undefined) throw new Error('dsh-alfred: DSH module loader is unavailable')
      const finValue = await internal.import('dsh-fin-value', baseUrl, {})
      const plug = agentCtx.plugin as unknown as (plugin: unknown, pluginConfig?: unknown) => PromiseLike<unknown>
      await plug(control, {})
      await plug(finValue, config.finValue ?? {})
      return true
    },
  })
}
