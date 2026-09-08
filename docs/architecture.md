# Architecture

Alfred（ALF）是 umbrella control plane，不是 monorepo。根仓用 Git gitlinks 固定三个独立仓库；`alfred.tools.json` 是模块与 operation-level capabilities 的受信任声明源。

```text
alfred.ps1
  -> validated manifest + fixed allowlisted dispatch
  -> knowledge-base-kit (vault control)
  -> skills (user-level progressive disclosure)
  -> fin-value (DSH investment domain)

packages/dsh-alfred
  -> ALF persona + preferred-address control
  -> alfred_capabilities
  -> intent-based proactive routing
  -> expandable Web capability query entry
```

## Fixed lifecycle

- `bootstrap`: 初始化当前 gitlinks 指向的全部子模块，并构建 ALF 与 Fin Value。
- `sync`: 只对齐当前根仓 gitlinks；不访问 remote HEAD。
- `install`: 默认安装 Skills、`dsh-fin-value` 和 `dsh-alfred` 到所选完整 profiles；组件失败独立报告，可幂等重跑。
- `doctor`: 只读环境和 checkout 健康。
- `capabilities`: 只读能力事实。
- `update-locks`: 维护者显式逐个更新三个受管顶层gitlink；不递归推进子仓自行拥有的nested gitlinks，任何失败都回退本轮已更新checkout，dirty子模块直接拒绝。

所有 mutating commands 的 `-DryRun` 只返回计划和 blocker，不执行网络或文件写入。子模块不得被 reset、clean、stash 或隐式切换远端版本。

## Capability model

每项能力分别报告：

- declaration
- source presence / pinned state / dirty state
- build state
- installation receipt state
- DSH runtime visibility
- configuration
- health
- freshness
- mutation policy
- derived actionability

CLI probe 不伪装成 runtime verification，也不执行子模块代码；DSH bundle 会额外通过 `ctx.tools.schemas(agent)` 和 `ctx.skills.list({ cwd, scope })` 合并实际可见性。根 manifest 只包含短摘要、关键词和固定allowlist entry points；它不包含任意命令文本，也不接受子模块返回的自由文本作为提示词。

## Proactive routing

`dsh-alfred` 仅处理顶层 `source.kind === 'user'` 的直接用户输入，并排除 subagent、tool/plugin 注入及自动 continuation。匹配对 `ALF` 使用 token boundary，不做裸 substring；每轮最多两项，同一 capability 在一个 session 中只提示一次。会话 resume/compact 保留去重状态，新 session 清空。用户可在当前 session 禁用提示。

路由仅建议相关 Skill/tool 或调用 `alfred_capabilities`；建议本身不授权安装、迁移、账本写入或其他 mutation。`minimal` 不安装 ALF 控制层，完整 presets 全局可用，不依赖工作区路径。

## Ownership boundaries

- **Alfred/ALF**：persona、能力目录、主动路由、Web 入口、称呼偏好。
- **knowledge-base-kit**：通用 vault 控制和非递归 capability status；不依赖 Alfred。
- **skills**：通用用户 Skills；不放 Alfred 项目内容。
- **Fin Value**：港股数据、估值、持仓、版本化建仓/减仓/清仓策略及确认式ledger write；策略仅在直接用户明确要求保存完整方案时一次性原子写入，具体股票的实时策略只能以Fin Value私有数据库为权威来源，不拥有Alfred persona/help/routing。
- **LifeKnowledge**：可保存非权威投资理由和长期方法论，但不维护具体股票目标仓位、触发线或执行进度的第二事实源。

Fin Value 运行时是 breaking rename：bundle `dsh-fin-value`、Skill `fin-value-investment-research`、tools `fin_value_*`，无旧 plugin/tool aliases。策略只公开`fin_value_save_portfolio_strategy`，能力提示、研究建议、预览或迁移提示不授权写入；真实成交和初始持仓的prepare/commit仍保持跨轮明确确认、token绑定/过期/单次使用和SQLite原子事务边界。

## Persistence and migration

- ALF 称呼偏好：Windows application data、macOS `~/Library/Application Support/alfred`、Linux XDG 路径；不触碰投资账本。
- Fin Value ledger：对应平台的 `fin-value/fin-value.db`；市场 cache 与 ledger 分离。
- Fin Value私有快照：snapshot/report路径由Fin Value安装器的显式本机参数配置；Alfred umbrella不读取vault配置或自动推导私人路径。活跃SQLite仍留在本地，云端只接收校验完成的封闭副本和非权威HTML阅读报告。
- receipts：仅记录 checkout commit、gitlinks、profiles 和安装时间，不保存 path/token/profile 内容。

旧本地状态迁移要求停止相关 profiles，拒绝覆盖目标；Fin Value只迁移投资账本，先checkpoint，再用SQLite `VACUUM INTO`复制并执行integrity check。市场缓存重建，报告原地保留；称呼偏好由Alfred/ALF独立拥有，不由Fin Value迁移。secrets只在本机profile patch内保留且不输出，pending confirmation tokens失效。历史DSH sessions不重写，仍按历史tool name只读查看。

## Platform support

Windows 是当前真实验证平台。脚本同时实现 `pwsh`、POSIX/symlink 路径、macOS Application Support、venv `bin/python` 与 DSH profile 路径；macOS 由 Windows 上的参数化测试模拟，标记为 best-effort/unverified，不能宣称实机支持。

## Trust boundaries

- 模型文字是非受信任编排；只有注册工具能读受限状态或执行写入。
- public output 不包含私人 vault/data/path/token。
- GitHub remote rename、push、publish 和 metadata 更新均是独立外部操作，需要用户再次明确授权。
