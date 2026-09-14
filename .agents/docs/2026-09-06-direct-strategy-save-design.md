# Fin Value 策略直接保存设计

## 背景

当前结构化组合策略使用 `fin_value_prepare_portfolio_strategy` 与 `fin_value_commit_portfolio_strategy` 两步确认。令牌具有会话绑定、跨轮、过期和单次使用约束。该机制适合会改变持仓和现金的成交登记，但对本身不改变账本的策略批准造成不必要摩擦，并已出现用户明确确认时令牌连续过期的问题。

## 决策

组合策略改为一次性直接保存；真实成交和初始持仓仍维持现有跨轮确认。

### 新工具

新增并仅公开：

- `fin_value_save_portfolio_strategy`

工具接收完整 `PortfolioStrategyInput`，同步完成规范化、校验、版本竞争检查和原子写入，返回 applied 或 duplicate 结果以及最终版本。

### 删除的策略工具

从 DSH 注册表、路由能力与公开文档中移除：

- `fin_value_prepare_portfolio_strategy`
- `fin_value_commit_portfolio_strategy`

不得让将 prepare 改成隐式写入，也不保留多个含义重叠的策略写入入口。

## 授权边界

只有直接用户明确要求“保存、记录、批准、落地”一份具体策略时，Agent 才能调用 save 工具。以下情况不授权写入：

- ALF 或其他控制面能力建议；
- 研究结论、策略草案或模型主动推荐；
- 安装、迁移或工具可见性提示；
- 仅要求分析、比较或预览。

工具描述、投资 Skill 和 Alfred 路由必须使用一致措辞。路由只负责能力选择，不将提示视为授权。

## 数据流与原子性

1. 接收完整策略输入。
2. 使用现有 canonical normalizer 校验类型专属字段、日期、定点小数、阶段递增、gateMode、账户和长度上限。
3. 在 SQLite 事务内重新读取该证券的 approved 身份与最大历史版本。
4. 若规范内容与当前 approved 内容哈希相同，返回 `duplicate`，不创建版本。
5. 否则将当前 approved 标记为 `superseded`，以 `MAX(version)+1` 插入新 approved 策略。
6. 提交后返回证券、策略类型、版本和不变式声明。

一个证券仍只能有一个 approved 策略；数据库 partial unique index 和完整性检查保持不变。

## 账本隔离

策略直接保存不得：

- 修改 `positions`、`account_positions` 或 `cash_balances`；
- 插入 `ledger_entries`；
- 代表券商下单或真实成交；
- 自动更新策略执行进度。

`fin_value_prepare_execution` / `fin_value_commit_execution` 与初始持仓工具继续使用会话绑定、短期有效、单次使用且跨轮的确认令牌。

## 服务与接口调整

- `FinValuePortfolioStrategyService` 改为单一 `save(input, sessionId)` 方法。
- `PortfolioStore` 保留事务、版本、哈希和 schema 防错逻辑；将原先依赖 preview 的 expected state 改为在单次事务中直接计算和提交。
- 策略专用 `ConfirmationGate` 使用被移除；账本继续使用通用确认门。
- 工具参数 schema 继续复用现有结构化阶段字段。

## 错误处理

以下情况必须零写入失败：

- schema 缺失、未知或版本不受支持；
- 策略字段、阶段关系、账户或日期不合法；
- canonical 历史内容哈希或索引列不一致；
- 数据库事务、唯一索引或完整性检查失败。

失败不得回退到旧策略表，也不得部分 supersede 当前版本。

## 路由与文档

- Alfred 的 `investment-strategy-write` 能力改为单一 save 工具，并强调必须有直接用户写入意图。
- Fin Value Skill 删除“预览后下一轮确认”的策略说明，保留成交确认说明。
- 更新产品、架构、中文 README、英文 README 和包 README。
- 迁移脚本本身仍为独立数据库管理操作，继续 dry-run、备份、停服和显式确认，不因策略 save 改动而放宽。

## 测试与验收

自动测试至少覆盖：

1. 明确输入一次调用即创建 v1。
2. 相同内容重复保存返回 duplicate。
3. 修改内容创建 v2并 supersede v1。
4. 无 approved 但存在历史时从最大版本继续编号。
5. 非法输入、未知账户、损坏哈希、错误 schema 全部零写入失败。
6. 保存前后持仓、现金和成交账本完全不变。
7. DSH 仅注册 save，不再注册策略 prepare/commit。
8. Alfred 路由对明确保存请求选择 save；普通研究请求不获得写入授权。
9. 成交及初始持仓的跨轮、过期、重放和错会话测试继续通过。

人工验收只需确认重启后工具可见性与一次明确保存流程；不得用真实成交测试。

## 非目标

- 不取消真实成交或初始持仓确认。
- 不连接券商或自动下单。
- 不修改现有真实策略内容。
- 不自动修改 LifeKnowledge。
- 不改变安全迁移的停服、备份和 dry-run要求。
