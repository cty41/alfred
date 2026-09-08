# Alfred（ALF）工具总仓

Alfred（简称 ALF）是个人 Agent 能力栈的公开总控制面。它固定 `knowledge-base-kit`、`skills`、`fin-value` 三个独立子模块，并安装根仓 `dsh-alfred` 控制 bundle；私人 vault、凭据与投资账本不进入 Git。

## 使用

```powershell
git clone --recurse-submodules https://github.com/cty41/alfred.git
cd alfred
powershell -ExecutionPolicy Bypass -File ./alfred.ps1 doctor -Quick -Json
powershell -ExecutionPolicy Bypass -File ./alfred.ps1 capabilities -Quick -Json
powershell -ExecutionPolicy Bypass -File ./alfred.ps1 bootstrap
powershell -ExecutionPolicy Bypass -File ./alfred.ps1 install -Profile all -DshCheckout 'D:\path\to\deepseek-harness'
```

默认安装全部组件，不提供 exclude。生命周期命令为 `bootstrap`、`sync`、`install`、`doctor`、`capabilities` 和维护者专用 `update-locks`；所有变更命令支持无网络、无文件写入的 `-DryRun`。dirty submodule 不会被 reset、clean、stash 或覆盖。

Windows日常使用可双击`start-dsh-web.cmd`；它检测到Web已运行时不会启动第二个实例。代码升级后双击`upgrade-and-restart-dsh.cmd`，脚本会先展示安装DryRun，只有输入完整`YES`后才精确停止DSH Web、安装并重启。维护脚本必须从独立终端运行，不能让当前DSH会话停止承载自己的进程。

`dsh-alfred` 提供 ALF persona、`alfred_capabilities`、称呼偏好、意图路由和 Web 能力入口；`fin-value` 只提供港股研究与确认式账本能力。Fin Value 的运行时名称为 `dsh-fin-value` / `fin-value-investment-research` / `fin_value_*`，不保留旧别名。

macOS 路径和 venv `bin/python` 已做 Windows 参数化模拟测试，仍属于 best-effort、未实机验证。GitHub 的 `fin-alfred` 远端改名是独立外部操作，须另行明确确认。

详见 [`README.md`](README.md)、[`docs/architecture.md`](docs/architecture.md) 与 [`SECURITY.md`](SECURITY.md)。
