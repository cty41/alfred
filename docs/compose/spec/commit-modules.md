---
feature: commit-modules
status: delivered
updated: 2026-09-14
branch: main
commits: fe0f9855a8e927616995998d88458b5dbadf54df..bcb6fbf
---

# Commit Modules

## Report

**What was built** — 新增 lifecycle 命令 `alfred.ps1 commit-modules`：先校验各受管子仓 dirty/detached/message，再在子仓 commit，最后只在根仓钉对应 gitlink。支持 `-DryRun`、`-Message`、`-RootMessage`、`-Tools`；不 push、不 reset/clean/stash。`AGENTS.md` 与 `docs/architecture.md` 写入 agent 协议与 lifecycle 条目；`tests/run.ps1` 覆盖 dry-run 安全边界。

**Verification** — `powershell ./tests/run.ps1` PASS（49 pass / 1 skip）；`alfred.ps1 doctor -Quick -Json` ok；`alfred.ps1 commit-modules -DryRun -Json` planned（识别 fin-value gitlink 漂移，pushes=false）。

**Journey log** — 首版在单循环里边校验边 commit，会在后续模块失败时误报 `writes=false`；改为先全量校验再统一 mutate。
## [S1] Problem

Alfred 用 gitlink 固定三个独立子仓（`repos/knowledge-base-kit`、`repos/skills`、`repos/fin-value`）。日常改 alfred 时经常连带修改子仓，但缺少「先在子仓提交、再在根仓钉 gitlink」的编排命令：

- 子仓长期 dirty，`doctor` 报 `submodule-dirty:*`
- `sync` / `bootstrap` / `install` / `update-locks` 一律拒绝 dirty 子模块
- agent 靠记忆手敲多步 git 协议，容易漏 bump gitlink，或在根仓 `add -A` 卷入无关文件

架构（独立仓 + gitlink）本身正确；缺的是提交编排。

## [S2] Design

新增 lifecycle 命令 `commit-modules`，与现有 `sync` / `update-locks` 同风格。

### CLI

```text
alfred.ps1 commit-modules [-DryRun] [-Json]
    [-Message <string>]      # 子仓 commit message（真执行且存在 dirty 时必填）
    [-RootMessage <string>]  # 根仓 bump gitlink 的 message；默认 chore: bump managed gitlinks
    [-Tools id1,id2]         # 可选，只处理指定 tool id；默认全部受管工具
```

### Behavior

1. 读取 `alfred.tools.json`，解析受管工具集合。
2. 对每个选中 tool：
   - 未初始化（无 `.git`）→ 跳过，记入 `data.skippedUninitialized`
   - `git status --porcelain` 非空 → dirty
     - detached HEAD → 直接失败，issue `submodule-detached:<id>`（禁止在游离头上静默 commit）
     - `-DryRun`：仅计划 `git add -A` + `git commit`（不写文件）
     - 真执行：无 `-Message` → 失败 `message-required:<id>`；否则 `git add -A` + `git commit -m <Message>`
   - 计算子仓 `HEAD` 与根仓该路径 gitlink（`git ls-tree HEAD`）
   - 不一致 → 计划/执行在根仓 `git add -- <path>`
3. 若至少有一个 gitlink 需要钉：
   - `-DryRun`：返回 planned
   - 真执行：根仓 `git add` 后 `git commit -m <RootMessage>`（默认 `chore: bump managed gitlinks`）
4. 永不：`push`、`reset`、`clean`、`stash`、提交根仓非 gitlink 路径、递归 nested gitlink。
5. 全部干净且 gitlink 已对齐 → `status=ok`，`data.nothingToCommit=true`。

### Safety contracts

| 约束 | 实现 |
|------|------|
| DryRun 无写入 | 只读 status/ls-tree/rev-parse |
| 不 push | 无 push 调用 |
| 不破坏 dirty 现场 | 无 reset/clean/stash |
| 根仓只钉 gitlink | `git add -- repos/<id>` 路径白名单 |
| 独立仓边界 | 只在子仓内 commit，不拷贝实现进 umbrella |
| agent 可执行 | 单命令 + DryRun 预览；AGENTS.md 写死何时调用 |

### Result shape

复用 `New-AlfredResult`：`command` / `status` / `changes` / `issues` / `data`。

`data` 关键字段：

- `dirtyModules`: 真正会 commit 的 tool id
- `gitlinkBumps`: 需要/已经钉的 `{id, from, to}`
- `skippedUninitialized`: 跳过的未初始化 id
- `requiresMessage`: DryRun 且存在 dirty 且未传 Message 时为 true（提示真执行前必须带）
- `nothingToCommit`: 无需任何动作时为 true
- `writes` / `network` / `pushes`: 均为 false

### AGENTS.md protocol

增加：

- 改动落在 `repos/*` 时，完成验证后运行 `alfred.ps1 commit-modules -DryRun`，再 `-Message` 真执行。
- 根仓非 gitlink 改动由普通 umbrella commit 单独处理；不得用本命令夹带。
- 禁止为清 dirty 而 reset/clean/stash 子模块。

### architecture.md

在 Fixed lifecycle 增加：

- `commit-modules`: 把 dirty 子模块以显式 message 提交到其当前分支，并只在根仓钉对应 gitlink；不 push、不动其他根仓文件。

## [S3] Out of Scope

- 不 push、不建 GitHub PR
- 不自动为 detached HEAD 创建分支（失败并提示用户/agent 先 checkout）
- 不递归提交 nested gitlinks
- 不改 `sync` / `bootstrap` / `update-locks` 的 dirty 拒绝语义
- 不实现 doctor 新文案（本版只做命令 + 文档协议）

## Tasks

- [x] T1: 实现 `src/CommitModules.psm1` — acceptance: `Invoke-AlfredCommitModules` 支持 DryRun/planned、真执行 commit+gitlink、message-required、detached 拒绝、只钉 gitlink (covers: S2)
- [x] T2: 挂到 `alfred.ps1` ValidateSet 与 dispatch — acceptance: `alfred.ps1 commit-modules -DryRun -Json` 可调用 (covers: S2; depends: T1)
- [x] T3: 更新 `AGENTS.md` 与 `docs/architecture.md` — acceptance: 文档描述与 S2 一致，写明 agent 协议 (covers: S2)
- [x] T4: 扩展 `tests/run.ps1` — acceptance: dry-run 在 clean 或 dirty 子模块下均可安全通过且不改 working tree (covers: S2; depends: T2)
- [x] T5: 跑 `tests/run.ps1` 与 `alfred.ps1 doctor -Quick -Json` — acceptance: 无新增失败 (covers: S2; depends: T4)
