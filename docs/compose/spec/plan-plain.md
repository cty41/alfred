---
feature: plan-plain
status: delivered
updated: 2026-09-16
branch: feat/plan-plain
commits: 0c593fa..b8de44b
---

# plan-plain — 计划人话化

## Report

**What was built** — 新增用户级 skill `plan-plain`，作为开发计划的统一入口：在计划节点（生成/整理/落盘/解释计划，或用户点名 `/plan-plain`、要「人话版」）自动或手动介入，按 P0→P3 澄清后写出 Background / Scope / File Structure / Tasks，并在计划顶部强制写入固定五段「人话版」（一句话 → 为什么 → 步骤白话 → 怎样算完成 → 易踩坑），受众为要审阅/执行计划的开发者，专门消解 LLM 计划难读的问题。

旧 `make-dev-plan` 与 `plan-mode-plan-writer` 改为 deprecated 短跳转并保留目录，使 `brainstorming` 等旧引用不断；README 已同步。Skill 遵循 skills 包平铺 + 仅 name/description frontmatter + 渐进披露，可在 MiMo Desktop、Codex、OpenCode、Claude 等读取用户技能根的工具间移植。

**Verification** — `powershell -ExecutionPolicy Bypass -File ./repos/skills/scripts/validate.ps1` → **PASS**（嵌套审计、12 个 skill 的 quick_validate、相对链接、installer 测试、OKF-lite 16 tests）。`smoke.ps1` → **PRE-EXISTING FAIL**：本机 `~/.agents/skills` junction 指向 `D:\codes\cty41-skills` 而非本 checkout，且 `plan-plain` 尚未 `install-user` 重链；与本次改动无关。Fresh review：T1–T4 全部 MET，无 critical/major。

**Journey log** —

1. 「自动检测 plan 节点」在 skills 体系只能靠 description 触发 + 上游/入口接线，没有真 hook；双轨最稳。
2. 用户确认旧两个 plan skill 使用率低后，采用「轻量全流程一体」而非只做人话层，避免解释被上游漏掉。
3. 受众定为开发者（不是字面 ELI5）：问题是 AI 计划过于复杂，不是词汇年龄。
4. skills 包 `rules/agent-worktree.md` 要求复用当前 worktree，故在 `repos/skills` 上开 `feat/plan-plain` 而非再建 worktree。
5. smoke 的 target mismatch 来自全局安装根是另一 clone；验证以 validate 为准，安装后需重跑 smoke。

## [S1] Problem

Agent 产出的开发计划普遍「完整但难读」：术语堆叠、任务标题抽象、验收标准写成套话，审阅者和执行者需要反复对照才能建立全局图景。现有 `make-dev-plan` / `plan-mode-plan-writer` 解决的是「计划写完整、可执行」，不解决「人怎么快速看懂」。仓库内也缺少一个可被自动触发、可手动调用、跨工具（MiMo Desktop / Codex / OpenCode / Claude / DSH 等）的计划入口。

## [S2] Design

### S2.1 交付物

在 skills 仓库新增平铺 skill：

- `repos/skills/plan-plain/SKILL.md` — 唯一新 skill
- 改写 `repos/skills/make-dev-plan/SKILL.md`、`repos/skills/plan-mode-plan-writer/SKILL.md` 为 deprecated 短跳转（保留目录与 name，正文指向 `plan-plain`）
- 更新 `repos/skills/README.md` Skills 表

实现分支：`repos/skills` 上的 `feat/plan-plain`（基于 `feat/alfred-stack-integration` @ `0c593fa`；skills pack 的 `rules/agent-worktree.md` 要求复用当前 worktree，故不新建 worktree）。实现提交：`b8de44b`。

### S2.2 触发（双轨）

1. **Description 自动触发**：`description` 写明在生成/整理/保存开发计划、或用户要求「把计划讲清楚 / 大白话 / 人话版」时使用；模型在 plan 节点应加载本 skill。
2. **手动调用**：用户直接点名 `plan-plain`、`/plan-plain`、或「用 plan-plain 解释/生成计划」时立即进入。

不依赖任何工具专有 hook 字段；工具限制只写在正文。

### S2.3 融合范围（轻量全流程一体）

本 skill 覆盖计划闭环，吸收旧两个 skill 的职责精华，**不**原样搬长文：

| 阶段 | 吸收自 | 保留的合同 |
|------|--------|------------|
| 澄清 | `make-dev-plan` | P0 范围 / P1 方法 / P2 核心 / P3 权限；总题数 5–12；未获许可不改基础库/工具链/结构边界 |
| 结构化计划 | `make-dev-plan` | Background、Scope(In/Out)、File Structure、Tasks（垂直切片、可验收、无占位符） |
| 落盘 | `plan-mode-plan-writer` | decision-complete 才写入项目约定的 plans 目录（默认 `.agents/plans/`）；补 Current State / Risks / Test Plan / Handoff |
| 人话化 | **新增** | 强制写入计划文件顶部「人话版」一节（见 S2.5） |

旧 skill 先标 deprecated 跳转，**不**物理删除（保旧引用与跨工具可发现性）。

### S2.4 产出位置

- 正式计划：项目约定 plans 目录（默认 `.agents/plans/`；项目 `AGENTS.md` 可覆盖）。
- 若用户只要聊天内计划、明确不要落盘，则仍在对话中给出完整计划，并在计划正文顶部嵌入「人话版」。
- 文件名：清晰主题名，必要时带日期。

### S2.5 「人话版」合同（核心可验收行为）

**位置**：计划文件内，`Summary`（若有）之后、实现细节之前；标题固定为 `## 人话版`（可选副标题 `Plain Language`）。

**读者**：需要审阅或执行该计划的开发者/人类。目标是降低认知负担，不是幼稚化、不是另写一篇 ELI5 作文。

**必须包含（顺序固定）**：

1. **一句话**：这份计划要改变什么（≤ 40 字优先）。
2. **为什么**：不做的后果或要解决的真实痛点，≤ 2 句。
3. **步骤白话**：把任务列表译成「先做什么、再做什么、每步做完能看到什么」；禁止把任务标题原样复读。
4. **怎样算完成**：可观察结果，对照验收标准但用人话。
5. **易踩坑**：1–3 条，最容易误解的边界、假设或术语（有则写，无则写「暂无」）。

**语言规则**（对齐 `eli5` 的校准思路，受众固定为开发者）：

- 短句；先结论后细节；不堆从句。
- 不出现未解释的内部缩写；必要术语括号内一句定义。
- 类比可用但必须紧挨字面含义；禁止只有类比没有机制。
- 不夸大、不隐藏 material 限制。
- 与计划正文**事实一致**：人话版不得引入计划里没有的承诺，也不得删掉已写明的禁止项。

**长度**：优先一屏内读完（通常 15–35 行）；任务很多时步骤白话可合并阶段，但不可丢步骤的「完成时能看到什么」。

### S2.6 与 `eli5` 的关系

- `eli5`：任意主题 × 任意受众的解释校准。
- `plan-plain`：计划节点专用：检测/生成计划 + **强制**写入计划文件人话章节；受众固定为开发者，不展开完整受众矩阵。
- 不互相替代；`plan-plain` 正文可引用 `eli5` 的「先 What 后 Caveat」纪律，但不把 eli5 整表搬入。

### S2.7 跨工具可移植

- Frontmatter **仅** `name` + `description`（与 `skill-writing` / skills `AGENTS.md` 一致）。
- 路径约定参数化为「项目约定」，不写 MiMo/Alfred/机器绝对路径。
- 禁止 `allowed-tools` 等单端字段。

## [S3] Out of Scope

- 不为任意主题提供 ELI5（仍用 `eli5`）。
- 不实现工具专有自动 hook / 外挂监听进程。
- 不物理删除旧两个 skill 目录。
- 不批量改写历史计划文件。
- 不引入 skills 仓平铺结构以外的嵌套 skill 组。
- 不在 skill 内放 Alfred/DSH/投资/项目私有内容。

## Tasks

- [x] T1: 编写 `repos/skills/plan-plain/SKILL.md`（frontmatter + Quick Reference / When to use / Workflow / Anti-patterns / Checklist；Workflow 覆盖澄清→结构化→落盘→强制人话版）— acceptance: 文件存在且符合 skills 平铺与渐进披露；人话版合同含 5 段固定顺序与语言规则 (covers: S2.2, S2.3, S2.4, S2.5, S2.7)
- [x] T2: 将 `make-dev-plan/SKILL.md`、`plan-mode-plan-writer/SKILL.md` 改为 deprecated 短跳转到 `plan-plain` — acceptance: 两文件仍含合法 name+description frontmatter，正文明确 deprecated 并链接 `../plan-plain/SKILL.md`，不再保留长工作流 (covers: S2.3)
- [x] T3: 更新 `repos/skills/README.md` Skills 表与简介中的技能列表 — acceptance: 表中含 `plan-plain`，旧两项标注 superseded/deprecated，链接可解析 (covers: S2.1)
- [x] T4: 运行 `repos/skills/scripts/validate.ps1` 并确认绿 — acceptance: 退出码 0；嵌套审计、链接检查、（若安装）quick_validate 均通过 (covers: S2.1, S2.7)
