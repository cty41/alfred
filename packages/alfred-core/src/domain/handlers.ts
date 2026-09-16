import type { CapabilityRoute } from './catalog.js'
import type { HostSessionContext, HostVisibility } from '../host/types.js'
import { buildCapabilityView, type CapabilityActivationView } from './capability-view.js'

export interface ProbeSnapshotSource {
  snapshot(signal?: AbortSignal): Promise<unknown>
  invalidate(): void
}

export async function handleCapabilities(
  session: HostSessionContext,
  visibility: HostVisibility,
  routes: readonly CapabilityRoute[],
  probe: ProbeSnapshotSource,
  signal?: AbortSignal,
  activation?: CapabilityActivationView,
): Promise<string> {
  const [base, skills] = await Promise.all([
    probe.snapshot(signal),
    visibility.listVisibleSkills().catch(() => [] as Array<{ name: string }>),
  ])
  const view = buildCapabilityView({
    routes,
    localFacts: base,
    visibleSkillNames: new Set(skills.map(s => s.name)),
    visibleToolNames: new Set(visibility.listVisibleTools().map(t => t.name)),
    excluded: session.isExcludedMode,
    modeName: session.modeName,
    ...(activation === undefined ? {} : { activation }),
  })
  return JSON.stringify(view)
}
