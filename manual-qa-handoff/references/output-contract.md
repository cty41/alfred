# Manual QA Output Contract

Read this file only when changing `.agents/docs/manual-acceptance.md` or producing a manual acceptance handoff.

## Ledger Schema

Use stable IDs shaped as `MQA-<SYSTEM>-<SUBSYSTEM>`. Each item is a level-three heading and contains:

- `Status`: `pending`, `passed`, `failed`, `deferred`, or `blocked`.
- `Source`: first introduction or latest reopen commit/task.
- `Reopen reason`: only when a previously passed item is reopened.
- `Action`, `Expected`, `Observe`, `Preserve on failure`, and `Save boundary`.
- `Automated evidence`: what automation proves and the remaining human boundary.
- `User verdict`: latest explicit user conclusion, or `none`.

Keep items under the matching status section. Never infer `passed` from test results. Preserve pending items when plans are archived.

`## Last Emitted Order` maps the most recent numbered output to stable IDs:

```markdown
1. `MQA-UI-LAYOUT`
2. `MQA-INPUT-FLOW`
```

Interpret `1–4 OK`, `5 failed: ...`, and `6 deferred` through this mapping. Reject ambiguous numbering when no valid mapping exists.

## Reopen Rules

- Reopen only if the current change touches the accepted behavior or its presentation/input/lifecycle dependency.
- Record the change and reason. Do not reopen neighboring or unrelated items.
- A fixed `failed` item becomes `pending` only after its review and required gates pass.
- A failing gate produces a blocked handoff, not a ready-for-QA list.

## Output Structure

Always use these sections when a formal checklist is emitted:

1. `本轮重点`: new work, fixes, and reopened regressions.
2. `累计待验收`: older pending/deferred work not directly changed this round.
3. `无需重复人工验证`: logic and structural results adequately covered by automation.
4. `环境与收尾`: shortest setup, app/Editor/scene state, log checks, and cleanup.

Order steps as one user journey. Avoid repeated restarts, setup, or navigation.

Each numbered human step must say:

- **操作**: exact user action.
- **预期**: visible or experiential result.
- **观察**: HUD、Output、Inspector 或其他明确命名的观察位置。
- **失败保留**: screenshot, exact log, current scene/run state, seed, or save copy.
- **存档边界**: production save, isolated run, read-only scene, or destructive consequence.

End with:

```text
1–4 OK
5 failed：实际现象……
6 deferred
Output：无异常
```

## Scenario Decisions

| Scenario | Required behavior |
|---|---|
| A reviewed and verified fix | Emit changed/reopened items plus older pending work. |
| Multiple surfaces have pending items | Keep them separate and name the exact observation surface. |
| Required automated gate fails | Report the gate and do not say acceptance can start. |
| User reports partial numbered results | Resolve numbers through `Last Emitted Order`, then update stable IDs. |
| A related presentation change follows a pass | Reopen only the affected visual/input item with a reason. |
| An unrelated code change follows a pass | Keep the passed item closed. |
| A plan is archived | Retain all unresolved ledger items. |
| Logic is fully asserted by automation | Put it under `无需重复人工验证`, not the human list. |

Explicit and implicit `manual-qa-handoff` invocation must produce the same structure.