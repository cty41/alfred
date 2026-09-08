import fs from 'node:fs'
import path from 'node:path'

export interface CapabilityRoute {
  id: string
  module: string
  summary: string
  keywords: string[]
  skills: string[]
  tools: string[]
  mutation: 'read-only' | 'confirm-before-write' | 'workflow-dependent'
}

export const ROUTES: readonly CapabilityRoute[] = [
  { id: 'life-knowledge', module: 'knowledge-base-kit', summary: '保存、整理、迁移或归档持续性的个人知识', keywords: ['保存这段对话', '整理这段对话', '归档', '个人知识库', '知识库健康', 'remember this', 'save this conversation'], skills: ['life-knowledge'], tools: [], mutation: 'workflow-dependent' },
  { id: 'project-knowledge', module: 'skills', summary: '查询、摄取和维护项目知识索引', keywords: ['知识索引', '项目知识', '维护知识', 'okf', 'knowledge index'], skills: ['knowledge-maintenance'], tools: [], mutation: 'workflow-dependent' },
  { id: 'development-design', module: 'skills', summary: '把模糊需求收束为设计和可执行开发计划', keywords: ['头脑风暴', '需求不清楚', '开发计划', '任务拆分', '设计方案', 'implementation plan'], skills: ['brainstorming', 'make-dev-plan', 'plan-mode-plan-writer'], tools: [], mutation: 'workflow-dependent' },
  { id: 'manual-qa', module: 'skills', summary: '维护 UI、交互和体验类人工验收记录', keywords: ['人工验收', '手动测试', '视觉验收', 'manual qa'], skills: ['manual-qa-handoff'], tools: [], mutation: 'workflow-dependent' },
  { id: 'project-documentation', module: 'skills', summary: '组织设计文档、计划和项目说明', keywords: ['整理文档', '移动文档', '设计文档', '项目文档'], skills: ['project-doc-organization'], tools: [], mutation: 'workflow-dependent' },
  { id: 'skill-authoring', module: 'skills', summary: '创建或维护渐进披露的 Agent Skill', keywords: ['创建 skill', '编写 skill', '修改 skill', 'agent skill'], skills: ['skill-writing'], tools: [], mutation: 'workflow-dependent' },
  { id: 'hk-equity-research', module: 'fin-value', summary: '查询港股行情、估值和财务报表并进行价值研究', keywords: ['港股', '估值', '财报', '腾讯', '阿里巴巴', '小米股票', 'hkex'], skills: ['fin-value-investment-research'], tools: ['fin_value_stock_quote', 'fin_value_stock_fundamentals', 'fin_value_financial_statements', 'fin_value_value_strategy'], mutation: 'read-only' },
  { id: 'investment-portfolio', module: 'fin-value', summary: '读取本地投资持仓和策略上下文', keywords: ['我的持仓', '仓位', '组合风险', '减仓条件', 'portfolio'], skills: ['fin-value-investment-research'], tools: ['fin_value_portfolio_context'], mutation: 'read-only' },
  { id: 'investment-strategy-write', module: 'fin-value', summary: '仅在直接用户明确要求保存时写入版本化建仓、减仓或清仓策略；能力提示和研究建议不授权写入', keywords: ['记录策略', '保存策略', '批准策略', '落地策略', '加仓计划', '建仓计划', '减仓计划', '清仓计划', '目标仓位', '调整策略'], skills: ['fin-value-investment-research'], tools: ['fin_value_save_portfolio_strategy'], mutation: 'workflow-dependent' },
  { id: 'investment-ledger', module: 'fin-value', summary: '在预览和后续明确确认后登记已真实发生的成交', keywords: ['已经成交', '登记成交', '初始持仓', '成交记录'], skills: ['fin-value-investment-research'], tools: ['fin_value_prepare_execution', 'fin_value_commit_execution', 'fin_value_prepare_initial_position', 'fin_value_commit_initial_position'], mutation: 'confirm-before-write' },
]

export function loadRoutes(alfredRoot: string): readonly CapabilityRoute[] {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(alfredRoot, 'alfred.tools.json'), 'utf8')) as any
    const fallbackById = new Map(ROUTES.map(route => [route.id, route]))
    return (Array.isArray(manifest.capabilities) ? manifest.capabilities : []).flatMap((row: any) => {
      const fallback = fallbackById.get(String(row?.id))
      if (!fallback || typeof row?.summary !== 'string' || row.summary.length > 160 || /[\r\n\0]/u.test(row.summary)) return []
      const keywords = Array.isArray(row.keywords) ? row.keywords.filter((value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 40 && !/[\r\n\0]/u.test(value)).slice(0, 16) : []
      return [{ ...fallback, summary: row.summary, keywords }]
    })
  } catch { return ROUTES }
}

const ALF_FORMS = /(^|[\s,，。!！?？:：@])(?:alf|alfred|阿尔弗雷德)(?=$|[\s,，。!！?？:：])/iu
const CAPABILITY_QUESTIONS = ['你有哪些能力', '有什么特殊能力', '查看能力状态', '能力清单', 'capabilities']

export function isCapabilityQuestion(text: string): boolean {
  const normalized = text.normalize('NFKC').trim()
  const lowered = normalized.toLowerCase()
  return CAPABILITY_QUESTIONS.some(value => lowered.includes(value)) || (ALF_FORMS.test(normalized) && /(?:能力|会什么|能做什么|capabilit)/iu.test(normalized))
}

const STRATEGY_WRITE_INTENT = ['保存', '记录', '批准', '落地', '写入', 'save', 'record', 'approve', 'persist', 'enact']
const STRATEGY_SUBJECT = ['策略', '计划', '仓位', 'strategy', 'plan', 'position']

function isExplicitStrategyWriteRequest(normalized: string): boolean {
  return STRATEGY_WRITE_INTENT.some(term => normalized.includes(term)) && STRATEGY_SUBJECT.some(term => normalized.includes(term))
}

export function matchRoutes(text: string, routes: readonly CapabilityRoute[] = ROUTES, limit = 2): CapabilityRoute[] {
  const normalized = text.normalize('NFKC').toLowerCase()
  return routes
    .map((route, index) => ({ route, index, score: route.keywords.reduce((score, keyword) => score + (normalized.includes(keyword.normalize('NFKC').toLowerCase()) ? keyword.length : 0), 0) }))
    .filter(row => row.score > 0 && (row.route.id !== 'investment-strategy-write' || isExplicitStrategyWriteRequest(normalized)))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(row => row.route)
}
