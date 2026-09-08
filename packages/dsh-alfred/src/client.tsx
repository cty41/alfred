import type { Context } from '@deepseek-ai/cordis'
import React, { useEffect, useState } from 'react'

const QUERY = 'ALF，请检查当前会话可用的增强能力，并区分已安装、已配置和当前模式可见性。'
const EXAMPLES = ['帮我保存并整理这段对话', '为这个需求制订开发计划', '分析腾讯现在是否值得建仓', '更新这个项目的人工验收记录']
const SHOW_EVENT = 'dsh-alfred:show-capabilities'

export function isAlfAvailablePreset(preset: unknown): boolean {
  return typeof preset === 'string' && preset !== 'minimal'
}

export function presetFromSummary(summary: any): unknown {
  return summary?.projectionValues?.agentPreset ?? summary?.agentPreset
}

function CapabilityCard(props: any) {
  const summary = props.useSessions((state: any) => state.byId[String(props.sessionId)])
  const storageKey = `dsh-alfred-capabilities:${String(props.sessionId)}`
  const [hidden, setHidden] = useState(() => globalThis.localStorage?.getItem(storageKey) === 'hidden')
  const [forced, setForced] = useState(false)
  useEffect(() => {
    const show = () => { setHidden(false); setForced(true) }
    globalThis.addEventListener?.(SHOW_EVENT, show)
    return () => globalThis.removeEventListener?.(SHOW_EVENT, show)
  }, [])
  if (!isAlfAvailablePreset(presetFromSummary(summary)) || (!summary.blank && !forced) || hidden) return null
  return <section style={cardStyle} aria-label="ALF 能力查询入口">
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <div><strong>ALF 能力</strong><div style={mutedStyle}>Alfred 会在相关请求中主动使用已接入能力。这里是状态查询入口，不是实时健康监控。</div></div>
      <button type="button" style={buttonStyle} onClick={() => { globalThis.localStorage?.setItem(storageKey, 'hidden'); setForced(false); setHidden(true) }}>隐藏卡片</button>
    </div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
      <button type="button" style={primaryStyle} onClick={() => props.inputActions.setDraft(QUERY)}>检查当前状态</button>
      {EXAMPLES.map(example => <button type="button" key={example} style={buttonStyle} onClick={() => props.inputActions.setDraft(example)}>{example}</button>)}
    </div>
  </section>
}

function CapabilityButton(props: any) {
  const summary = props.useSessions((state: any) => state.byId[String(props.sessionId)])
  if (!isAlfAvailablePreset(presetFromSummary(summary))) return null
  return <button type="button" style={buttonStyle} aria-label="打开 ALF 能力入口" onClick={() => globalThis.dispatchEvent?.(new Event(SHOW_EVENT))}>ALF</button>
}

export const inject = ['slots']
export function apply(ctx: Context): void {
  const slots = (ctx as Context & { slots: { inject(name: string, create: () => unknown): unknown; register(options: unknown, component: unknown): unknown } }).slots
  slots.inject('conversation.input.dock', () => slots.register({ name: 'conversation.input.dock', id: 'alf-capabilities', order: -20 }, CapabilityCard))
  slots.inject('conversation.input.right', () => slots.register({ name: 'conversation.input.right', id: 'alf-capabilities-button', order: 90 }, CapabilityButton))
}

const cardStyle: React.CSSProperties = { boxSizing: 'border-box', width: 'min(800px, calc(100% - 32px))', margin: '0 auto 8px', padding: 16, color: 'var(--dsw-alias-label-primary)', background: 'var(--dsw-specific-tip)', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 12 }
const mutedStyle: React.CSSProperties = { marginTop: 4, color: 'var(--dsw-alias-label-secondary)', fontSize: 13, lineHeight: 1.5 }
const buttonStyle: React.CSSProperties = { color: 'var(--dsw-alias-label-primary)', background: 'transparent', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }
const primaryStyle: React.CSSProperties = { ...buttonStyle, background: 'var(--dsw-alias-fill-primary)', fontWeight: 600 }
