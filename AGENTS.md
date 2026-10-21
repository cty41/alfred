# Agent Skills — authoring rules

This repository is a user-level, cross-project skill pack. Every rule below is a
hard constraint for contributors.

## Non-negotiable

1. **Flat only.** A skill is `<skill-name>/SKILL.md` at the repository root.
   Nested skill groups (e.g. `prod/grill-me/SKILL.md`) are invisible to every
   standard discoverer (DSH, Codex, OpenCode, Claude) and are rejected by the
   nesting audit in `scripts/validate.ps1`.
2. **Portable frontmatter.** `SKILL.md` frontmatter contains exactly
   `name` and `description`. No tool-specific fields (`allowed-tools`,
   `argument-hint`, `tools`, …). Tool limits belong in the body.
3. **Progressive disclosure.** Every skill provides, in order:
   Quick Reference → When to use → Workflow → Anti-patterns (recommended) →
   Checklist (recommended).
4. **No project-specific content.** No mention of Godot/Unity/Tactics/DSH
   Alfred/investment domains, their paths, tools, or OKF scopes. Project
   conventions are parameterized in the skill body or mapped by the project's
   own `AGENTS.md`.
5. **Nothing sensitive or personal.** No tokens, personal data, machine paths,
   or machine-specific usernames.

## Gate

`scripts/validate.ps1` must be green before any push:

- `quick_validate` per skill when the skill-creator validator is installed
  (`~/.codex/skills/.system/skill-creator/scripts/quick_validate.py`);
- nesting audit (no `SKILL.md` deeper than `<root>/<skill-name>/`);
- local relative markdown links resolve;
- OKF-lite unit tests pass.

In this checkout a push also expects `scripts/smoke.ps1` green on the machine(s)
where the pack is installed — the source of truth always, the links only after
installation.

## Versioning

Rolling updates; tag releases only when a user needs a stable cut. Update
consumers by `git pull` + re-running `scripts/install-user.ps1`.

## Attribution

Skills ported from the personal `tactics` repository (MIT). Do not remove the
attribution note in `README.md`. Third-party material must keep its own
NOTICE entry (e.g. any deepseek-harness-derived skills).