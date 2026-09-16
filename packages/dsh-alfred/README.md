# dsh-alfred

Alfred（ALF）的 DeepSeek Harness 轻量控制 bundle。它负责可信能力发现、显式 capability dispatch、当前 Agent 可见性、按意图主动路由和 Web 入口；领域能力由各自模块拥有并按需挂载。

- Profile bundle 始终加载 `dsh-alfred/bootstrap`；bootstrap 只挂载轻量 dispatcher，不预加载领域 runtime。
- 顶层直接用户请求命中领域，且项目或用户 `.agents/alfred.json` 启用时，路由提示模型调用 `alfred_activate`。
- `alfred_activate` 只把已安装的领域插件通过当前 `agent.ctx.plugin(...)` 挂入该 Agent；下一 model step 重新组装 tool schemas 后继续原请求。
- `dsh-fin-value` 是 plain runtime dependency，不带 profile bundle patch。独立的 `dsh-fin-value-bundle` 才用于有意的 profile-wide standalone 激活。
- Minimal 排除。子 Agent 只能继承父 session 已 active 的领域，不能按自身 cwd 扩权；领域写工具仍独立执行顶层用户、轮次和确认 token 检查。
- 激活状态仅存在于当前进程内存；冷恢复后的下一次相关请求重新激活。插件不写 `alfred/available` 等 session event，也不依赖 Web projection。
- `/alf`、`/alfred`、`alf`、`alfred` 进入 canonical ALF 调度；`alfred_capabilities` 区分 installed、eligible、active、failed 与实际 runtime visibility。
- 配置、显式调用、能力提示和领域激活均不授权安装、更新、迁移、资料库配置、策略/账本写入或其他 mutation。
- `presets/alfred` 是 `hidden: true` 的历史会话兼容 composition，不是新会话 mode。

构建 ALF 和官方 DSH 后，可在 Alfred 根目录运行：

```powershell
node packages/dsh-alfred/test/runtime-session-smoke.mjs "<official DSH checkout>"
```

该 smoke 验证 ALF session-start 不写自定义事件；不会读取或写入用户历史日志。
