---
name: make-dev-plan
description: "DEPRECATED — superseded by `plan-plain`. Use when someone asks for a development plan, task breakdown, or 「帮我制订开发计划」: route to `plan-plain`, which now generates the plan and writes the mandatory 「人话版」 section."
---

# make-dev-plan（已弃用）

**本 skill 已由 [`plan-plain`](../plan-plain/SKILL.md) 取代。**

请加载并使用 `plan-plain`：它覆盖原 P0→P3 澄清、Background/Scope/File Structure/Tasks 拆分、decision-complete 落盘，并**强制**在计划中写入「人话版」，避免 LLM 计划难以理解。

## 迁移对照

| 原 make-dev-plan 职责 | 现入口 |
|----------------------|--------|
| P0→P3 澄清（5–12 题） | `plan-plain` Step 1 |
| Background / Scope / Tasks | `plan-plain` Step 2 |
| 交给 plan-mode-plan-writer 落盘 | `plan-plain` Step 3 |
| —（原先缺失的人话解释） | `plan-plain` Step 4 |

不要再复制本目录中的旧长工作流正文。新工作一律走 `plan-plain`。
