# Alfred — authoring rules

Alfred is my personal, user-level, cross-project skill pack.

## First, decide which kind of request this is

- **Using Alfred's skills:** the skills are installed in the user skill root and
  are triggered by their own `description`. Do not restate trigger conditions
  here. For installing or updating, follow the install and update section of
  [README.md](README.md).
- **Changing Alfred itself** (adding, editing, or removing skills, the installer,
  or scripts): follow the rules below and run `scripts/validate.ps1` when done.

Both kinds share these boundaries: do not commit or push unless the user asks
explicitly, and do not touch untracked files in this checkout that are unrelated
to the skill pack.

Every rule below is a hard constraint for contributors.

## Non-negotiable

1. **Flat only.** A skill is `<skill-name>/SKILL.md` at the repository root.
   Nested skill groups (e.g. `prod/grill-me/SKILL.md`) are invisible to every
   standard discoverer (Cursor, Codex, OpenCode, Claude Code) and are rejected by the
   nesting audit in `scripts/validate.ps1`.
2. **Portable frontmatter.** `SKILL.md` frontmatter contains exactly
   `name` and `description`. No tool-specific fields (`allowed-tools`,
   `argument-hint`, `tools`, …). Tool limits belong in the body.
3. **Progressive disclosure.** Every skill provides, in order:
   Quick Reference → When to use → Workflow → Anti-patterns (recommended) →
   Checklist (recommended).
4. **No project-specific content.** No mention of Godot/Unity/Tactics/investment
   domains, their paths, tools, or OKF scopes. Project
   conventions are parameterized in the skill body or mapped by the project's
   own `AGENTS.md`.
5. **Nothing sensitive or personal.** No tokens, personal data, machine paths,
   or machine-specific usernames.
6. **Scripts live with their skill.** Deterministic, error-prone steps belong in
   scripts inside the skill's own directory (`<skill>/scripts/` or a bundled
   kit), referenced relative to the skill. Judgment stays in `SKILL.md`. Every
   bundled script ships with tests that `scripts/validate.ps1` runs.
7. **Rules are templates.** Portable rules live in `rules/` and are not
   installed; projects copy them into their own `.agents/rules/`. A skill that
   refers to a rule uses a relative path.

## Gate

`scripts/validate.ps1` must be green before any push:

- `quick_validate` per skill when the skill-creator validator is installed
  (`~/.codex/skills/.system/skill-creator/scripts/quick_validate.py`);
- nesting audit (no `SKILL.md` deeper than `<root>/<skill-name>/`);
- local relative markdown links resolve;
- installer tests, OKF-lite unit tests, and bundled Pester suites pass.

In this checkout a push also expects `scripts/smoke.ps1` green on the machine(s)
where the pack is installed — the source of truth always, the links only after
installation.

## Versioning

Rolling updates; tag releases only when a user needs a stable cut. Update
consumers by `git pull` + re-running `scripts/install-user.ps1`.

## Attribution

Skills ported from the personal `tactics` repository (MIT). Do not remove the
attribution note in `README.md`. Third-party material must keep its own
NOTICE entry in `THIRD_PARTY_NOTICES.md`.