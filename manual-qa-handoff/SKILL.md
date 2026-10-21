---
name: manual-qa-handoff
description: Use when reviewed and automatically verified work still needs human visual, UI/Input, interactive, or experiential acceptance; when the user asks to update or output manual QA, acceptance, visual QA, UI/Input QA, smoke checks, 手动测试、人工验收、复验或测试 TODO; or when the user reports checklist items passed, failed, blocked, or deferred.
---

# Manual QA Handoff

## Quick Reference

- Treat `.agents/docs/manual-acceptance.md` as the current manual-acceptance ledger.
- Read [references/output-contract.md](references/output-contract.md) only when updating the ledger or rendering a handoff.
- Use the project's automated testing skill/gates for automated evidence. Do not duplicate their commands here.
- Prefer evidence in this order: explicit user verdict, current diff/commit and gates, active plan, ledger, then the knowledge index (if any).

## When to use

Run explicitly whenever the user asks for a manual checklist or reports checklist results. Run proactively only after implementation, code review, and required automated gates have completed and a human boundary remains.

Do not announce that work is ready for acceptance while a required 自动门禁 or review is failing. Do not proactively emit a checklist during design, diagnosis, implementation, review-only work, or a fully automated change with no pending human boundary.

## Workflow

1. Read the ledger and map any ordinal feedback through `Last Emitted Order`.
2. Update only items supported by explicit feedback or the current verified change.
3. Add new human boundaries as `pending`. Move a reported defect to `failed`; after its fix passes review and gates, reopen it as `pending` with a reason.
4. Mark `deferred` or `blocked` only from the user's statement or an evidenced external blocker.
5. Mark `passed` only from the user's explicit verdict. 自动证据不得把人工项目改为 `passed`。
6. Reopen a passed item only when its relevant behavior, UI, presentation, flow, or Editor lifecycle changed.
7. Render the shortest coherent user journey using the required four sections, then replace `Last Emitted Order` with the emitted stable IDs.

Keep the ledger compact: store current acceptance state and evidence boundaries, not full plans or test logs. Never operate foreground UI on the user's behalf unless separately authorized.

## Anti-patterns

- Repeating every historical passed item after an unrelated change.
- Presenting automated assertions as visual or experiential acceptance.
- Asking the user to observe an event without naming HUD, CheatConsole, Output, Console, or Editor panel.
- Losing pending items when an active plan is archived.
- Treating temporary list numbers as permanent identities.

## Checklist

- Review and required automated gates are green, or the response clearly reports the blocker.
- Every emitted item has an action, expected result, observation location, failure evidence, and save-isolation note.
- Current-round regressions precede cumulative pending work.
- Automated-only coverage is separated from human work.
- `Last Emitted Order` matches the final numbered list.
