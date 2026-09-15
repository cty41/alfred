# Alfred (ALF)

Alfred（简称 **ALF**）是个人 Agent 能力栈的总控制面。它固定并协调四个独立 Git 子模块，安装跨领域的 DSH 控制 bundle，并以可核对的事实展示能力状态；私人知识、凭据和投资账本不进入本仓库。

## 默认组件

- `knowledge-base-kit`：私人知识库的确定性控制面
- `skills`：用户级渐进披露 Skills
- `fin-value`：港股价值研究与确认式本地成交登记领域 bundle
- `maliang`：可审计游戏美术工作流的只读发现与健康检查；不由 Alfred 代执行或修改资产
- `packages/dsh-alfred`：ALF persona、`alfred_capabilities`、称呼偏好、意图路由与 Web 能力入口

安装只准备组件，不再等同于对所有会话启用。项目或用户配置会在基础 Standard/PTC preset 挂载后，为该 Agent 的隔离 scope 附加 ALF 与 Fin Value；Minimal 排除，`alfred` preset 只作为 hidden 历史兼容项。项目可用 `<项目>/.agents/alfred.json` 启用，用户可用 `~/.agents/alfred.json` 全局启用。`/alf`、`/alfred`、`alf`、`alfred` 都会先核对当前能力再加载相关领域 Skill。

## 快速开始

```powershell
git clone --recurse-submodules https://github.com/cty41/alfred.git
cd alfred
powershell -ExecutionPolicy Bypass -File ./alfred.ps1 doctor -Quick
powershell -ExecutionPolicy Bypass -File ./alfred.ps1 bootstrap
powershell -ExecutionPolicy Bypass -File ./alfred.ps1 install -Profile all -DshCheckout 'D:\path\to\deepseek-harness'
# 为当前项目启用（新会话生效）
powershell -ExecutionPolicy Bypass -File ./alfred.ps1 configure -Scope Project -ProjectRoot . -Enable
# 或为当前用户全局启用
powershell -ExecutionPolicy Bypass -File ./alfred.ps1 configure -Scope User -Enable
```

macOS/Linux 使用同一脚本并由 `pwsh` 运行。macOS 路径与 venv `bin/python` 已做模拟测试，但尚未在真实 macOS 设备验收。

## 命令

```powershell
./alfred.ps1 doctor -Quick -Json       # 只读健康检查
./alfred.ps1 capabilities -Quick -Json # 只读能力事实与可操作状态
./alfred.ps1 bootstrap -DryRun -Json   # 初始化 pinned 子模块并构建
./alfred.ps1 sync -DryRun -Json        # 对齐当前根仓 gitlinks，不追踪 remote HEAD
./alfred.ps1 install -Profile all -DryRun -Json
./alfred.ps1 configure -Scope Project -ProjectRoot . -Enable -DryRun -Json
./alfred.ps1 configure -Scope User -Disable -DryRun -Json
./alfred.ps1 update-locks -DryRun -Json # 维护者显式更新 gitlinks
```

`bootstrap`、`sync`、`install`、`configure`、`update-locks` 都支持 `-DryRun`；dry-run 不进行网络或文件写入。`update-locks` 在任何子模块 dirty 时拒绝执行。旧安装会报告 `legacy-global` 并保持原行为，只有停止相关 DSH profile 后显式运行 `configure ... -MigrateLegacy -Profile all -DshCheckout <checkout>` 才迁移到 `dispatch-v1` per-Agent 模型。配置和能力提示本身都不授权这次迁移。`-Disable` 只移除所选 scope 的正向启用；项目 `false` 不覆盖仍为 `true` 的用户全局配置，要全局关闭请使用 `-Scope User -Disable`。

## Windows一键启动与升级

- 双击`start-dsh-web.cmd`日常启动现有Web profile；检测到DSH已运行时不会创建第二个实例。
- 双击`upgrade-and-restart-dsh.cmd`进行维护升级；脚本先展示安装DryRun，只有输入完整`YES`后才精确停止DSH Web、安装Alfred/Fin Value并重启。
- 不要在承载当前会话的DSH工具调用中停止自身进程；升级脚本应从独立终端运行。两个CMD只是薄入口，实际错误处理位于`scripts/*.ps1`。

## 能力发现

`alfred_capabilities` 只在启用了 ALF 的 Standard/PTC Agent（或 hidden 历史 `alfred` 会话）中注册，并合并根清单、只读Git/文件事实以及DSH实际注册的tools/Skills，分别报告声明、源码、构建、安装、运行时可见性、配置、健康和新鲜度。umbrella探针不执行子模块代码；输出会隐藏本机路径、凭据和receipt内容。

ALF 只针对顶层直接用户消息做 token-aware 意图匹配，每轮最多提示两个能力，同一会话每项只提示一次。工具消息、插件注入、子 Agent 和自动 continuation 不会触发；提示不构成安装、迁移或写入授权。

首次进行港股研究时，ALF会让Fin Value只读检查小米云研究资料库。未配置时，Fin Value自动检测固定候选目录并生成预览；用户下一轮确认后才创建资料库并保存本机授权，立即生效且无需重启。后续自动归档只允许向已确认目录新增受信官方PDF，不覆盖、删除或接入小米云账号/API。实际路径和财报文件不进入本仓库。

## Fin Value 迁移

领域标识已 breaking rename 为 `fin-value` / `dsh-fin-value` / `fin_value_*`，不提供旧工具或插件别名。迁移本机账本与称呼偏好前先停止相关 DSH profiles：

```powershell
npm --prefix ./repos/fin-value run migrate:local-state -- --dry-run --json
npm --prefix ./repos/fin-value run migrate:local-state -- --profiles-stopped --json
```

迁移通过 SQLite checkpoint + `VACUUM INTO` 生成并校验新账本，不覆盖已有目标；市场缓存重建、报告留在原位、待确认 token 不迁移。安装器会在不打印 secrets 的前提下把旧 finance profile/preset 配置按 profile 移入 bootstrap 的 opaque `finValue` 配置；Fin Value bundle 继续保持 profile-inactive，只在启用 Agent scope 内挂载。

GitHub 远端仍是 `cty41/fin-alfred`，改名为 `fin-value` 是独立外部操作，必须另行明确确认。

## 安全边界

- 不连接券商、不自动下单。
- Fin Value 只有“预览 → 下一轮明确确认 → commit”才能登记已真实发生的成交。
- 控制清单只允许固定命令标识，不能携带任意 shell 命令。
- dirty 子模块不会被 reset、clean、stash 或覆盖。
- 本仓库不输出或提交 vault 内容、数据库、token、profile overlay 或机器路径。

详见 [`docs/architecture.md`](docs/architecture.md) 与 [`SECURITY.md`](SECURITY.md)。
