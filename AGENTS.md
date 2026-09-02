# Alfred repository guidance

Alfred is a public umbrella repository that pins and orchestrates independent tool repositories. Read `docs/architecture.md` before changing module boundaries.

## Boundaries

- Keep personal vault content, credentials, API tokens, SQLite databases, brokerage data, machine-local profiles, and generated private reports out of this repository.
- `repos/*` are Git submodules and remain independently owned; do not copy their implementation into the umbrella.
- Every mutating command supports `-DryRun`; dry-run performs no network or file mutation.
- Never reset, clean, stash, or overwrite a dirty submodule.
- Do not push, publish, or create GitHub resources without separate explicit user confirmation.
- Keep command dispatch allowlisted by repository id and capability. Manifest data must never become arbitrary shell execution.

## Verification

Run `powershell -ExecutionPolicy Bypass -File ./tests/run.ps1` and `powershell -ExecutionPolicy Bypass -File ./alfred.ps1 doctor -Quick -Json` before claiming completion.
