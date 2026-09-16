# mimo-alfred

Project-level installer that places the ALF **skill pack + tool runtime** into a MiMo Desktop project so coding sessions can use `alfred_capabilities` and routing.

Not the ChatGPT OAuth workaround under `.worktrees/mimo-gpt-oauth-plugin`.

## Install

```powershell
# From alfred umbrella (after npm run build:core)
powershell -ExecutionPolicy Bypass -File packages/mimo-alfred/scripts/install-desktop.ps1 `
  -ProjectRoot <path-to-enabled-project> -DryRun

powershell -ExecutionPolicy Bypass -File packages/mimo-alfred/scripts/install-desktop.ps1 `
  -ProjectRoot <path-to-enabled-project>

# Optional: also copy alfred/alf skills to ~/.config/mimocode/skills
# (every coding session may see them — only if you want that)
... -GlobalSkills
```

Requires `<project>/.agents/alfred.json` with `enabled: true`.

Writes under `<project>/.mimocode/{tools,hooks,skills,alfred-lib}` plus `.alfred-install.json` receipt. Does **not** install to `~/.claude/skills`.

Generated routing hook uses `session.userQuery.pre` + `experimental.chat.messages.transform` only (no persona injection).

## Uninstall

```powershell
... -Uninstall
# with -GlobalSkills to also remove global skill copies
```

## Notes

- Persona / preferred-address are disabled in this version.
- Everyday Desktop chat does not load coding-engine tools.
- Set Fin Value paths/tokens in Desktop **Settings → Environment**.
- Upgrade = re-run install (managed files are replaced; previous copies go under `.mimocode/.alfred-backup/`).
