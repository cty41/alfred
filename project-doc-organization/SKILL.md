---
name: project-doc-organization
description: "Use when creating, moving, or organizing project documentation files — design docs, plans, usage guides, or drafts"
---

# 项目文档组织规范

保持 `.agents/` 中的文档短小、当前、可发现。设计、计划、实现和 OKF 各有独立职责。

## Quick Reference

| 内容 | 位置 | 生命周期 |
|---|---|---|
| 当前设计与使用指南 | `.agents/docs/` | 持续更新；失效内容删除或合并 |
| 临时灵感收集箱 | `.agents/docs/brainstorm.md` | 未验证；成熟后迁移并删除原条目 |
| 活跃可执行计划 | `.agents/plans/` | 实施完成并迁移长期知识后删除 |
| 跨系统综合与导航 | `.agents/knowledge/` | 按知识索引（OKF-lite）规则维护 |
| 实现事实 | 代码、资源与测试 | 当前行为的最终事实源 |

## When to use

- 新建、移动、合并或删除设计文档、计划和指南。
- 实施完成后处理计划生命周期。
- 发现同一主题存在互相冲突的多份文档。
- 需要判断内容应该进入 docs、plans、knowledge 还是代码注释。

## 分类规则

### `.agents/docs/`

保存当前系统设计、数据流、约束和使用方式。一个主题优先只有一份权威文档；阶段审计、临时验证结果和已经被实现吸收的计划不要长期堆积在这里。

`brainstorm.md` 是明确例外：它只收集未经验证的临时灵感，不是设计真相源。想法成熟后迁入对应权威设计；确认是现有缺口时迁入 `project-known-gaps.md`；决定执行后才建立正式计划。

### `.agents/plans/`

只保存已经收束、尚需执行的计划。计划必须有明确范围、任务、验收和交接上下文。草案不进入该目录；已完成计划也不继续充当当前设计文档。

### `.agents/knowledge/`

保存知识索引（OKF-lite）的概念页、索引和日志。它负责摘要、关系和导航，不复制整份设计/计划，也不替代代码、资产或测试。维护规则见 `knowledge-maintenance` skill。

## Workflow

1. 未验证的想法先写入 `.agents/docs/brainstorm.md`。
2. 设计结论写入或合并到 `.agents/docs/` 的主题权威文档。
3. 只有 decision-complete 的执行方案写入 `.agents/plans/`。
4. 实施时以计划为任务入口，以代码、资产和测试验证结果。
5. 完成后执行计划收尾：
   - 确认实现与验收结果；
   - 将仍有长期价值的设计规则合并回权威 docs；
   - 将未实施项写入统一缺口清单，或另建获得批准的活跃计划；
   - 更新受影响的知识索引 scope（见 `knowledge-maintenance`）；
   - 删除已完成计划，历史由 Git 保留。

## 引用原则

- Markdown 文档之间使用相对链接。
- 不引用已删除的阶段计划作为当前事实源。
- 文档描述实现状态时，给出可复核的代码、资产或测试路径。
- 图片只在视觉关系无法由文字准确说明时保留，不把截图作为功能验证证据。

## Anti-patterns

| 错误 | 正确 |
|---|---|
| completed plan 永久留在 plans | 迁移长期知识后删除 |
| 每个阶段生成一份新设计文档 | 更新该主题的权威文档 |
| 将历史审计当成当前实现 | 回到代码、资产和测试复核 |
| 将完整设计复制进知识索引 | 摘要并链接权威来源 |
| 为删除内容再建 archive 目录 | 使用 Git 历史 |
| 将 brainstorm 条目当作已批准需求 | 先收束设计或确认缺口 |

## Checklist

- [ ] 文档类型与目录匹配。
- [ ] `brainstorm.md` 中的条目没有被当作当前设计或实施承诺。
- [ ] 同主题没有并列的当前真相源。
- [ ] 活跃计划仍有待执行任务。
- [ ] 完成计划的长期知识已迁移，遗留项已归档到统一缺口或新计划。
- [ ] 相关链接、知识索引 scope 和索引已同步。
