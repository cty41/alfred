# 人工验收

## 待验收

### MQA-ALF-SESSION-REPAIR
- Status: `pending`
- Source: ALF routing-message identity repair and Web-profile redeploy, 2026-09-07
- Action: 刷新当前 `http://127.0.0.1:3080`，分别打开 `session-d8cd4cc2-adff-4ce9-8d2b-802bb82cadc9` 与 `session-f4efcba1-8a66-4611-bdb9-9d9e9fc0b0f9`；随后新建 Standard 会话，输入“查询港股行情”，等待回复后切换到其他会话再重新打开该新会话。
- Expected: 两个旧会话均完整打开，不再显示 `lacks an identified message`；新会话获得一次 ALF 港股能力提示，重新打开后历史仍可加载。
- Observe: DSH Web 会话列表、会话历史区域和浏览器 Console。
- Preserve on failure: 失败会话 ID、完整错误文本、截图和去除 secrets 后的 Console 日志。
- Save boundary: 仅查看历史并使用测试会话；不要确认投资策略、成交或其他领域写入。
- Automated evidence: Web profile 已链接含 `randomUUID()` 修复的构建产物，服务已在 3080 重启；两个原始 Zstd 日志已有同目录备份。完整历史扫描还发现并修复了长会话 seq 306100 的第二条同源无 ID 提示；最终两个日志全部 Zstd 帧可解码，243/21399 个事件及 30/3155 条消息均通过消息 ID、角色、来源和内容结构复核。真实 GUI 历史打开与冷重载仍需人工确认。
- User verdict: none

### MQA-ALF-WEB-FULL
- Status: `pending`
- Source: ALF control bundle and Fin Value separation implementation, 2026-09-03
- Action: 不要在承载当前会话的DSH Web内执行停止命令。先保存/结束会话，再从独立终端运行根仓`upgrade-and-restart-dsh.cmd`，核对DryRun摘要后输入完整`YES`；安装成功并恢复服务后刷新`http://127.0.0.1:3080`，新建Standard会话，展开`ALF`能力入口并点击“检查当前状态”。日常只启动服务时使用`start-dsh-web.cmd`。
- Expected: 输入区显示 ALF 卡片/按钮；点击只填充草稿、不自动发送；发送后 `alfred_capabilities` 区分声明、源码、构建、安装、配置和当前 runtime visibility，不暴露本机路径或 secrets。
- Observe: DSH Web 输入区、工具调用卡片、浏览器 Console。
- Preserve on failure: 截图、preset、session id、Console 错误和去除 secrets 后的工具结果。
- Save boundary: 只读查询；不要执行安装、迁移或账本 commit。
- Automated evidence: ALF 17 项测试、client bundle build、隔离 DSH `--dump-config`（同时包含 `dsh-alfred` 与 `dsh-fin-value`）通过；2026-09-08 修复残留 ESM client 产物后，完整根 build 再次确认 `dsh-alfred/dist/client.js` 通过 `window.__ModuleLoader__.load` 注册且无顶层 `import`。能力卡片、填充草稿和工具结果仍需人工确认。
- User verdict: 2026-09-08 用户确认刷新后的 DSH Web 不再显示 `Failed to load plugins`；本结论仅覆盖插件加载与页面启动 smoke。

### MQA-ALF-PROACTIVE-ROUTING
- Status: `pending`
- Source: ALF direct-user intent router, 2026-09-03
- Action: 在同一 Standard 会话依次输入“帮我保存并整理这段对话”、重复一次，再输入“本会话不再提示能力”和“分析港股”。
- Expected: 第一次只提示相关能力且不超过两项；重复请求不重复提示；禁用后本会话不再注入能力提示；不会把提示当成写入授权。
- Observe: 会话消息、工具调用和输入区；必要时查看导出的 session trace。
- Preserve on failure: 完整提示词、session id、消息顺序和脱敏 trace。
- Save boundary: 使用测试对话；不要保存私人内容或确认任何投资账本写入。
- Automated evidence: token boundary、每轮最多两项、session 去重、禁用和 subagent 排除已有单元测试；pre-step 路由消息的非空 ID 回归测试已通过，修复构建已部署并重启；真实 session lifecycle 仍需人工确认。
- User verdict: none

### MQA-ALF-WEB-MINIMAL
- Status: `pending`
- Source: ALF Web entry relocation, 2026-09-03
- Action: 新建 Minimal 会话并检查空白会话输入区，然后输入一个包含 `ALF` 的普通问题。
- Expected: 不显示 ALF 卡片/按钮，不获得 ALF proactive hint；Minimal 原有行为不变。
- Observe: DSH Web 输入区、首次回复、浏览器 Console。
- Preserve on failure: 截图、preset、session id 和 Console 错误。
- Save boundary: 隔离会话，只读操作。
- Automated evidence: preset availability 和 Web slots 已测试；当前 GUI 尚未重启加载新 bundle。
- User verdict: none

### MQA-FIN-PRIVATE-PERSISTENCE
- Status: `pending`
- Source: Fin Value direct strategy save implementation, 2026-09-06
- Action: 不要在承载当前会话的DSH Web内执行停止命令。先保存/结束会话，再从独立终端安装并重启现有Web profile；刷新`http://127.0.0.1:3080`并新建Standard会话。先检查工具清单，再输入“分析中海当前估值并给出仓位建议，不要保存”。不要为验收构造虚假策略写入；只有随后确实要保存一份真实、完整策略时，才另行用直接用户请求触发save。
- Expected: 新会话只可见`fin_value_save_portfolio_strategy`，不再可见策略prepare/commit；普通研究请求不调用save。真实且明确的“保存/记录/批准/落地这份完整策略”请求才允许一次调用原子返回applied或duplicate，且不改变持仓、现金或成交账本。
- Observe: DSH Web工具清单、会话中的工具调用卡片、只读portfolio context，以及浏览器Console。
- Preserve on failure: 截图、脱敏后的工具结果、session id、Console错误和安装输出；不要复制账户现金、数据库或API密钥。
- Save boundary: 工具可见性和研究反例均为只读；不要为QA写入虚假策略、登记成交、修改真实数据库或手工覆盖小米云文件。真实中海策略保存必须来自独立明确的用户意图。
- Automated evidence: Fin Value 130项完整测试与新增直接save定向测试、类型检查、完整build、19项Python adapter测试、package dry-run、Skill validator、Alfred根仓测试、doctor和Web profile `--dump-config`均已通过；当前3080未重启，因此新工具可见性、真实session路由和页面交互仍需人工确认。
- User verdict: none

## 受阻

### MQA-ALF-HEADLESS-RUNTIME
- Status: `blocked`
- Source: 既有 headless provider 环境
- Action: provider adapter 可用后，通过 Headless profile 查询 `alfred_capabilities`，再执行只读 `HKEX:1810` 行情查询。
- Expected: 可见 ALF 与 `fin_value_*` 工具；结果报告真实来源与时间，不提供券商执行。
- Observe: Headless stdout/stderr 与 session trace。
- Preserve on failure: 脱敏命令输出、profile 和 session id。
- Save boundary: 只读；不提交 ledger token。
- Automated evidence: 隔离 Web profile 配置合成通过；既有真实 Headless 环境缺少 `openai-codex` adapter，不能完成人工端到端调用。
- User verdict: none

## Last Emitted Order

1. `MQA-ALF-SESSION-REPAIR`
2. `MQA-ALF-PROACTIVE-ROUTING`
3. `MQA-ALF-WEB-FULL`
4. `MQA-ALF-WEB-MINIMAL`
5. `MQA-FIN-PRIVATE-PERSISTENCE`
6. `MQA-ALF-HEADLESS-RUNTIME`
