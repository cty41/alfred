export interface AlfredInvocation {
  explicit: boolean
  slash: boolean
  name?: 'alf' | 'alfred'
  task: string
}

const PREFIX = /^\s*(\/)?(alfred|alf)(?=$|[\s,，。.!！?？:：;；、])(?:[\s,，。.!！?？:：;；、]*)/iu

/** Recognize only a direct invocation at the start of the user's text. */
export function parseAlfredInvocation(text: string): AlfredInvocation {
  const normalized = text.normalize('NFKC')
  const match = PREFIX.exec(normalized)
  if (!match) return { explicit: false, slash: false, task: normalized.trim() }
  return {
    explicit: true,
    slash: match[1] === '/',
    name: match[2]?.toLowerCase() === 'alfred' ? 'alfred' : 'alf',
    task: normalized.slice(match[0].length).trim(),
  }
}
