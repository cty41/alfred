# Architecture

Alfred（ALF）是 umbrella control plane，不是 monorepo。根仓设计为用 Git gitlinks 固定四个独立仓库；`alfred.tools.json` 是模块与 operation-level capabilities 的受信任声明源。第四个模块 MaLiang 是 source-only domain tool；在父仓加入并固定 gitlink 前，其 `source-not-present` 状态是预期事实。

```text
alfred.ps1
  -> validated manifest + fixed allowlisted dispatch
  -> knowledge-base-kit (vault control)
  -> skills (user-level progressive disclosure)
  -> fin-value (DSH investment domain)
  -> maliang (read-only game-art source discovery)

packages/dsh-alfred
  -> lightweight ALF dispatcher (`alfred_capabilities`, `alfred_activate`)
  -> intent-based on-demand domain loading
  -> per-Agent activation state and bounded parent-child inheritance
  -> Web capability query entry
```

## Fixed lifecycle

- `bootstrap`: 初始化当前 gitlinks 指向的全部子模块，并构建 ALF 与 Fin Value；MaLiang 仅同步固定源码，不安装包、不构建也不执行其代码。
- `sync`: 只对齐当前根仓 gitlinks；不访问 remote HEAD。
- `install`: 默认通过固定的官方 `@deepseek-ai/dsh@0.1.5-rc.2` launcher 安装轻量 ALF dispatcher、plain runtime dependency `dsh-fin-value`，以及仅供历史会话恢复的 hidden `alfred` compatibility preset；不新增可选 session mode。显式 `-DshCheckout` 仅用于开发或回滚。
- `configure`: 在项目 `.agents/alfred.json` 或用户 `~/.agents/alfred.json` 显式启停，在同一 scope 管理 Skills，并迁移到 `lazy-domain-v1`；旧 global/scoped 激活迁移需独立显式参数。
- `doctor`: 只读环境、checkout 和 scoped activation 健康。
- `capabilities`: 只读能力事实。
- `update-locks`: 维护者显式逐个更新四个受管顶层gitlink；不递归推进子仓自行拥有的nested gitlinks，任何失败都回退本轮已更新checkout，dirty子模块直接拒绝。
- `commit-modules`: 把 dirty 子模块以显式 `-Message` 提交到其当前分支，并只在根仓钉对应 gitlink；支持 `-DryRun`；不 push、不动其他根仓文件、不为清 dirty 而 reset/clean/stash。

所有 mutating commands 的 `-DryRun` 只返回计划和 blocker，不执行网络或文件写入。子模块不得被 reset、clean、stash 或隐式切换远端版本。

## Capability model

每项能力分别报告：

- declaration
- 对按需领域的 installed / eligible / active / failed 状态
- source presence / pinned state / dirty state
- build state
- installation receipt state
- DSH runtime visibility
- configuration
- health
- freshness
- mutation policy
- derived actionability

CLI probe 不伪装成 runtime verification，也不执行子模块代码；DSH bundle 会额外通过 `ctx.tools.schemas(agent)` 和 `ctx.skills.list({ cwd, scope })` 合并实际可见性。根 manifest 只包含短摘要、关键词和固定 allowlist entry points；它不接受子模块返回的自由文本作为提示词，也不把 manifest command 字段交给 shell。MaLiang 的固定 probe 只读取 pinned checkout 中的 `README.md`、`pyproject.toml` 和 `src/maliang_art/__init__.py`，核对项目/CLI 身份及版本一致性；`repos/maliang/README.md` 与 `maliang-art` 仅作为发现引用返回，ALF 不代为执行 CLI、安装 MaLiang 或修改资产。

## Standard dispatch and proactive routing

ALF 是 Standard/PTC 内的最高优先级能力调度入口，不是与 Standard 并列的 mode。直接用户可用 `/alf`、`/alfred`、`alf` 或 `alfred` 在消息开头显式调用；slash 形式复用 DSH Skill 注入，非 slash 形式注入 canonical `alfred` Skill 调度指令。两者都先调用 `alfred_capabilities` 核对当前 Agent 的真实能力，再只加载与任务相关的领域 Skill。`half`、路径、引用、代码、tool/plugin 输出、subagent 和自动 continuation 均不触发。显式调用即使关闭自动提示也始终有效。

普通主动路由只处理顶层 `source.kind === 'user'` 的直接用户输入；同一 capability 在一个 session 中只提示一次。新 session 清空内存状态；冷恢复后由下一次相关请求重新匹配，不把激活事实写入 session 日志。显式调用或建议都不授权安装、迁移、资料库配置、策略保存、账本写入或其他 mutation。

Profile 根层始终加载轻量 `dsh-alfred/bootstrap`，它只注册 ALF dispatcher、两项控制工具和两项入口 Skill。顶层直接请求命中领域且项目或用户 `.agents/alfred.json` 为 `enabled:true` 时，模型先调用 `alfred_activate`；adapter 通过当前 `agent.ctx.plugin(...)` 挂载已安装的领域 runtime，下一 model step 重新组装 schemas 后即可继续原请求。Minimal 永远排除。激活状态只存在于当前进程的当前 Agent；失败可显式重试，并发激活去重。子 Agent 只能激活其确切父 session 已 active 的领域，不能按自身 cwd 扩权；领域写工具仍独立要求顶层直接用户、轮次与确认 token。该实现只使用官方 DSH Agent-scoped Cordis context，不依赖 DSH core patch。

历史 `agentPreset: alfred` 会话继续通过 hidden compatibility preset 恢复，日志和 tool name 不重写；该 preset 不出现在普通 roster 或新会话选择器中。

## Ownership boundaries

- **Alfred/ALF**：当前 scope 能力目录、显式 dispatcher、主动路由、Web 入口和 per-Agent 按领域激活；不选择或替换基础 preset，也不实现或越权过滤领域能力。
- **knowledge-base-kit**：通用 vault 控制和非递归 capability status；不依赖 Alfred。
- **skills**：通用用户 Skills；不放 Alfred 项目内容。
- **Fin Value**：港股数据、估值、持仓、版本化建仓/减仓/清仓策略、确认式ledger write及小米云研究资料库；它拥有资料库检测、确认配置、只读查询和受限官方PDF新增，不拥有Alfred persona/help/routing。策略仅在直接用户明确要求保存完整方案时一次性原子写入，具体股票的实时策略只能以Fin Value私有数据库为权威来源。
- **MaLiang**：可审计游戏美术记录与 CLI 的独立 source-only domain tool，只声明 `verify` 与 `probe` operation。Alfred 只验证/探测固定源码并把用户引向 pinned README 和 CLI 名称；不自动安装、不执行工作流、不生成或修改资产。
- **LifeKnowledge**：可保存非权威投资理由和长期方法论，但不维护具体股票目标仓位、触发线或执行进度的第二事实源。

Fin Value 运行时是 breaking rename：bundle `dsh-fin-value`、Skill `fin-value-investment-research`、tools `fin_value_*`，无旧 plugin/tool aliases。策略只公开`fin_value_save_portfolio_strategy`，能力提示、研究建议、预览或迁移提示不授权写入；真实成交和初始持仓的prepare/commit仍保持跨轮明确确认、token绑定/过期/单次使用和SQLite原子事务边界。

## Persistence and migration

- ALF 激活配置：项目 `<project>/.agents/alfred.json` 或用户 `~/.agents/alfred.json`；只决定相关直接请求是否有资格激活已安装领域，不选择 preset。项目 `false` 不覆盖用户 `true`。
- ALF 领域激活事实：仅保存在当前进程内存中，不写 session event 或 receipt；冷恢复后下一次相关请求重新激活。
- Fin Value ledger：对应平台的 `fin-value/fin-value.db`；市场 cache 与 ledger 分离。
- Fin Value私有快照：snapshot/report路径由Fin Value安装器的显式本机参数配置；Alfred umbrella不读取vault配置或自动推导私人路径。活跃SQLite仍留在本地，云端只接收校验完成的封闭副本和非权威HTML阅读报告。
- Fin Value研究资料库：首次港股研究由ALF提示，Fin Value自动检测固定小米云候选；配置只在预览后的下一轮确认写入平台本机数据目录，立即生效。长期授权仅允许向确认根目录新增受信官方HTTPS PDF，不代表小米云同步成功，也不授权覆盖、删除或任意下载。
- receipts：仅记录 checkout commit、gitlinks、profiles 和安装时间，不保存 path/token/profile 内容。

旧的 profile-global、`scoped-v1` 与 `dispatch-v1` 安装通过 receipt、bundle lifecycle 和 compatibility preset metadata 识别。只有直接用户显式运行带 `-MigrateLegacy` 的 `configure` 且相关 profiles 已停止，才迁移为 `lazy-domain-v1`：Fin Value 作为不带 bundle patch 的 plain profile dependency 保留，受管 legacy override 被移除，原 profile/preset 中的 Fin Value 配置按 profile 原样嵌入 bootstrap 的 opaque `finValue` config，并写入项目或用户激活配置。配置发现和能力建议都不构成迁移授权。

迁移对 profile 控制文件、activation config、receipt 和 compatibility preset 做精确备份与失败回滚；不同 profile 的私有配置不互相折叠。secrets 只在本机配置中转移且不进入 receipt 或输出。Fin Value 的投资账本、研究资料库与 pending confirmation 授权语义保持独立；历史 DSH sessions 不重写，仍按历史 composition/tool name 查看或恢复。

迁移配置来源按 profile 独立选择：已有合法受管 dispatch 块原样保留（包括空 `finValue: {}`），不从旧配置补字段；没有该块时才使用受管旧 profile 配置，最后回退到历史 preset。重复调用保持已有块逐字节不变。所有选中 profile 先完成预检，再原子写入候选；重复/损坏标记、来源冲突或非受管 bootstrap 覆盖会拒绝，避免对其他 profile 产生部分写入。自动预检仅接受可明确识别的单行标量映射和空映射，复杂 YAML 结构拒绝自动迁移；不加载新解析器依赖，不打印配置值。最终仍需通过 `--dump-config` 验证后才能提交 receipt。

## Platform support

Windows 是当前真实验证平台。脚本同时实现 `pwsh`、POSIX/symlink 路径、macOS Application Support、venv `bin/python` 与 DSH profile 路径；macOS 由 Windows 上的参数化测试模拟，标记为 best-effort/unverified，不能宣称实机支持。

## Trust boundaries

- 模型文字是非受信任编排；只有注册工具能读受限状态或执行写入。
- public output 不包含私人 vault/data/path/token。
- GitHub remote rename、push、publish 和 metadata 更新均是独立外部操作，需要用户再次明确授权。
