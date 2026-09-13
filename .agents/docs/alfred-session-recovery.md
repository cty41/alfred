# ALF 历史展示事件的离线恢复

## 范围与前提

此工具仅修复本次核对的六个会话：每个会话恰有一条空数据的 `alfred/available`，缺少 envelope 的 `ignorable: true`。六个真实 ID 从只读预览结果作为参数传入，不保存在公共仓库中。工具不扫描并自动批准其他会话、不迁移配置、不删除消息、不停止或启动 DSH。

入口是仓库根目录下的 `scripts/repair-alfred-session-events.ps1`；实际实现是同目录 Node CLI、`scripts/lib/` 中的三个模块以及已有预览器。它们不导入 DSH、不使用 npm 安装或网络服务，但依赖本机 Node 24.19+、Windows PowerShell 5.1 和固定本地 NTFS 卷。保留这些文件及相对目录，不要只复制一个入口文件。

ALF 与 DSH 的写入修复必须先构建好；重启后的 Session 必须支持 `appendIgnorable()`。离线修复只改历史，不能替代新事件写入修复。

## 安全语义

- 不传 `-Apply` 就是只读预演，支持显式 `-DryRun`。预演不创建备份、暂存文件或事务记录，也不调用会编译临时文件的 `Add-Type`。
- 预演检查六个会话完整目录的文件哈希、目录清单、Owner/Group/DACL 和支持的属性，前后复核，并生成绑定来源、备份位置及这些事实的 `confirmationToken`。stdout 不包含对话内容、ACL 或机器绝对路径。
- PowerShell 5.1 下，预演使用内置 provider 检查文件流；目录附加流的完整原生检查延迟到显式 Apply，输出 `nativeStreamCheckRequiredForApply: true`。因此 `planned` 和 token 不代表所有实际写入前检查均已通过。
- `-Apply` 还要求 `-OfflineConfirmed` 和匹配的 `-ConfirmToken`。写入前及过程中检查其他 `node`、`bun`、`deno`、`dsh` 进程和指定端口；为保守起见，无关的 JS 进程也会阻止执行。没有强制忽略参数，不会自动杀进程。
- 实际 Apply 在任何备份或历史写入前执行完整 NTFS 流检查，拒绝命名数据流、链接、重解析点、EFS、稀疏、压缩、云占位、只读文件等不支持状态。备份与暂存位置的 Allow ACE 只能授予当前用户、SYSTEM、Administrators；不靠 Unix mode 位假装 Windows 私密性。
- 每个候选的整个目录内容（包括非日志文件和空目录）先备份并验证。事务记录保存原始清单及 Owner/Group/DACL 等元数据；这是内容恢复备份，不是 NTFS 镜像，不承诺复制 SACL 审计策略、文件 ID、创建时间或恢复文件系统 mtime。有特殊审计策略的环境不要使用本工具自动恢复。
- 日志仅插入 `,"ignorable":true`，不重排或重新序列化其他 JSONL 行。保持 raw/zstd 格式；zstd 会重新压缩并校验，不保持原分帧或压缩字节。原始压缩字节留在备份中。替换前校验并复制原文件的 Owner/Group/DACL 和支持属性。
- 单文件采用同卷暂存后原子替换；六个文件不是一个原子事务。捕获失败会尝试回滚；进程中断或部分回滚失败时保留备份和 `transaction.json`，可单独预演回滚。任何后续日志/旁文件变化都应拒绝覆盖。
- 全部六条已标记时返回 `already-repaired`，不创建新备份；仅部分标记时拒绝普通修复，要求先核对原事务并回滚。
- 停服确认、进程检查和反复哈希校验不是操作系统全局排他锁。执行期间不得启动其他写入器、同步/编辑这些目录或重启 DSH；不要以稳定双次读取代替停服。

## 操作步骤

下面命令供另行确认实际修复后使用；准备脚本、查看文档或预演本身不授权执行 Apply。

### 1. 在独立终端准备参数

在仓库根目录打开 PowerShell。备份必须放在仓库及整个 `sessions` 树之外，使用当前用户的私密本地目录；先确认磁盘空间足够保存六个完整会话目录和暂存日志。

```powershell
Set-Location D:\codes\alfred
$root = Join-Path $HOME '.dsh\sessions\--D-codes-alfred--'
$backupRoot = Join-Path $env:LOCALAPPDATA 'AlfredSessionRecovery'
# 这是用户显式创建备份根目录，不是 DryRun 的副作用。
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
$ids = Read-Host '粘贴已核对的六个完整 session UUID，英文逗号分隔，不加空格'
```

不得把备份放在本仓库、另一 Git 仓库、任何 `sessions` 子目录，或来源目录的祖先目录。ACL 校验拒绝时先停止操作并检查权限，不要加 Everyone 权限来通过检查。

### 2. 停服并生成最终预演

在原 DSH 启动终端按 Ctrl+C，等待退出；确认其他可能写入同一存储的运行时也已停止。保留上一步的独立 PowerShell 终端，执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\repair-alfred-session-events.ps1 `
  -Root $root -BackupRoot $backupRoot -SessionIds $ids -DryRun
```

确认 `status: planned`、`writes: false`、`offlineReady: true`，六个 ID/seq 与此前核对范围一致。复制此次 `confirmationToken`。若需要监听检查其他端口，预演和 Apply 都显式传 `-Port <端口>`；默认 3080。

`source-changed`、`mixed-repair-state-use-rollback`、范围不匹配、ACL/流检查失败都应暂停。不要使用服务运行期间取得的旧 token。

### 3. 显式执行

```powershell
$token = Read-Host '粘贴停服后刚生成的 confirmationToken'
powershell -ExecutionPolicy Bypass -File .\scripts\repair-alfred-session-events.ps1 `
  -Root $root -BackupRoot $backupRoot -SessionIds $ids `
  -Apply -OfflineConfirmed -ConfirmToken $token
```

正常结果为 `status: repaired`。保存返回的 `backupRun` 名称；完整备份及 `transaction.json` 位于 `$backupRoot\<backupRun>`，包含私人会话资料，不要上传或提交 Git。工具不会覆盖已有备份，不会自动清理备份。

若返回 `failed`：保持 DSH 停止，不要假设“失败”意味着完全没写。`rollback: verified-restored` 表示原始内容已验证恢复；`pending...` 或 `writesMayHaveOccurred: true` 表示需要下述回滚预演。若 `journalReady: false`，历史替换尚未开始，可能仅留下未完成的备份；保留现场再检查。

### 4. 必要时单独回滚

```powershell
$run = Read-Host '粘贴原事务的 backupRun 名称'
powershell -ExecutionPolicy Bypass -File .\scripts\repair-alfred-session-events.ps1 `
  -Root $root -BackupRoot $backupRoot -SessionIds $ids -BackupRun $run -DryRun

$rollbackToken = Read-Host '核对后粘贴此次回滚预演的 confirmationToken'
powershell -ExecutionPolicy Bypass -File .\scripts\repair-alfred-session-events.ps1 `
  -Root $root -BackupRoot $backupRoot -SessionIds $ids -BackupRun $run `
  -Apply -OfflineConfirmed -ConfirmToken $rollbackToken
```

回滚使用独立 token，不接受修复 token。备份损坏、来源目录/ID 不符、日志在修复后追加了新内容或旁文件发生变化，都会拒绝覆盖。回滚只恢复被替换的日志文件，其他文件原本就不应被改动；原目录完整内容仍保留在备份中。进程在回滚中途退出后须重新预演，不可盲目重复旧 token。

### 5. 重启与验收

仅在 `repaired` 或已核实恢复后的状态下，使用原启动方式重启 DSH；刷新原 URL，检查六个历史会话。新建 ALF 会话并重启后再次打开，以验证写入端也已更新。发现其他未知必需事件时保留错误与备份，不得将“忽略所有未知事件”当成补救措施。

## 开发验证

`tests/run.ps1` 执行预览器、纯变换、离线事务和 Windows 元数据回归。测试只使用临时夹具；覆盖无写入预演、压缩字节备份、插入保真、失败回滚、部分回滚后重试、陈旧 token、日志分歧、ACL/ADS 拒绝以及真实 Windows 六文件修复/回滚联调。Windows 元数据测试在其他平台明确跳过，不宣称跨平台自动修复可用。
