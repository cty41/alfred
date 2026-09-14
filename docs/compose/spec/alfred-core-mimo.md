---
feature: alfred-core-mimo
status: designed
updated: 2026-09-14
branch: main
commits: 
---

# Alfred Multi-Host Core（DSH + MiMo）

## Report

**Baseline refreshed (2026-09-14)** — 规格对齐当前 main（本地已含 Standard-dispatch、session repair、策略直接保存、研究归档路由；`packages/` 仍仅有 `dsh-alfred`）。本轮只更新计划，不实施 T1–T8。

- 相对 2026-09-10 初版：吸收 Standard 内调度（非并列 preset）、`fin_value_save_portfolio_strategy` 直存、研究归档路由文案、session repair 工具链、knowledge-base-kit `capability-status`。
- 命名冲突提醒：`.worktrees/mimo-gpt-oauth-plugin/packages/mimo-alfred` 是 **ChatGPT OAuth workaround**，与本规格的 ALF MiMo 适配包同名不同物；实施时 ALF 侧包名保持 `packages/mimo-alfred`，OAuth 插件不得占用该 workspace 名，或改名为 `mimo-gpt-oauth-plugin`。

## [S1] Problem

当前 ALF 控制面（`packages/dsh-alfred`）与 Fin Value DSH bundle（`repos/fin-value/packages/dsh-fin-value`）把 **host-agnostic 逻辑** 和 **DeepSeek Harness Cordis 适配** 写在同一包内：

- 控制面：能力目录、关键词路由、显式 `/alf` 触发、激活配置、称呼偏好（含 turn 授权）、`alfred.ps1` 能力探针、persona/路由指令文案。
- 领域：Fin Value 行情/估值/持仓/策略直存/确认式账本/资料库服务几乎不依赖 DSH，但工具注册、session/turn 提取、顶层用户判断仍散落在 `dsh-fin-value/src/index.ts`。

用户希望同一套底层也能服务 **MiMo Desktop / MiMo Code**（tools + hooks + skills），而不是复制一份领域实现。需要抽出共享核心与显式 host 接口，DSH 与 MiMo 只做薄适配。

### 相对初版的基线变化（必须纳入实现）

| 变化 | 对 multi-host 的影响 |
|------|----------------------|
| ALF 已是 **Standard 内调度入口**，不再是独立 preset | `isExcludedMode` 只排除 Minimal/plan 等；不能再假设 `agentPreset=alfred` |
| 策略改为 `fin_value_save_portfolio_strategy` 一次直存 | MiMo Fin Value 适配不再暴露策略 prepare/commit；成交/初始持仓仍 prepare→下一轮 commit |
| 研究归档路由已带只读 prepare 提示文案 | `routingInstruction` 必须原样进入 core，DSH/MiMo 共用 |
| 称呼保存绑定 **直接用户消息 turnId** + 授权表 | HostSessionContext 需可比较的单调 `turnNumber`，并另供稳定 message/turn id |
| session repair / preview 工具已存在 | 仍属 DSH 运行时维护，**不**进 MiMo 第一期 |
| knowledge-base-kit 新增 `capability-status` | 可选：作为知识域 runtime visibility 的只读旁路；不替代 ALF probe |

## [S2] Design

### 目标形态

```text
packages/alfred-core          host-agnostic ALF 控制面（纯逻辑 + 工具 handler）
packages/dsh-alfred           Cordis / setup-extension / pre-step / install（薄）
packages/mimo-alfred          MiMo tools + hooks + skills 安装与适配（薄）
repos/fin-value/.../core 等   领域服务保持不动
repos/fin-value/.../mimo-fin-value  MiMo 侧 Fin Value tools 适配（归属 fin-value 仓）
```

所有权不变：ALF 拥有 persona、调度、能力发现、称呼偏好；Fin Value 拥有港股领域与确认写入；knowledge-base-kit 保持通用、不硬编码 fin-value；umbrella 不吸收领域实现。

### HostSessionContext（宿主必须提供的会话事实）

```ts
export interface HostSessionContext {
  /** 确认令牌绑定的稳定会话 id */
  sessionId: string
  /** 本会话内可比较、单调的用户轮次；commit 必须 > prepare 的 turn */
  turnNumber: number
  /** 当前直接用户消息 id（称呼授权绑定用；MiMo 可用等价稳定 id） */
  turnId: string
  /** 用于日志与调试，不参与安全判断 */
  agentId: string
  /** 顶层直接用户会话；subagent/fork 非顶层则 false */
  isTopLevelHuman: boolean
  /** 排除模式（DSH minimal、MiMo plan 等写敏感模式） */
  isExcludedMode: boolean
  /** 激活解析用 cwd */
  cwd?: string
  /** preset 或 primary agent 名，仅展示与 actionability */
  modeName: string
}
```

契约：

- `turnNumber` 必须在同一 `sessionId` 内严格递增；写入类工具在 `commit` 时要求 `current.turnNumber > prepare.turnNumber`。
- `turnId` 在同一 turn 内稳定；称呼授权只接受与当前直接用户消息匹配的授权。
- `isTopLevelHuman === false` 或 `isExcludedMode === true` 时，禁止保存称呼偏好、资料库 commit、账本 prepare/commit。
- 策略 `save_portfolio_strategy` 只要求顶层直接用户明确请求，**不**走跨轮确认令牌（已在 fin-value 落地）。
- 宿主不得把 subagent 的 `sessionId` 映射为父会话 id，除非该宿主能保证确认语义仍安全。

### HostVisibility（运行时可见性）

```ts
export interface HostVisibility {
  listVisibleSkills(): Promise<Array<{ name: string }>>
  listVisibleTools(): Array<{ name: string }>
}
```

DSH：`ctx.skills.list` + `ctx.tools.schemas(agent)`。  
MiMo：skill 目录已安装名 + 当前已注册 tool id（hooks/工具侧可探测；不可用则返回空并降级为 `not-visible`）。  
（可选后续）knowledge 域可合并 `kb.ps1 capability-status -Json`；该接口刻意不含路径且 `runtimeEntryPoints=not-assessed`，不得假装已加载。

### ALF core 对外能力

从 `dsh-alfred` 迁出并稳定导出：

| 导出 | 职责 |
|------|------|
| `catalog` / `loadRoutes` / `matchRoutes` | 能力路由（含 research-archive、strategy-write 现行 keywords/tools） |
| `parseAlfredInvocation` / `routeForTurn` / `routingInstruction` | 显式调用与主动路由（含归档 prepare 指令） |
| `resolveAlfredActivation` | 项目/用户 `.agents/alfred.json` |
| `readPreferences` / `writePreferredAddress` | 称呼偏好（OS 路径不变） |
| `CapabilityProbe` | `alfred.ps1 capabilities -Quick -Json` |
| `buildPersonaInstruction` | 会话启动 persona 文案 |
| `buildCapabilityView` | 合并 probe + routes + HostVisibility |
| `handleCapabilities` | `alfred_capabilities` 纯 handler |
| `handleSetPreferredAddress` | 称呼偏好 handler（turnId + turn 授权） |

工具 handler 签名统一为：

```ts
type ToolHandler<A, R> = (args: A, session: HostSessionContext, signal?: AbortSignal) => Promise<R>
```

不依赖 Cordis `Context`、`defineTool` 或 `exec.agent` 形状。

### 激活与可见性语义（双宿主一致）

- 激活开关仍以 `<project>/.agents/alfred.json` 与 `~/.agents/alfred.json` 为准；MiMo 不另设第二套 enable 文件。
- 未激活时：MiMo 不注册 ALF tools/hooks；DSH 保持现有 per-Agent setup-extension 行为（不挂载）。
- Minimal / plan 等：由宿主映射为 `isExcludedMode`；core 只读该标志，不解析宿主 preset 名单。
- 能力提示、显式调用、安装动作均 **不** 授权 mutation；领域写入仍走 Fin Value 现行授权（策略直存需明确请求；账本 prepare → 下一轮 commit）。

### DSH 适配（`packages/dsh-alfred`）

保留：

- Cordis `apply`、`defineTool` 包装、`registerSetupExtension`
- `agent/session-start` persona 注入、`agent/pre-step` 路由注入
- `sessionProjections` / `appendIgnorable` / Web client / `install-dsh.ps1`
- session repair scripts（`scripts/*alfred-session-*`）

职责收窄为：把 `agent`/`messages` 映射为 `HostSessionContext` + `HostVisibility`，再调用 core handler。DSH 行为（含 fork/spawn 继承、legacy-global、repair）不变。

### MiMo 适配（`packages/mimo-alfred`）

采用用户选定的 **tools + hooks + skills** 形态：

| 能力 | 落点 | 说明 |
|------|------|------|
| `alfred_capabilities` | `.mimocode/tools/alfred_capabilities.ts` | 调 `buildCapabilityView` |
| `alfred_set_preferred_address` | `.mimocode/tools/alfred_set_preferred_address.ts` | 授权绑定当前 turnId |
| ALF dispatcher skill | 用户 skills 路径 `alfred/`、`alf/` | 与 DSH 共用 Markdown 源，安装时拷贝 |
| persona | hook `experimental.chat.system.transform` | 仅激活且非排除时 push persona 指令 |
| 意图路由 | hook `experimental.chat.messages.transform` 或 `session.userQuery.pre` | 取最后一条直接用户文本，`routeForTurn` 后注入指令 |
| 会话路由状态 | hook 模块内 `Map<sessionId, SessionRoutingState>` | prompted/suppressed；进程生命周期，不落盘 |
| Fin Value tools | fin-value 仓 `packages/mimo-fin-value` | 复用同一套 service；不放进 umbrella |

MiMo 会话映射约定（第一期）：

- `sessionId` ← ToolContext / hook `sessionID`
- `turnNumber` ← hook 模块内 per-session 计数器（每次直接用户查询 +1）
- `turnId` ← 当前直接用户消息 id；不可用则 `sessionID:turnNumber` 稳定合成
- `isTopLevelHuman` ← primary agent（`build`/`plan`/自定义 primary）为 true；`actor` 子代理为 false
- `isExcludedMode` ← `plan` 模式为 true（只读分析，禁止领域写与称呼保存）；`build`/`compose` 为 false
- `cwd` ← `ctx.directory`

已知能力缺口（接受，不阻塞第一期）：

- MiMo tools/hooks 默认偏 project 级；跨项目全局安装需 `skills.paths` / 逐项目安装，或后续用 MCP 全局进程。第一期安装器支持：项目 `.mimocode/` + 用户级 skills 目录。
- 无 DSH 式 `appendIgnorable` Web 投影；Desktop UI 不展示 `alfredAvailable`。
- pre-step 级指令注入弱于 DSH（无法保证与 DSH 完全相同的 message source 形状）；以“仅针对顶层直接用户文本、每轮最多两项、不授权写入”为安全下限。
- 不在 MiMo 做 session repair / offline event 修补。

### Fin Value host 接口

在 fin-value 侧抽出与 ALF 对称的最小接口（实现可仍在 `dsh-fin-value` 内，由 core/adapter 共用）：

```ts
export interface FinValueHostSession {
  sessionId: string
  turnNumber: number
  isTopLevelHuman: boolean
  isExcludedMode: boolean
}
```

- 账本/资料库 prepare/commit、策略以外的写路径只接受该结构，不再直接解析 Cordis `agent`。
- `fin_value_save_portfolio_strategy`：仅顶层直接用户明确保存请求；不读取排除模式以外的 preset 名单；不改变持仓现金。
- 确认令牌语义（session 绑定、TTL、单次、下一 turn）对账本与资料库保持不变。

### 安装与目录（设计约定）

- 源码：ALF 侧 `packages/alfred-core`、`packages/mimo-alfred`；Fin Value 侧 `packages/mimo-fin-value`（或同等命名，归属 fin-value 仓）。
- 根 `package.json` workspaces 从仅 `packages/dsh-alfred` 扩展为 `alfred-core` + `dsh-alfred` + `mimo-alfred`。
- Skill 源文件仍以 DSH bundle 内 Markdown 为权威，MiMo 安装器只拷贝，不改写语义。
- 配置：python/adapter/db/tushare 等 Fin Value 配置在 MiMo 侧通过环境变量或 `mimo` 项目配置注入，**不**写入 Alfred 仓 receipt。
- 所有 mutating 安装脚本保留 `-DryRun`。

### 错误与降级

- probe 失败 → capability view 仍返回 routes + runtime visibility，`localFacts` 标记 unavailable。
- 激活配置非法 → 拒绝启用并报错码，不静默关闭或半启用。
- 轮次/顶层判断失败 → 写路径拒绝；只读工具可继续。
- 私密路径/token 不进入 capability 输出或 public 文案。

## [S3] Out of Scope

- 本规格只设计，不实施代码迁移（T1 未开工）。
- 不改 Fin Value 领域算法、账本事务、资料库安全边界、策略直存语义。
- 不在 MiMo 复刻 DSH Web client、session projection、legacy preset、session repair。
- 不发布 npm 包、不改 GitHub 远端、不自动 push。
- 不做 macOS 实机验收。
- 不引入第二套激活配置格式。
- 不把 Fin Value 服务实现搬进 umbrella。
- 不把 knowledge-base-kit doctor 绑死 fin-value；跨应用快照校验留在领域侧。

## Tasks

- [ ] T1: 新建 `packages/alfred-core`，从 `dsh-alfred` 迁出 catalog/routing/trigger/activation/preferences/probe 与 capability view/handler — acceptance: alfred-core 可独立 typecheck；dsh-alfred 改为依赖 core 后现有测试通过；catalog 含 research-archive 与 `fin_value_save_portfolio_strategy` (covers: S2)
- [ ] T2: 定义并测试 `HostSessionContext` / `HostVisibility` / tool handler 签名 — acceptance: 纯单测覆盖顶层/排除/turn 单调/turnId 授权与非法配置 (covers: S2; depends: T1)
- [ ] T3: 重构 `dsh-alfred` 为薄适配，行为与 cordis 集成测试一致 — acceptance: `packages/dsh-alfred` 测试与 README 描述的 Standard-dispatch / dispatch-v1 语义不变；repair 脚本不受影响 (covers: S2; depends: T1, T2)
- [ ] T4: 在 fin-value 侧抽出 `FinValueHostSession` 并让 DSH tools 仅经该接口取 session/turn — acceptance: 账本 prepare/commit 与顶层/排除拒绝行为由测试证明；策略 save 仍为明确请求直存 (covers: S2)
- [ ] T5: 新建 `packages/mimo-alfred`：tools + hooks + skills 安装布局与 DryRun 安装器 — acceptance: 激活项目内可注册 `alfred_capabilities` 与路由 hook；未激活不注册；包名不与 OAuth 插件 worktree 冲突 (covers: S2)
- [ ] T6: 在 fin-value 侧新建 MiMo Fin Value tools 适配并复用领域服务 — acceptance: 只读 quote 可用；策略 save 仅明确请求；账本写仍要求 prepare→下一轮 commit (covers: S2; depends: T4)
- [ ] T7: 双宿主验收脚本/清单：DSH 回归 + MiMo 本机手动冒烟 — acceptance: 记录命令与结果；不把 manual Web 验收写成自动化 (covers: S2; depends: T3, T5, T6)
- [ ] T8: 更新 umbrella/fin-value 架构文档与安装说明（中英 README 如适用） — acceptance: ownership 边界与双宿主安装路径一致；注明 mimo-alfred ≠ OAuth 插件 (covers: S2; depends: T5, T6)
