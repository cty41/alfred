# dsh-alfred

Alfred（短称 ALF）的 DeepSeek Harness 控制面 bundle。它只负责可信能力发现、当前会话可见性、按意图主动路由、persona 偏好和 Web 状态查询入口；领域能力由各自模块拥有。

- `alfred_capabilities` 是只读工具。
- full presets 可用，`minimal` 默认排除。
- 只对顶层直接用户输入提供相关能力提示。
- 不执行安装、更新、迁移或领域写入。
- Web 卡片只填充查询草稿，不是实时健康监控。
