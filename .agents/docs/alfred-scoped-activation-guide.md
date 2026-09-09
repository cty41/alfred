# ALF Standard 调度与人工验收指南

## 当前模型

ALF 不是与 Standard 并列的 mode。项目或用户配置为支持的 Agent 增加能力，基础 preset 仍是 Standard/PTC；Minimal 始终排除。

```text
创建/恢复 Standard 或 PTC Agent
  -> 按 cwd 解析项目 .agents/alfred.json，再解析用户 ~/.agents/alfred.json
  -> enabled:true 时，在该 Agent 隔离 scope 挂载 ALF + Fin Value
  -> 用户用 /alf、/alfred、alf 或 alfred 调用 dispatcher
  -> alfred_capabilities 核对当前事实
  -> 加载相关领域 Skill
  -> 在领域授权边界内完成任务
```

项目 `enabled:false` 不覆盖用户 `enabled:true`。fork/spawn 只继承其确切父 Agent 已激活的 ALF，不根据子 cwd 新增权限。历史 `alfred` preset 仅作为 hidden compatibility composition 保留，不出现在新会话选择器中。

## 迁移

不要在承载当前会话的 DSH Web 中停止 DSH。先结束会话，再从独立 PowerShell 预演：

```powershell
cd D:\codes\alfred
powershell -ExecutionPolicy Bypass -File ./alfred.ps1 configure `
  -Scope Project `
  -ProjectRoot D:\codes\alfred `
  -Profile all `
  -DshCheckout D:\codes\deepseek-harness `
  -Enable `
  -MigrateLegacy `
  -DryRun `
  -Json
```

预期 `status = planned`、`legacyMigration = true`、`activationModel = dispatch-v1`，且不修改文件。确认 Web 与 Headless profile 都已停止后去掉 `-DryRun`。迁移会：

- 保持 `dsh-fin-value` 为 profile-inactive dependency；
- 移除受管 legacy global override；
- 将旧 profile/preset 的 Fin Value 本机配置按 profile 移入 bootstrap 的 opaque `finValue` 配置；
- 写入所选项目或用户 activation config 与 `dispatch-v1` receipt；
- 安装 hidden historical-session compatibility preset；
- 失败时恢复 profile 控制文件、配置、receipt 与 compatibility preset。

已有受管 dispatch 配置会逐字节保留，包括显式空配置；不会从旧 preset 补回已删除的字段。没有 dispatch 配置时才依次使用该 profile 的旧配置、历史 preset。所有所选 profile 在写入前完成预检；损坏/重复标记、来源冲突、非受管 bootstrap 配置都会拒绝。自动迁移只接受可明确识别的单行标量配置；复杂 YAML（集合、别名、多行值等）需人工核验，不会被猜测或重写。重复迁移不会改变已有配置。

配置发现、ALF 调用或能力提示都不授权迁移。

## 四种调用入口

在启用项目中新建 **Standard** 会话，分别测试：

```text
/alf 帮我分析中海
/alfred 帮我分析中海
alf，帮我分析中海
alfred 帮我分析中海
```

四种形式都应在同一会话中先核对能力、加载相关领域 Skill，再继续任务；不应要求切换 mode。slash 形式由 DSH Skill 注入处理，非 slash 形式由 ALF direct-invocation parser 处理，不应重复加载 dispatcher。

以下内容不得触发：

```text
half price
路径 /alf/file
请引用“alf”
```alf do it```
```

关闭自动 capability hints 后，四种显式调用仍应可用。

## 会话隔离验收

### 已启用项目的 Standard/PTC

预期：

- 会话记录的基础 preset 仍是 `standard` 或 `ptc`；
- 显示 ALF Web 入口；
- 当前 Agent 可见 `alfred_capabilities`、`alf`/`alfred` Skills 与 Fin Value 能力；
- `alf，帮我分析中海` 在本会话直接完成调度。

### Minimal

预期：不显示 ALF 入口，不存在 ALF、Fin Value 或 Alfred 管理的项目 Skills，原有 Minimal 行为不变。

### 未启用项目

在用户范围也未启用时，新建 Standard 会话。预期：没有 ALF/Fin Value Agent 能力；若出现，说明 per-Agent 隔离失败。

### 同进程双项目

同时创建一个启用项目和一个未启用项目的 Standard 会话。预期只有前者拥有 ALF；创建顺序不会改变结果，说明共享 Standard standing composition 未被污染。

### 子 Agent

从已启用父 Agent fork/spawn：后代继承 ALF。从未启用父 Agent 创建后代，即使子 cwd 指向启用项目也不得获得 ALF。

### 历史会话

打开记录了 `agentPreset: alfred` 的旧会话。预期可读/可恢复且工具不重复注册；新会话选择器中不再显示 Alfred preset。

## 授权边界验收

ALF discovery 只授权发现与当前任务。它不能替代以下独立确认：

- Fin Value 研究资料库 prepare/commit；
- 投资策略明确保存请求；
- 成交或初始持仓跨轮 prepare/commit；
- 安装、迁移、配置、删除或其他写入。

## 配置命令

项目启用（推荐）：

```powershell
.\alfred.ps1 configure -Scope Project -ProjectRoot D:\某项目 -Enable
```

用户范围启用：

```powershell
.\alfred.ps1 configure -Scope User -Enable
```

用户范围关闭：

```powershell
.\alfred.ps1 configure -Scope User -Disable
```

完整验收状态见 [人工验收账本](manual-acceptance.md)。
