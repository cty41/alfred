# dsh-alfred

Alfred（短称 ALF）的 DeepSeek Harness 控制面 bundle。它负责可信能力发现、显式 capability dispatch、当前 Agent 可见性、按意图主动路由、persona 偏好和 Web 状态入口；领域能力由各自模块拥有。

- Profile bundle 只加载 model-invisible `dsh-alfred/bootstrap`。
- Bootstrap 通过 `ctx.agents.registerSetupExtension` 在基础 Standard/PTC preset 挂载后、Agent 发布前解析项目/用户 `.agents/alfred.json`。
- 启用时，`dsh-alfred` 与 profile-inactive `dsh-fin-value` 只挂载到该 Agent 的隔离 scope；Minimal 排除，子 Agent 只继承父 Agent 已激活的扩展。
- `/alf`、`/alfred`、`alf`、`alfred` 都进入 canonical `alfred` Skill：先调用只读 `alfred_capabilities`，再加载相关领域 Skill。
- 自动提示只处理顶层直接用户输入；显式调用不受自动提示 suppression 影响。
- 配置、显式调用和能力提示均不授权安装、更新、迁移、资料库配置、策略/账本写入或其他 mutation。
- Web 入口依据 Session 的 `alfredAvailable` projection 显示，不依据 `agentPreset === alfred`。
- `alfred/available` 和 `alfred/legacy-global` 仅记录 Web 可见性；通过 DSH `Session.appendIgnorable()` 写入 envelope 的 `ignorable: true`，让未安装 ALF 的 reader 也能读取日志。需要支持该 API 的 DSH 构建；旧运行时会在写入前明确拒绝，不能回退到普通 `append()`。
- 更新 ALF 与 DSH 后须重启运行进程。已有缺少标记的历史事件不会被构建、重启或 `configure -MigrateLegacy` 自动修复；必须先只读预览，再单独确认备份与修复，不得放宽未知必需事件的读取校验。
- 在 Alfred 仓库根目录运行 `node scripts/preview-alfred-session-events.mjs --root "<DSH sessions 中的项目目录>"` 可只读检查历史标记。该脚本无修复模式，不输出消息内容；仅统计两类 ALF 标记、空对象候选及结构异常，并检测扫描时的文件变化。稳定的双次读取不是停服证明，也不保证其他事件均能恢复。
- 独立离线恢复入口为 `scripts/repair-alfred-session-events.ps1`，默认只读预演；仅在另行确认后，校验六个明确指定的会话、停服状态及私密备份，再补标记。完整操作与回滚限制见 [离线恢复指南](../../.agents/docs/alfred-session-recovery.md)。
- `presets/alfred` 是 `hidden: true` 的历史会话兼容 composition，不是新会话 mode。

构建 ALF 和 DSH 后，可在 Alfred 根目录运行 `node packages/dsh-alfred/test/runtime-session-smoke.mjs "<DshCheckout>"`，验证真实 Session API 写入两种带标记的外部事件并保留回放；该 smoke 不读取或写入历史日志。
