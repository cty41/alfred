---
name: skill-writing
description: "Use when creating new skills or editing existing skills — ensures all skills follow progressive disclosure pattern"
---

# Skill Writing Guide

创建 skill 时必须遵循渐进式披露规范，确保 AI 能快速查找、正确使用。

## Quick Reference

| 元素 | 必需 | 作用 |
|------|------|------|
| Frontmatter | ✅ | 仅 `name` + `description`，兼容 Codex/OpenCode |
| Quick Reference | ✅ | 一行表格快速查找 |
| When to use | ✅ | 明确触发条件 |
| Workflow | ✅ | 分步指南 + 代码示例 |
| Anti-patterns | 推荐 | 反模式警示 |
| Checklist | 推荐 | 验证完成度 |

## When to use

- 创建新的 skill 文件
- 修改现有的 skill 内容
- 审查 skill 是否符合规范

## Workflow

### Step 1: Frontmatter

```markdown
---
name: my-skill
description: "Use when [触发条件] — [核心价值]"
---
```

只使用 `name` 和 `description`。Codex 只依赖这两个字段触发技能；OpenCode 也支持 `.agents/skills/<name>/SKILL.md` 并通过 `name`/`description` 暴露技能。不要把 `allowed-tools`、`argument-hint`、`tools` 等单端字段写入 skill frontmatter；如需说明工具限制，写在正文 Workflow 中。

`description` 必须包含用途和触发条件，因为正文只有在技能被加载后才可见。

### Step 2: Quick Reference

```markdown
## Quick Reference

| 操作 | API / 命令 |
|------|-----------|
| 操作1 | `API1` |
| 操作2 | `API2` |
```

### Step 3: When to use

```markdown
## When to use

- 场景1
- 场景2
- 场景3
```

### Step 4: Workflow

```markdown
## Workflow

### Step 1: [步骤名]

[说明]

```csharp
// 代码示例
```

### Step 2: [步骤名]
...
```

### Step 5: Anti-patterns

```markdown
## Anti-patterns

| ❌ 错误 | ✅ 正确 | 原因 |
|---------|---------|------|
| 错误做法1 | 正确做法1 | 原因1 |
| 错误做法2 | 正确做法2 | 原因2 |
```

### Step 6: Checklist

```markdown
## Checklist

- [ ] 检查项1
- [ ] 检查项2
- [ ] 检查项3
```

## Anti-patterns

| ❌ 错误 | ✅ 正确 | 原因 |
|---------|---------|------|
| 没有 Quick Reference | 包含 Quick Reference | AI 无法快速查找 |
| 没有 When to use | 包含 When to use | AI 不知道何时使用 |
| 没有代码示例 | 包含代码示例 | AI 无法正确实现 |
| 没有反模式 | 包含反模式 | AI 可能重复错误 |

## Checklist

- [ ] 包含 Frontmatter（name + description）
- [ ] Frontmatter 不包含 `allowed-tools`、`argument-hint` 等非双端稳定字段
- [ ] 包含 Quick Reference 表格
- [ ] 包含 When to use 触发条件
- [ ] 包含 Workflow 分步指南
- [ ] 包含代码示例
- [ ] 包含 Anti-patterns（推荐）
- [ ] 包含 Checklist（推荐）