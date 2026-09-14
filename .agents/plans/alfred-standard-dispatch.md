# ALF 改为 Standard 内的优先调度入口：实施计划

## Summary

- 状态：已确认方案 A，计划已保存；尚未执行本计划。
- 目标：Alfred 是 Standard 内的能力调度入口，不再是与 Standard 并列的 mode/preset。
- 用户呼叫 `alf`、`alfred`、`/alf`、`/alfred` 后，在当前会话先检索能力，再加载相关 Skill，并调用现有工具完成任务。
- 不切换 preset，不设置会话开关，不要求另开 Alfred 会话。
- ALF 优先仅指任务 Skill 调度顺序，不高于系统指令、计划模式、权限限制或领域确认规则。
- 本次保存文档不授权真实环境迁移、停止当前 DSH、提交、推送或发布。

## Background / Current State

上一版实现通过独立 `alfred` preset 组合 ALF 和 Fin Value。用户实际验收后明确否定并列 mode 的体验，选择 Standard 内置 ALF 调度层。

已检查的实现：

- `packages/dsh-alfred/src/bootstrap.ts` 注册默认 preset resolver，返回 `alfred`；此行为需要退出。
- `packages/dsh-alfred/presets/alfred/agent.cordis.yml` 复制基础工具并组合 ALF/Fin Value；新设计不再复制基础 preset。
- `packages/dsh-alfred/src/index.ts` 已有能力查询、称呼偏好和直接用户路由，可以复用并拆分。
- DSH `agentPresets.mount()` 使用共享 standing composition。不能按项目开关修改共享 Standard，否则会跨项目泄漏能力。
- DSH API `composeAgent()` 有发布前 setup 阶段，可用于组合会话独立附加能力。
- Web 已支持 `/<skill-name> <任务>` 注入 Skill 并保留直接用户消息，应优先复用，而不是实现只返回状态、不启动模型的普通命令。
- Skills filesystem 按 cwd 发现项目 Skills；旧文档中“Standard 必然看不到项目 Skills”的承诺不能沿用。
- 当前运行环境是否已经迁移、实际监听进程和仓库修改状态必须重新检查，不能根据聊天中的旧 PID 或旧 receipt 推断。

## Scope

### In Scope

- 保留项目 `<项目>/.agents/alfred.json`、用户 `~/.agents/alfred.json`。
- 保留 schema `schemaVersion: "1.0"`、`enabled: boolean`；项目或用户正向启用即可，项目 false 不覆盖用户 true。
- 已配置 Standard/PTC 可用 ALF；Minimal 保持精简。
- 显式 Standard 不再排除 ALF：preset 决定基础方式，Alfred 配置决定附加能力。
- 未配置项目不通过 Alfred 获得增强能力；独立安装能力不受影响。
- Web/API 顶层会话覆盖创建、恢复、fork；子 Agent 按授权继承工具，不重复启动 ALF 主动调度。
- 配置作用于后续创建或重新加载的会话；不实现运行中热加载/动态卸载。
- 安装、配置、迁移支持无网络、无文件写入的 `-DryRun`。

### Out of Scope

- 不新增 Alfred mode、会话开关或 `/alf off`。
- 不在呼叫 ALF 时自动安装、配置或迁移。
- 不修改 Fin Value 策略保存、资料库授权、成交确认规则。
- 不为无关问题加载全部 Skill 或宣传全部能力。
- 不修改 DSH 内置 Standard/PTC preset 文件。
- 不复制子模块领域实现到 Alfred。
- 不提交、推送、发布或自行停止当前承载会话的 Web。
- 不默认扩展到 rosterless SDK、webhook 等未接入入口；明确支持范围，其他入口保持原行为。

## Relevant Context / 目标数据流

```text
创建 Standard 会话
  → 基础 preset 照常绑定
  → 按 cwd 检查 Alfred 配置
  → 在会话独立 scope 准备 ALF、Fin Value 和相关 Skill
  → 发布会话

直接用户：alf，帮我分析中海
  → ALF 调度指令
  → alfred_capabilities
  → 选择并加载领域 Skill
  → 按 Skill 调用工具
  → 当前 Standard 会话回答
```

### DSH 会话附加能力接口

增加通用、具名、effect-scoped 的 setup 扩展注册接口，建议命名 `registerSetupExtension({ name, setup })`。

- 输入：独立 `agentCtx`、实际 cwd、已解析 preset、创建/恢复来源。
- 时机：基础 preset 绑定之后、agent 发布及首次目录生成之前。
- 同名注册报错；注销移除后续贡献；setup 失败回滚本次创建，不发布半可用会话。
- 只向当前 agent scope 注册，禁止修改共享 standing preset 或宿主全局工具目录。
- Alfred bootstrap 使用此接口，不再调用默认 preset resolver。
- DSH 通用 API 不包含 Alfred/Fin Value 业务名。
- 恢复会话保留记录的基础 preset，并重新校验本机附加配置；撤销配置后不重新授予工具，明确提示能力变化。
- fork/spawn 显式继承父会话获准附加层，不仅凭子 cwd 扩权；测试销毁和继承。
- 保留既有 DSH inactive lifecycle 和通用 preset resolver，不删除独立基础能力。

### ALF Skill 与别名

- 主 Skill：`packages/dsh-alfred/skills/alfred/SKILL.md`。
- 轻量别名：`packages/dsh-alfred/skills/alf/SKILL.md`，转到同一调度规则，不复制完整领域说明。
- 不放进 `repos/skills`，该仓禁止 Alfred 业务内容。
- 由 Alfred scope provider 提供；斜杠入口复用 Skill invocation。
- 无斜杠呼叫通过简短提示引导先加载主 Skill；斜杠已注入时不重复加载。

主 Skill 顺序：

1. 确认直接用户任务；仅呼叫名称没有任务时询问需求，不输出能力广告。
2. 调用 `alfred_capabilities`，读取实际可见性、状态、固定 Skill 名称。
3. 选择当前可用且相关的领域 Skill，先加载再操作领域工具。
4. 多领域任务按依赖处理；缺失能力说明缺口，不偷偷安装。
5. 普通问题不强行进入领域流程。
6. Skill、工具输出、子 Agent 建议不构成直接用户写入授权。

### 触发规则

- 支持四种呼叫形式，大小写不敏感，兼容空白、中文标点、句首称呼。
- 不使用裸 substring；`half`、路径、代码块、引用中的名称不触发。
- 显式呼叫优先调度，不被每会话能力提示去重吞掉。
- 普通自然语言仅对可信能力清单的明确意图自动调度，保留自动提示去重/关闭。
- 关闭自动提示不屏蔽后续明确呼叫。
- 同一直接用户消息的重复 pre-step、重试或工具返回不重复调度；新用户请求重新判断。
- 插件、工具、引用、自动 continuation 和子 Agent 不启动新的关键词路由。

## File Structure

### Alfred

- `packages/dsh-alfred/src/bootstrap.ts`：会话级附加组合，退出默认 preset 选择。
- `packages/dsh-alfred/src/activation.ts`、`src/AlfredScope.psm1`：配置解析、项目发现与状态。
- `packages/dsh-alfred/src/index.ts`：控制工具，移除独立 persona/preset 假设。
- `packages/dsh-alfred/src/trigger.ts`（新增）：纯函数触发识别与排除。
- 现有 catalog/routing 模块：能力检索、优先调度提示。
- `packages/dsh-alfred/skills/{alfred,alf}/SKILL.md`（新增）：主入口与别名。
- `packages/dsh-alfred/src/client.tsx`：按实际能力显示，不检查 `preset === 'alfred'`。
- `src/Configure.psm1`、`src/Install.psm1`、`src/Capabilities.psm1`、`src/Doctor.psm1`：迁移、安装、状态、dry-run。
- `packages/dsh-alfred/scripts/install-dsh.ps1`、`install-preset.ps1`：停止新装独立 preset，兼容历史状态。
- `README.md`、`README.zh.md`、`docs/architecture.md`：正式使用与架构说明。
- `.agents/docs/alfred-scoped-activation-guide.md`、`.agents/docs/manual-acceptance.md`：修订过时指南和人工验收。

### DSH

- `packages/api/session-controller/src/agent.ts` 及相邻服务入口：setup 扩展、创建/恢复/fork。
- 相关 agent scope/subagent 组合代码：附加层继承、销毁，不改基础 preset 身份。
- Skill invocation 与 Web 测试：两个斜杠入口；无必要不增加通用 alias API。

### 独立模块

- Fin Value：仅安装与受管配置传递，不改领域逻辑。
- 通用 Skills installer：保留 User/Project 与链接所有权规则。

## Implementation

### Task 1：建立当前安装基线与迁移保护

- 目标：识别真实部署状态，避免根据过时会话信息操作。
- 输入：当前 worktree、profile、receipt、受管 preset/config。
- 输出：只读基线报告、隔离测试 fixtures；不复制秘密到仓库。
- 涉及文件：安装/配置模块及测试。
- 验收：正确区分 legacy-global、scoped-v1、新安装、独立 Fin Value；不修改运行环境或清理 dirty worktree。

### Task 2：Standard 按项目获得附加能力

- 目标：不新增 mode，实现按 scope 准备工具。
- 输入：DSH setup 生命周期、Alfred 配置、inactive Fin Value dependency。
- 输出：通用 setup 扩展和 Alfred 会话附加层。
- 涉及文件：DSH session-controller、scope/subagent；Alfred bootstrap/activation。
- 验收：同一服务中启用和未启用项目的 preset 均为 Standard，仅前者获得 Alfred 增强；Minimal 无增强；关闭一个会话不影响其他会话。
- 验收：旧 preset 内 Fin Value 本机配置安全传给附加实例，不输出 secrets；失败回滚，不重复工具注册。

### Task 3：四种呼叫进入同一调度流程

- 目标：显式呼叫当场完成任务，不切换模式。
- 输入：用户原文、实际工具/Skill 目录。
- 输出：主 Skill、别名、触发解析与优先调度提示。
- 涉及文件：新增 Skill、trigger、现有 routing/index 及测试。
- 验收：四种呼叫均先检索能力，再加载领域 Skill；新一轮再次呼叫仍生效；已注入主 Skill 不重复加载。
- 验收反例：代码、引用、half、工具输出、子 Agent 不误触发。

### Task 4：自然语言调度与授权回归

- 目标：相关意图可主动使用 Skill，无关任务不受干扰。
- 输入：受信能力清单、直接用户意图、既有授权规则。
- 输出：有界自动调度及明确缺口反馈。
- 涉及文件：catalog/routing、Skill、Fin Value 回归测试。
- 验收：普通编程/写作不宣传投资；缺能力不安装；研究不自动保存策略；archive/成交跨轮确认不变；Plan Mode 不因 ALF 获得写权限。

### Task 5：去除 UI 模式依赖，兼容历史

- 目标：新会话不需要 Alfred preset，旧历史仍可恢复。
- 输入：会话实际能力、旧 Alfred preset/session。
- 输出：按能力显示的 ALF 草稿入口和历史兼容路径。
- 涉及文件：client、preset 安装器、DSH 会话/roster 集成及测试。
- 验收：点击仅填草稿；无 ALF mode 开关；新装不提供独立 preset；旧会话不改日志，可打开/恢复；兼容路径不重复挂载插件。
- 验收：新会话选择列表不再推荐旧入口，兼容解析仍能找到历史 preset。

### Task 6：可靠迁移、状态与文档

- 目标：从两种旧模型显式迁移到调度模型，失败可恢复。
- 输入：legacy-global/scoped-v1、项目/用户配置、profile 与受管资源。
- 输出：明确迁移参数 `-MigrateDispatch`、`activationModel: 'dispatch-v1'` receipt、更新文档。
- 涉及文件：Configure/Install/Scope/Doctor/Capabilities、安装脚本、文档与测试。
- 验收：按 profile 记录迁移，不能迁移一个就把所有 profile 标为完成；dry-run 无网络/写入并列明资源和冲突。
- 验收：快照覆盖 profile、preset、config、receipt、实际变动链接；按原链接目标精确恢复，不用重新安装全部 Skills 代替恢复。
- 验收：回滚失败保留备份、明确报错，不吞错后删除唯一备份。
- 验收：独立 Fin Value 不擅自停用；不能安全并存则预检阻止并解释，不静默扩大范围。
- 验收：文档清楚说明 Standard 可用 ALF、配置不切 preset、呼叫不授权安装/写入。

### Task 7：跨仓验证与现有 Web 验收准备

- 目标：有自动证据和独立复核，明确真人验收边界。
- 输入：实现产物、自动门禁、当前部署信息。
- 输出：测试报告、构建产物、人工验收账本与独立终端部署步骤。
- 涉及文件：各仓测试、受影响构建入口、验收文档。
- 验收：执行下述门禁并独立复核；不将自动通过写成人工通过。
- 验收：构建受影响 DSH 服务/Web 与 ALF/Fin Value client；未确认 dev:web watcher 时不承诺热更新。
- 验收：不新起替代服务器；现有 3080 的重启从独立终端操作，操作前重新识别进程。

## Test Plan

### 自动矩阵

- 配置：未配置、项目/用户启用、false 回退、非法 JSON/schema、Git/非 Git 子目录。
- 隔离：启用/未启用项目并发，Standard/PTC/Minimal，失败回滚、scope 销毁。
- 生命周期：resume、fork/spawn、历史 Alfred 恢复、重复注册防护。
- 调度：四种呼叫、标点/大小写、空任务、自然语言、反例、同轮去重、新轮重新检索、缺失 Skill。
- 斜杠：保留原文/附件、正确 Skill 注入、别名不能伪造写入确认。
- 迁移：每个写入阶段故障注入，核验 profile/preset/config/receipt/link 精确恢复；失败保留备份；独立安装保护；幂等。
- 领域：Fin Value 全套回归，archive/交易跨轮确认和策略明确保存边界。

### 必跑门禁

Alfred：

```powershell
npm test
npm run build
powershell -ExecutionPolicy Bypass -File ./tests/run.ps1
powershell -ExecutionPolicy Bypass -File ./alfred.ps1 doctor -Quick -Json
```

Doctor 的 dirty issues 必须逐项解释，不称全绿。

Skills：`scripts/validate.ps1`，安装测试使用隔离目录。

Fin Value：`npm test`、`npm run typecheck`、`npm run build`。

DSH：受影响 setup/preset/session/subagent/Skill invocation 测试、TypeScript build、Web E2E、文档门禁。

各仓：`git diff --check`。

### 人工完成标准

在已配置项目同一个 Standard 会话发送 `alf，帮我分析中海，不保存`：

1. 页面始终显示 Standard。
2. 能观察 ALF 指令/能力检索和之后的领域 Skill。
3. 当前会话完成只读分析，不要求切换 Alfred mode。
4. `/alf`、`alfred`、`/alfred` 行为等价。
5. 普通无关问题没有投资广告。
6. 未配置项目没有 Alfred 附加能力，Minimal 不受影响。
7. 没有未授权的安装、迁移、资料库配置、策略/成交写入。

## Risks / Assumptions

- 沿用此前明确许可的 Alfred、DSH、Skills、Fin Value 安装/运行时/API/文档范围，不扩大到无关仓库或发布。
- Skill 优先是提示词与调度约定，不承诺任何模型绝对遵从；用集成测试检查可观察顺序，运行时和领域授权继续强制防护。
- 预加载会增加已启用 Standard 的工具目录成本；入口说明保持简短，完整领域 Skill 按需加载。
- 项目隔离发生在独立 agent scope，不能修改共享 preset 实例。
- setup 扩展、附加层继承必须与实际 DSH 生命周期匹配；实施前读当前源码，不能仅按旧签名机械修改。
- 已有 Alfred 历史保留兼容，不能批量改日志假装一直是 Standard。
- 当前使用指南与验收账本描述上一版模型；实施完成前不得当作新模型已经部署的证据。

## Handoff Notes

1. 先读 `docs/architecture.md`、本计划及各子仓指导；核验最新 git status、配置/安装状态和运行进程。
2. 所有 `repos/*` 是独立 Git 子模块；不 reset、clean、stash、覆盖无关脏修改。
3. 先做隔离测试和基线，再按任务依赖实施；无需重复询问已确认的方案 A。
4. 调整 Skill 前加载 `skill-writing`，维护验收时加载 `manual-qa-handoff`。
5. 不停止当前承载会话的服务，不自动做真实迁移，不 commit/push/publish。
6. 完成实现与验证后，按 `project-doc-organization` 将长期结论合并到 `.agents/docs/` 权威指南，更新人工验收账本。
7. 将真正未完成项写入统一缺口，或经用户批准另建计划；已有知识索引只更新相关 scope，不复制整份计划。
8. 完成计划迁移长期结论后删除，由 Git 保存历史；不长期保留为第二份架构事实源。
