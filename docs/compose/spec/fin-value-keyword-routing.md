---
feature: fin-value-keyword-routing
status: delivered
updated: 2026-09-14
branch: main
commits: 72fcee0 # local main
---

# Fin Value 关键词路由扩展

## Report

**What was built** — 扩展 ALF `investment-portfolio` 关键词，使「减仓/加仓/清仓/建仓/持仓/减持/止盈」及持仓名「金山云/中海/小米」的纯查询可路由到 `fin_value_portfolio_context`。`investment-strategy-write` 的 write-intent 守卫保持不变；research 关键词不加股票名，避免同分抢路由。`catalog.ts` fallback 与 `alfred.tools.json` 权威表同步。

**Verification** — `npx vitest run packages/dsh-alfred/test` → PASS 44/44。独立 review 确认 S2 验收表 6 条 AC 全满足，无 critical。

**Journey log**
- 「减仓计划」原在 strategy-write，但无 write intent 时被过滤，portfolio 又没有裸「减仓」→ 完全空转。
- 曾把股票名同步进 research，导致纯「金山云」与 portfolio 同分被更靠前 index 抢走；改为股票名仅放 portfolio。
- 曾把「目标仓位」放进 portfolio，与 strategy-write 同分导致写请求被 portfolio 抢先；从 portfolio 移除。
- `git worktree add` 在本会话被策略拦截，经用户确认后在 main 上直接实施。

## [S1] Problem

直接用户查询「金山云减仓计划 / 下一笔减仓什么条件」时，ALF `matchRoutes` 完全不命中任何 fin-value capability：

- `investment-portfolio` 仅有整词「减仓条件」「仓位」「我的持仓」等，口语「减仓」「减持」不命中。
- `investment-strategy-write` 虽有「减仓计划」，但 `isExplicitStrategyWriteRequest` 要求同时出现保存/记录/批准等 write intent，纯查询被正确过滤，导致 portfolio 也落空。
- 结果是路由空转，agent 只能走通用记忆/文件搜索，而权威源是本地 `fin_value_portfolio_context` / `alfred.db`。

## [S2] Design

在 **不改变匹配算法**（仍是 NFKC 小写精确子串 + 分数排序 + strategy-write 守卫）的前提下，只扩展关键词表：

### investment-portfolio

目标：覆盖股票动作查询（读/问进度），不误触发 strategy write。

最终 15 个关键词：

`我的持仓, 仓位, 组合风险, 减仓条件, portfolio, 减仓, 加仓, 清仓, 建仓, 持仓, 减持, 止盈, 金山云, 中海, 小米`

刻意 **不把「目标仓位」** 放进 portfolio：它同时是 strategy-write 关键词，放进去会让「把…目标仓位记录下来」因同分被 portfolio 抢先。

### hk-equity-research / investment-research-archive

**不改**。不把持仓股票名写入 research 关键词：否则纯股票名查询会因同分 + 更靠前的 index 被 research 抢走。研究词（估值/财报/港股）叠加后自然高于 portfolio 的股票名单命中。

### investment-strategy-write

**不改**。write-intent 守卫继续保证「记录/保存/批准 + 策略/计划/仓位」才路由写入口；裸「减仓计划」不会进入 write。

### 双写同步

权威源是运行时 `loadRoutes()` 读取的 `alfred.tools.json`；`catalog.ts` 的 `ROUTES` 是无 manifest 时的 fallback。两处 keywords 必须一致更新。`loadRoutes` 仍 `slice(0, 16)`。

### 预期匹配（验收样例）

| 用户文本 | 期望第 1 名 | 不得包含 strategy-write |
| --- | --- | --- |
| 金山云减仓计划，下一笔减仓什么条件执行 | investment-portfolio | 是 |
| 下一笔减仓应该什么条件 | investment-portfolio | 是 |
| 查看我的持仓和组合风险 | investment-portfolio | 是 |
| 分析金山云估值和财报 | hk-equity-research | 是 |
| 把减仓计划保存下来 | investment-strategy-write | 否（write intent 存在） |

## [S3] Out of Scope

- 不改 `matchRoutes` 算法、排序或 limit。
- 不改 strategy-write 守卫逻辑。
- 不新增 fin-value 工具或 DSH bundle。
- 不处理本会话（MiMo Desktop）是否加载了 fin_value MCP 工具——那是运行时装载问题，不是 catalog 关键词问题。

## Tasks

- [x] T1: 同步扩展 `packages/dsh-alfred/src/catalog.ts` 与 `alfred.tools.json` 的 keywords — acceptance: 上表 5 条样例由 `matchRoutes` 行为覆盖（covers: S2）
- [x] T2: 在 `packages/dsh-alfred/test/routing.test.ts` 增加回归用例 — acceptance: 新用例与既有 suite 全部通过（covers: S2; depends: T1）
