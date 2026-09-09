# dsh-alfred

Alfred（短称 ALF）的 DeepSeek Harness 控制面 bundle。它负责可信能力发现、显式 capability dispatch、当前 Agent 可见性、按意图主动路由、persona 偏好和 Web 状态入口；领域能力由各自模块拥有。

- Profile bundle 只加载 model-invisible `dsh-alfred/bootstrap`。
- Bootstrap 通过 `ctx.agents.registerSetupExtension` 在基础 Standard/PTC preset 挂载后、Agent 发布前解析项目/用户 `.agents/alfred.json`。
- 启用时，`dsh-alfred` 与 profile-inactive `dsh-fin-value` 只挂载到该 Agent 的隔离 scope；Minimal 排除，子 Agent 只继承父 Agent 已激活的扩展。
- `/alf`、`/alfred`、`alf`、`alfred` 都进入 canonical `alfred` Skill：先调用只读 `alfred_capabilities`，再加载相关领域 Skill。
- 自动提示只处理顶层直接用户输入；显式调用不受自动提示 suppression 影响。
- 配置、显式调用和能力提示均不授权安装、更新、迁移、资料库配置、策略/账本写入或其他 mutation。
- Web 入口依据 Session 的 `alfredAvailable` projection 显示，不依据 `agentPreset === alfred`。
- `presets/alfred` 是 `hidden: true` 的历史会话兼容 composition，不是新会话 mode。
