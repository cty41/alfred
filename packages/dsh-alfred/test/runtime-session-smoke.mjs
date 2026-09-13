// Run explicitly with the DSH checkout path; uses built packages, not user histories.
import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { apply } from '../dist/index.js'

const checkout = process.argv[2]
if (!checkout) throw new Error('usage: node packages/dsh-alfred/test/runtime-session-smoke.mjs <DshCheckout>')
const { Session, SessionId, KNOWN_SESSION_EVENT_TYPES } = await import(pathToFileURL(path.resolve(checkout, 'packages/core/session/lib/index.js')).href)
assert.equal(typeof Session.prototype.appendIgnorable, 'function', 'build DSH with appendIgnorable before this smoke')

for (const legacyGlobal of [false, true]) {
  const listeners = new Map()
  apply({
    tools: { register: () => undefined, schemas: () => [] },
    skills: { register: () => undefined, list: async () => [] },
    sessionProjections: { register: () => undefined, stateOf: () => false },
    on: (event, listener) => listeners.set(event, listener),
  }, { alfredRoot: process.cwd(), legacyGlobal })
  const session = Session.create(SessionId(`alfred-writer-smoke-${legacyGlobal}`))
  listeners.get('agent/session-start')({
    source: 'startup',
    agent: { id: 'smoke-agent', session, inject: () => undefined },
  })
  const event = session.events[0]
  assert.equal(event.type, legacyGlobal ? 'alfred/legacy-global' : 'alfred/available')
  assert.deepEqual(event.data, {})
  assert.equal(event.ignorable, true)
  assert.equal(KNOWN_SESSION_EVENT_TYPES.has(event.type), false, 'ALF events must remain external')
  const replay = Session.create(SessionId('replay'), JSON.parse(JSON.stringify(session.events)))
  assert.deepEqual(replay.events[0], event)
  assert.deepEqual(replay.deriveMessages(), [])
}
console.log('built ALF + DSH Session writer smoke passed (both event types; no history files written)')
