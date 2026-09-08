import { describe, expect, it } from 'vitest'
import { isCapabilityQuestion, matchRoutes } from '../src/catalog.js'
import { directUserText, isTopLevelHumanAgent, routeForTurn, routingInstruction } from '../src/routing.js'

const human = (text: string) => ({ role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text }] })

describe('ALF capability routing', () => {
  it('matches ALF as a token but not inside another word', () => {
    expect(isCapabilityQuestion('alf 你会什么')).toBe(true)
    expect(isCapabilityQuestion('@ALF，请检查能力')).toBe(true)
    expect(isCapabilityQuestion('ALF，分析腾讯')).toBe(false)
    expect(isCapabilityQuestion('half life')).toBe(false)
  })

  it('selects at most two narrow routes', () => {
    const matched = matchRoutes('查看我的持仓和组合风险，并整理文档和开发计划')
    expect(matched).toHaveLength(2)
    expect(matched[0]?.id).toBe('investment-portfolio')
  })

  it('routes concrete strategy persistence to Fin Value instead of general knowledge storage', () => {
    const matched = matchRoutes('把中海的加仓计划和目标仓位记录下来')
    expect(matched[0]?.id).toBe('investment-strategy-write')
    expect(matched[0]?.mutation).toBe('workflow-dependent')
    expect(matched[0]?.tools).toEqual(['fin_value_save_portfolio_strategy'])
  })

  it('does not treat research or capability wording as strategy-write authorization', () => {
    expect(matchRoutes('分析中海当前估值').some(route => route.id === 'investment-strategy-write')).toBe(false)
    expect(matchRoutes('给我一个中海加仓计划和目标仓位').some(route => route.id === 'investment-strategy-write')).toBe(false)
    expect(matchRoutes('ALF 有哪些能力').some(route => route.id === 'investment-strategy-write')).toBe(false)
  })

  it('reads only the latest direct user turn', () => {
    expect(directUserText([human('ALF 有哪些能力'), { source: { kind: 'plugin' }, content: [{ type: 'text', text: '已经成交' }] }, human('继续当前工作')])).toBe('继续当前工作')
  })

  it('prompts a capability once per session state', () => {
    const state = { prompted: new Set<string>(), suppressed: false }
    const first = routeForTurn('分析腾讯估值', state)
    const second = routeForTurn('继续分析腾讯估值', state)
    expect(first.routes.map(route => route.id)).toContain('hk-equity-research')
    expect(second.routes).toEqual([])
    expect(routingInstruction(first)).toContain('hk-equity-research')
  })

  it('honors explicit same-session suppression', () => {
    const state = { prompted: new Set<string>(), suppressed: false }
    routeForTurn('本会话不再提示能力', state)
    expect(state.suppressed).toBe(true)
    expect(routeForTurn('分析港股', state).routes).toEqual([])
  })

  it('excludes subagents from either session metadata source', () => {
    expect(isTopLevelHumanAgent({ session: { meta: { origin: 'subagent' } } })).toBe(false)
    expect(isTopLevelHumanAgent({ session: { header: { parentSession: 'parent' }, meta: {} } })).toBe(false)
    expect(isTopLevelHumanAgent({ session: { meta: {} } })).toBe(true)
  })
})
