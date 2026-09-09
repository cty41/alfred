---
name: alf
description: Use when the direct user invokes /alf or starts a request with alf — route the request through the canonical alfred capability-dispatch Skill.
---

# ALF short invocation

## Quick Reference

| Input | Action |
|---|---|
| `/alf <task>` | Load `alfred`, then handle `<task>` |
| `alf <task>` | Load `alfred`, then handle `<task>` |
| `alf` only | Ask what task the user wants handled |

## When to use

Use only for a direct user's explicit `alf` invocation. This is a short alias for the canonical `alfred` Skill, not a separate workflow or mode.

## Workflow

1. Preserve the user's task text after `alf`.
2. Call the `skill` tool with the exact name `alfred` unless its instructions are already present in this turn.
3. Follow the canonical Alfred workflow: inspect current capability facts, load the relevant domain Skill, and act under its rules.
4. Do not install, migrate, configure, or write merely because the user invoked ALF.

```text
/alf <task> -> skill({ name: "alfred" }) -> capability discovery -> domain Skill
```

## Anti-patterns

| Avoid | Prefer | Why |
|---|---|---|
| Duplicate the full dispatcher policy here | Load `alfred` | Keeps one authoritative workflow |
| Treat ALF as a session mode | Stay in the current preset | Invocation is task routing |
| Infer write approval | Require domain-specific direct confirmation | Preserves safety |

## Checklist

- [ ] Invocation came from the direct user
- [ ] The original task text is preserved
- [ ] The canonical `alfred` Skill is loaded once
- [ ] No mutation is inferred from the alias
