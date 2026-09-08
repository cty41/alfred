import { isCapabilityQuestion, matchRoutes, type CapabilityRoute } from './catalog.js'

export interface SessionRoutingState { prompted: Set<string>; suppressed: boolean }

export function directUserText(messages: readonly any[]): string {
  const message = [...messages].reverse().find(row => row?.source?.kind === 'user')
  if (!message) return ''
  return (Array.isArray(message.content) ? message.content : [])
    .filter((block: any) => block?.type === 'text' && typeof block.text === 'string')
    .map((block: any) => block.text)
    .join('\n')
}

export function isTopLevelHumanAgent(agent: any): boolean {
  const meta = { ...(agent?.session?.header ?? {}), ...(agent?.session?.meta ?? {}) }
  return meta.origin !== 'subagent' && !meta.parentSession
}

export function routeForTurn(text: string, state: SessionRoutingState, routes?: readonly CapabilityRoute[]): { capabilityQuestion: boolean; routes: CapabilityRoute[] } {
  if (state.suppressed || !text.trim()) return { capabilityQuestion: false, routes: [] }
  if (/本会话.*(?:不再|停止).*(?:能力.*提示|提示.*能力)|stop.*capability.*hint/iu.test(text)) {
    state.suppressed = true
    return { capabilityQuestion: false, routes: [] }
  }
  const capabilityQuestion = isCapabilityQuestion(text)
  const matched = matchRoutes(text, routes).filter(route => !state.prompted.has(route.id))
  matched.forEach(route => state.prompted.add(route.id))
  return { capabilityQuestion, routes: matched }
}

export function routingInstruction(result: { capabilityQuestion: boolean; routes: CapabilityRoute[] }): string | undefined {
  if (result.capabilityQuestion) return 'ALF capability discovery was explicitly requested. Call alfred_capabilities before answering and distinguish managed capabilities from generic model or DSH abilities.'
  if (result.routes.length === 0) return undefined
  const rows = result.routes.map(route => `- ${route.id}: ${route.summary}; skill=${route.skills.join(',') || 'none'}; tools=${route.tools.join(',') || 'none'}; mutation=${route.mutation}`)
  return `ALF matched these managed capabilities for this direct user request:\n${rows.join('\n')}\nProactively use an entry point only when it is visible in the current mode. Mention the capability briefly, then do the work. Never let a suggestion authorize setup, installation, migration, or a write.`
}
