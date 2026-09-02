# Alfred 工具总仓

Alfred 是本地 Agent-first 个人工具栈的公开总仓。它用 Git submodule 固定独立仓库版本，并提供统一、dry-run 优先的命令入口；LifeKnowledge 私人数据不会进入 Git。

## 首批仓库

- `knowledge-base-kit`：私人知识库确定性控制层
- `skills`：用户级通用 Agent Skills
- `fin-alfred`：本地优先的 DSH 投资研究能力

## 使用

```powershell
git clone --recurse-submodules https://github.com/cty41/alfred.git
cd alfred
powershell -ExecutionPolicy Bypass -File ./alfred.ps1 doctor -Quick -Json
powershell -ExecutionPolicy Bypass -File ./alfred.ps1 install -Profile all -ActivationRoot 'D:\path\to\LifeKnowledge' -DryRun -Json
```

`Profile all` 覆盖 Web 与 Headless。真实安装由各子仓自己的安装器执行；总仓不保存模型、Tushare、券商或其他凭据。

所有变更命令支持 `-DryRun`；update 遇到脏 submodule 会拒绝，不会 reset、clean 或 stash。详见 [`docs/architecture.md`](docs/architecture.md)。
