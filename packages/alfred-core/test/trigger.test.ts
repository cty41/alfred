import { describe, expect, it } from 'vitest'
import { parseAlfredInvocation } from '../src/domain/trigger.js'

describe('Alfred explicit invocation', () => {
  it.each([
    ['alf，帮我分析中海', false, 'alf', '帮我分析中海'],
    ['Alfred: organize this', false, 'alfred', 'organize this'],
    ['/alf do it', true, 'alf', 'do it'],
    ['/alfred 帮忙', true, 'alfred', '帮忙'],
  ] as const)('recognizes %s', (text, slash, name, task) => {
    expect(parseAlfredInvocation(text)).toEqual({ explicit: true, slash, name, task })
  })

  it.each(['half price', '路径 /alf/file', '请引用“alf”', '```alf do it```', 'myalf task'])(
    'rejects non-invocation %s',
    (text) => expect(parseAlfredInvocation(text).explicit).toBe(false),
  )

  it('recognizes an empty invocation without inventing a task', () => {
    expect(parseAlfredInvocation('alf')).toEqual({ explicit: true, slash: false, name: 'alf', task: '' })
  })
})
