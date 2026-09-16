// Run explicitly with an official DSH checkout path; uses built packages and no user histories.
import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { apply } from '../dist/index.js'

const checkout = process.argv[2]
if (!checkout) throw new Error('usage: node packages/dsh-alfred/test/runtime-session-smoke.mjs <DshCheckout>')
const { Session, SessionId } = await import(pathToFileURL(path.resolve(checkout, 'packages/core/session/lib/index.js')).href)

const listeners = new Map()
apply({
  tools: { register: () => undefined, schemas: () => [] },
  skills: { register: () => undefined, list: async () => [] },
  on: (event, listener) => listeners.set(event, listener),
}, { alfredRoot: process.cwd() })
const session = Session.create(SessionId('alfred-writer-smoke'))
const before = JSON.stringify(session.events)
listeners.get('agent/session-start')({
  source: 'startup',
  agent: { id: 'smoke-agent', session, inject: () => undefined },
})
assert.equal(JSON.stringify(session.events), before, 'lightweight ALF bootstrap must not append availability events')
assert.deepEqual(session.deriveMessages(), [])
console.log('built ALF + official DSH Session smoke passed (no custom session events written)')
