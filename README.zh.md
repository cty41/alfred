# Alfred（ALF）工具总仓

Alfred（简称 ALF）是个人 Agent 能力栈的公开总控制面。它固定 `knowledge-base-kit`、`skills`、`fin-value`、`maliang` 四个独立子模块，并安装根仓 `dsh-alfred` 控制 bundle；私人 vault、凭据与投资账本不进入 Git。

## 使用

```powershell
git clone --recurse-submodules https://github.com/cty41/alfred.git
cd alfred
powershell -ExecutionPolicy Bypass -File ./alfred.ps1 doctor -Quick -Json
powershell -ExecutionPolicy Bypass -File ./alfred.ps1 capabilities -Quick -Json
powershell -ExecutionPolicy Bypass -File ./alfred.ps1 bootstrap
powershell -ExecutionPolicy Bypass -File ./alfred.ps1 install -Profile all
# 当前项目启用（新会话生效）
powershell -ExecutionPolicy Bypass -File ./alfred.ps1 configure -Scope Project -ProjectRoot . -Enable
# 或当前用户全局启用
powershell -ExecutionPolicy Bypass -File ./alfred.ps1 configure -Scope User -Enable
```

安装只准备轻量 ALF dispatcher 与 plain Fin Value runtime，不再默认向所有会话开放领域能力。项目或用户配置允许相关直接请求通过 `alfred_activate` 把所需领域按需挂入当前 Agent；Minimal 排除，冷恢复后下一次相关请求重新激活，`alfred` preset 只作为 hidden 历史兼容项。项目配置位于 `<项目>/.agents/alfred.json`，用户全局配置位于 `~/.agents/alfred.json`。`/alf`、`/alfred`、`alf`、`alfred` 都先核对当前能力再加载相关领域 Skill。所有变更命令支持无网络、无文件写入的 `-DryRun`。旧 global/scoped 安装只有在停止相关 DSH profile 后显式运行 `configure ... -MigrateLegacy -Profile all -DshCheckout <checkout>` 才迁移到 `lazy-domain-v1`；私有 Fin Value 配置按 profile 移入 bootstrap 的 opaque 配置，`dsh-fin-value` 作为不带 bundle patch 的 plain dependency 保留。配置或能力提示不授权迁移。`-Disable` 只移除所选 scope 的正向启用；项目 `false` 不覆盖用户全局 `true`。dirty submodule 不会被 reset、clean、stash 或覆盖。

默认安装与启动使用固定的官方 `@deepseek-ai/dsh@0.1.5-rc.2` registry launcher，不要求源码 checkout；`-DshCheckout` 仅用于显式开发或回滚。Windows日常使用可双击`start-dsh-web.cmd`；它检测到Web已运行时不会启动第二个实例。代码升级后双击`upgrade-and-restart-dsh.cmd`，脚本会先展示安装DryRun，只有输入完整`YES`后才精确停止DSH Web、安装并重启。维护脚本必须从独立终端运行，不能让当前DSH会话停止承载自己的进程。

`dsh-alfred` 提供 ALF persona、`alfred_capabilities`、称呼偏好、意图路由和 Web 能力入口；`fin-value` 只提供港股研究与确认式账本能力。Fin Value 的运行时名称为 `dsh-fin-value` / `fin-value-investment-research` / `fin_value_*`，不保留旧别名。

首次港股研究时，ALF会触发Fin Value只读检查小米云研究资料库。未配置时自动检测并展示预览，用户下一轮确认后才创建目录并保存本机授权；配置立即生效，无需手工编辑DSH profile。官方PDF只能新增到已确认目录，不覆盖、删除或进入Git。

macOS 路径和 venv `bin/python` 已做 Windows 参数化模拟测试，仍属于 best-effort、未实机验证。GitHub 的 `fin-alfred` 远端改名是独立外部操作，须另行明确确认。

详见 [`README.md`](README.md)、[`docs/architecture.md`](docs/architecture.md) 与 [`SECURITY.md`](SECURITY.md)。
