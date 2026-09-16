export function capabilityActionability(localActionability: unknown, excluded: boolean, runtimeVisible: boolean): string {
  if (excluded) return 'not-in-current-mode'
  if (localActionability !== 'runtime-verification-required') {
    return typeof localActionability === 'string' ? localActionability : 'local-facts-unavailable'
  }
  return runtimeVisible ? 'ready' : 'setup-required'
}

export interface CapabilityRouteViewInput {
  id: string
  module: string
  summary: string
  skills: string[]
  tools: string[]
  commands?: string[]
  documents?: string[]
  mutation: string
}

export interface CapabilityActivationView {
  managedModules: ReadonlySet<string>
  installedModules: ReadonlySet<string>
  eligibleModules: ReadonlySet<string>
  activeModules: ReadonlySet<string>
  failedModules?: ReadonlyMap<string, string>
}

export interface CapabilityViewInput {
  routes: readonly CapabilityRouteViewInput[]
  localFacts: unknown
  visibleSkillNames: ReadonlySet<string>
  visibleToolNames: ReadonlySet<string>
  excluded: boolean
  modeName: string
  activation?: CapabilityActivationView
}

export function buildCapabilityView(input: CapabilityViewInput): unknown {
  const localRows = Array.isArray((input.localFacts as any)?.data?.capabilities)
    ? (input.localFacts as any).data.capabilities
    : []
  const localById = new Map(localRows.map((row: any) => [String(row.id), row]))
  const capabilities = input.routes.map(route => {
    const skillVisibility = route.skills.map(id => ({ id, visible: input.visibleSkillNames.has(id) }))
    const toolVisibility = route.tools.map(id => ({ id, visible: input.visibleToolNames.has(id) }))
    const hasExpected = [...skillVisibility, ...toolVisibility]
    const runtimeVisible = hasExpected.length > 0 && hasExpected.every(row => row.visible)
    const partiallyVisible = !runtimeVisible && hasExpected.some(row => row.visible)
    const local = localById.get(route.id) as any
    const activation = input.activation?.managedModules.has(route.module) === true ? input.activation : undefined
    const installed = activation?.installedModules.has(route.module)
    const eligible = activation?.eligibleModules.has(route.module)
    const active = activation?.activeModules.has(route.module)
    const activationError = activation?.failedModules?.get(route.module)
    return {
      id: route.id,
      module: route.module,
      summary: route.summary,
      declaration: 'declared',
      ...(activation === undefined ? {} : {
        installed: installed === true,
        eligible: eligible === true,
        active: active === true,
        activation: 'on-demand',
        ...(activationError === undefined ? {} : { activationError }),
      }),
      runtimeVisibility: input.excluded
        ? 'excluded-mode'
        : runtimeVisible
          ? 'visible'
          : partiallyVisible
            ? 'partial'
            : 'not-visible',
      entryPoints: {
        skills: skillVisibility,
        tools: toolVisibility,
        commands: route.commands ?? [],
        documents: route.documents ?? [],
      },
      mutationPolicy: route.mutation,
      actionability: capabilityActionability(local?.actionability, input.excluded, runtimeVisible),
    }
  })
  return {
    ok: true,
    product: 'Alfred',
    shortName: 'ALF',
    scope: { currentSession: true, preset: input.modeName || 'unknown' },
    capabilities,
    localFacts: input.localFacts,
    limitations: ['runtime visibility does not guarantee permission, network, upstream, or write approval success'],
    observedAt: new Date().toISOString(),
  }
}
