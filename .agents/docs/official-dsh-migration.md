# Official DSH migration and rollback

This runbook switches the existing Web profile from the source-built DSH launcher to the pinned official `@deepseek-ai/dsh@0.1.5-rc.2` launcher. Run it from an independent terminal, never from the DSH process being stopped.

## Preconditions

1. Commit or otherwise preserve the Alfred root and the Fin Value submodule changes. Do not reset, clean, or stash dirty repositories.
2. Confirm no headless or other DSH profile is running.
3. Run:

```powershell
powershell -ExecutionPolicy Bypass -File ./tests/run.ps1
powershell -ExecutionPolicy Bypass -File ./alfred.ps1 doctor -Quick -Json
powershell -ExecutionPolicy Bypass -File ./alfred.ps1 install -Profile web -DryRun -Json
powershell -ExecutionPolicy Bypass -File ./scripts/upgrade-and-restart-dsh.ps1 -DryRun -Json
```

4. Copy the current profile control files to a private backup directory outside Git. Preserve `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, and `cordis.patch.yml` from each affected profile. Do not print profile configuration values or secrets.

## Third-party compatibility result

The isolated official rc.2 startup passed with ALF, plain Fin Value, Mermaid, mobile fix, read-image-view, subagent-codex, and the local dsh-codex bundle. The machine-local custom `dsh-task-notify` 1.0.0 initially failed because it imported scoped Cordis/Schemastery packages without declaring them as runtime dependencies. Its installed package was backed up, the two fixed rc.2-compatible runtime dependencies were declared and installed, and a separate official rc.2 Web profile was then used to verify startup. Retain that machine-local backup until post-switch UI acceptance is complete.

## Switch

From the independent terminal:

```powershell
powershell -ExecutionPolicy Bypass -File ./scripts/upgrade-and-restart-dsh.ps1
```

Type the exact confirmation `YES`. With no `-DshCheckout`, the script installs through and restarts with pinned official DSH `0.1.5-rc.2`. `-DshCheckout` remains an explicit development/rollback override.

Expected Web profile shape:

- dependencies include `dsh-alfred` and plain `dsh-fin-value`;
- active bundles include `dsh-alfred` but not `dsh-fin-value`;
- no `inactiveBundles` feature is required;
- the composed config contains `dsh-alfred/bootstrap` and no profile-wide Fin Value row.

## Acceptance after refresh

1. Open the existing Web URL and create a non-Minimal session in an ALF-enabled project.
2. Ask for ALF capabilities. Fin Value should report installed and eligible but inactive before use.
3. Ask `查询腾讯港股行情`. The same user turn should call `alfred_activate`, then expose `fin_value_*` tools on the following model step.
4. Create an unrelated Agent and confirm Fin Value tools are absent until separately authorized.
5. Confirm Minimal remains excluded and no new `alfred/*` session event is written.
6. Verify Mermaid, mobile fix, image-view, subagent-codex, and dsh-codex behavior relevant to the profile. Automated startup/config composition is not a substitute for this UI acceptance.

## Rollback

1. Stop only the matching official DSH Web process from an independent terminal.
2. Restore the backed-up profile control files atomically while profiles are stopped.
3. Launch the retained source checkout explicitly:

```powershell
powershell -ExecutionPolicy Bypass -File ./scripts/start-dsh-web.ps1 `
  -DshCheckout 'D:\path\to\deepseek-harness'
```

4. Refresh the existing Web URL and repeat the basic session/plugin checks. Do not rewrite session histories, databases, receipts, or confirmation tokens during launcher rollback.
