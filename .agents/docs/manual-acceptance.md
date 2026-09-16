# 人工验收

## 待验收

### MQA-ALF-SCOPED-ACTIVATION
- Status: `pending`
- Source: Standard/PTC per-Agent `lazy-domain-v1` redesign, 2026-09-16
- Reopen reason: 激活从 Agent 创建时整包挂载改为相关直接请求触发的按领域加载；Web 可见性不再来自持久 session projection。
- Action: 按 `official-dsh-migration.md` 从独立终端完成迁移并刷新 `http://127.0.0.1:3080`。在已启用与未启用项目各新建 Standard 会话，再新建 Minimal；先检查能力状态，再在已启用 Standard 输入“查询腾讯港股行情”，最后新建另一个无关 Agent 交叉检查工具清单。
- Expected: 非 Minimal 会话均有轻量 ALF 入口；未启用项目报告 Fin Value installed 但 ineligible，且不能激活。已启用项目初始 Fin Value inactive，相关请求在同一用户轮次先调用 `alfred_activate`，下一 model step 才出现 `fin_value_*` 并继续原任务。另一个 Agent 不被污染；Minimal 排除。冷恢复后下一次相关请求可重新激活，历史中没有新增 `alfred/*` event。历史 `alfred` 会话可恢复，但新会话 picker 不显示 Alfred mode。
- Observe: DSH Web session preset、输入区 ALF 按钮/卡片、`alfred_activate` 与领域工具调用顺序、工具/Skill 清单、浏览器 Console，以及脱敏后的 `alfred_capabilities`。
- Preserve on failure: 项目配置状态、基础 preset、session id、截图、完整错误和去除路径/secrets 后的 Console/工具结果。
- Save boundary: 先 DryRun；真实迁移会改本机 DSH profile、受管 Skills 链接、receipt、hidden compatibility preset 和所选 `.agents/alfred.json`，不得在当前承载会话内执行。不要确认投资资料库、策略或成交写入。
- Automated evidence: Alfred typecheck/build、64项测试及完整PowerShell suite通过；官方未修改DSH 0.1.5-rc.2的真实Agent-loop测试证明同轮下一step可见领域工具、Agent隔离且不写ALF session event。隔离官方Web profile配置与HTTP 200启动通过；Mermaid、mobile fix、read-image-view、subagent-codex、dsh-codex完成组合/启动验证，机器本地task-notify补齐运行时依赖后亦以独立官方profile返回HTTP 200。Fin Value 162项TypeScript测试、38项Python测试、typecheck/build及两个package dry-run通过。当前3080仍为迁移前实例，GUI行为仍需人工确认。
- User verdict: none

### MQA-ALF-SESSION-REPAIR
- Status: `pending`
- Source: ALF routing-message identity repair and Web-profile redeploy, 2026-09-07
- Action: 刷新当前 `http://127.0.0.1:3080`，分别打开 `session-d8cd4cc2-adff-4ce9-8d2b-802bb82cadc9` 与 `session-f4efcba1-8a66-4611-bdb9-9d9e9fc0b0f9`；随后在已启用项目新建启用项目的 Standard 会话，输入“查询港股行情”，等待回复后切换到其他会话再重新打开该新会话。
- Expected: 两个旧会话均完整打开，不再显示 `lacks an identified message`；新会话获得一次 ALF 港股能力提示，重新打开后历史仍可加载。
- Observe: DSH Web 会话列表、会话历史区域和浏览器 Console。
- Preserve on failure: 失败会话 ID、完整错误文本、截图和去除 secrets 后的 Console 日志。
- Save boundary: 仅查看历史并使用测试会话；不要确认投资策略、成交或其他领域写入。
- Automated evidence: Web profile 已链接含 `randomUUID()` 修复的构建产物，服务已在 3080 重启；两个原始 Zstd 日志已有同目录备份。完整历史扫描还发现并修复了长会话 seq 306100 的第二条同源无 ID 提示；最终两个日志全部 Zstd 帧可解码，243/21399 个事件及 30/3155 条消息均通过消息 ID、角色、来源和内容结构复核。真实 GUI 历史打开与冷重载仍需人工确认。
- User verdict: none

### MQA-ALF-WEB-FULL
- Status: `pending`
- Source: ALF control bundle and Fin Value separation implementation, 2026-09-03
- Action: 不要在承载当前会话的DSH Web内执行停止命令。先保存/结束会话，再从独立终端运行根仓`upgrade-and-restart-dsh.cmd`，核对DryRun摘要后输入完整`YES`；安装成功并恢复服务后刷新`http://127.0.0.1:3080`，在已启用项目新建启用项目的 Standard 会话，展开`ALF`能力入口并点击“检查当前状态”。日常只启动服务时使用`start-dsh-web.cmd`。
- Expected: 非 Minimal 输入区显示轻量 ALF 卡片/按钮；点击只填充草稿、不自动发送；发送后 `alfred_capabilities` 还区分按需领域的 installed、eligible、active、failed 和 runtime visibility，不暴露本机路径或 secrets。
- Observe: DSH Web 输入区、工具调用卡片、浏览器 Console。
- Preserve on failure: 截图、preset、session id、Console 错误和去除 secrets 后的工具结果。
- Save boundary: 只读查询；不要执行安装、迁移或账本 commit。
- Automated evidence: ALF 64项测试、client bundle build、官方rc.2隔离profile `--dump-config`和Web HTTP 200启动通过；配置只激活`dsh-alfred/bootstrap`，`dsh-fin-value`保持plain dependency。`dsh-alfred/dist/client.js`保持浏览器loader注册格式。能力卡片、填充草稿和工具结果仍需人工确认。
- User verdict: 2026-09-08 用户确认刷新后的 DSH Web 不再显示 `Failed to load plugins`；本结论仅覆盖插件加载与页面启动 smoke。

### MQA-ALF-EXPLICIT-DISPATCH
- Status: `pending`
- Source: `/alf`, `/alfred`, `alf`, `alfred` canonical dispatcher, 2026-09-09
- Action: 在已启用 Standard 会话依次发送 `/alf 帮我分析中海`、`/alfred 帮我分析中海`、`alf，帮我分析中海`、`alfred 帮我分析中海`；关闭自动 hints 后再发送一种显式形式。另发送 `half price`、`路径 /alf/file` 和引用/代码中的 `alf`。
- Expected: 四种显式形式都在同一会话先核对 `alfred_capabilities`、加载相关领域 Skill 再执行，不要求切换 mode，不重复加载 dispatcher；关闭自动 hints 后仍可用。三个反例不触发 ALF。
- Observe: 会话消息、Skill/tool 调用卡片、session preset 和浏览器 Console。
- Preserve on failure: 输入原文、session id、调用顺序、截图和脱敏 Console/trace。
- Save boundary: 研究过程只读；ALF 调用不授权安装、迁移、资料库 commit、策略保存或成交登记。
- Automated evidence: parser 边界、slash native-injection 去重、raw/headless slash fallback、natural invocation 优先级和 suppression bypass 已由 dsh-alfred 测试覆盖；真实 Web Skill 注入与领域任务体验仍需人工确认。
- User verdict: none

### MQA-ALF-PROACTIVE-ROUTING
- Status: `pending`
- Source: ALF direct-user intent router, 2026-09-03
- Action: 在同一启用项目的 Standard 会话依次输入“帮我保存并整理这段对话”、重复一次，再输入“本会话不再提示能力”和“分析港股”。
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
- Automated evidence: preset availability 和 Web slots 已测试；Web 已在完成 scoped 迁移后重启。Minimal 的真实 GUI 隔离仍需人工确认。
- User verdict: none

### MQA-FIN-RESEARCH-ARCHIVE
- Status: `pending`
- Source: Xiaomi Cloud research archive implementation, commits `f386446` and `7b5898d`, 2026-09-08
- Action: 不要在承载当前会话的DSH Web内停止服务。先从独立终端升级并重启现有Web profile，刷新`http://127.0.0.1:3080`后在已启用项目新建启用项目的 Standard 会话并首次请求“分析中海当前价值”。核对系统先只读检查资料库状态、自动建议检测到的`FinValueResearch`目录并显示预览，且本轮不写配置；下一轮明确回复“确认启用研究资料库”，再检查状态并继续研究。随后查看中海已有资料列表、读取一个TXT/CSV/JSON提取物；在下一次确有新官方PDF证据的真实研究中观察自动归档。
- Expected: 新会话可见六个archive工具和更新后的Skill；首次请求只执行status/prepare，下一轮确认后commit且无需再次重启；状态变为ready，列表不暴露绝对路径，文本按opaque documentId有界读取，PDF只列元数据。自动新增仅接受allowlist官方HTTPS PDF，重复为duplicate、同名异内容为conflict，绝不覆盖或删除。
- Observe: DSH Web工具清单、工具调用卡片、预览/确认消息、浏览器Console，以及小米云`FinValueResearch`目录新增文件；不要以云客户端图标推断已经上传完成。
- Preserve on failure: session id、完整工具名、脱敏后的status/preview/error、截图、Console日志和目标目录相对文件名；不要复制绝对本机配置路径、账号密码、token或券商凭据。
- Save boundary: status、prepare、list、read均只读；只有下一轮直接用户确认可创建本机配置。该确认仅长期授权追加受信官方PDF，不授权删除、覆盖、改根目录、任意下载、策略保存、成交或账本修改。
- Automated evidence: Fin Value typecheck、当前19个测试文件151项测试、完整build、package dry-run通过；既有Python adapter、Skill validator与安全边界测试保持通过。Alfred根PowerShell测试通过；doctor仅报告已知dirty子模块。3080已在scoped迁移后重启，运行时工具可见性与真实交互仍需人工确认。
- User verdict: none

### MQA-FIN-PRIVATE-PERSISTENCE
- Status: `pending`
- Source: Fin Value direct strategy save implementation, 2026-09-06
- Action: 不要在承载当前会话的DSH Web内执行停止命令。先保存/结束会话，再从独立终端安装并重启现有Web profile；刷新`http://127.0.0.1:3080`并在已启用项目新建启用项目的 Standard 会话。先检查工具清单，再输入“分析中海当前估值并给出仓位建议，不要保存”。不要为验收构造虚假策略写入；只有随后确实要保存一份真实、完整策略时，才另行用直接用户请求触发save。
- Expected: 新会话只可见`fin_value_save_portfolio_strategy`，不再可见策略prepare/commit；普通研究请求不调用save。真实且明确的“保存/记录/批准/落地这份完整策略”请求才允许一次调用原子返回applied或duplicate，且不改变持仓、现金或成交账本。
- Observe: DSH Web工具清单、会话中的工具调用卡片、只读portfolio context，以及浏览器Console。
- Preserve on failure: 截图、脱敏后的工具结果、session id、Console错误和安装输出；不要复制账户现金、数据库或API密钥。
- Save boundary: 工具可见性和研究反例均为只读；不要为QA写入虚假策略、登记成交、修改真实数据库或手工覆盖小米云文件。真实中海策略保存必须来自独立明确的用户意图。
- Automated evidence: Fin Value当前151项完整测试、类型检查、完整build、package dry-run、Alfred根仓测试和Web/Headless profile `--dump-config`均已通过；3080已在scoped迁移后重启。新工具可见性、真实session路由和页面交互仍需人工确认。
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

1. `MQA-ALF-SCOPED-ACTIVATION`
2. `MQA-ALF-WEB-FULL`
