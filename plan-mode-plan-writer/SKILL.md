---
name: plan-mode-plan-writer
description: "DEPRECATED — superseded by `plan-plain`. Use when saving a formal plan in Plan Mode or 「落地计划到 .agents/plans/」: route to `plan-plain`, which saves the plan and writes the mandatory 「人话版」 section."
---

# plan-mode-plan-writer（已弃用）

**本 skill 已由 [`plan-plain`](../plan-plain/SKILL.md) 取代。**

请加载并使用 `plan-plain`：它覆盖原 decision-complete 判断、执行上下文补齐、保存到约定 plans 目录（默认 `.agents/plans/`），并**强制**在计划文件顶部写入「人话版」。

## 迁移对照

| 原 plan-mode-plan-writer 职责 | 现入口 |
|------------------------------|--------|
| 判断是否 decision-complete | `plan-plain` Step 3 |
| 补齐 Current State / Risks / Test Plan / Handoff | `plan-plain` Step 3 |
| 保存到 `.agents/plans/` 并告知路径 | `plan-plain` Step 3 |
| —（原先缺失的人话解释） | `plan-plain` Step 4 |

不要再复制本目录中的旧长工作流正文。新工作一律走 `plan-plain`。
