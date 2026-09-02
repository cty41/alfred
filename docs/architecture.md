# Architecture

Alfred is an umbrella control plane, not a monorepo. Git submodules pin independently owned repositories; `alfred.tools.json` declares their role and supported orchestration capabilities.

```text
alfred.ps1
  -> validated manifest + fixed dispatch table
  -> knowledge-base-kit (vault control)
  -> skills (user-level progressive disclosure)
  -> fin-alfred (DSH domain bundle)

LifeKnowledge private vault <- local profile association only
DSH web/headless profiles <- local bundle installation only
```

## Trust boundaries

- The manifest selects only fixed command identifiers. It cannot carry executable command text.
- Portable repository URLs live in public configuration; local paths live outside Git.
- Dry-run is computation only: no fetch, package install, profile write, or submodule change.
- A dirty submodule blocks update. The umbrella never resets or cleans a child checkout.
- Domain tools remain responsible for their own deterministic writes and confirmation policies.

## Runtime routing

The umbrella does not run an LLM. Installed DSH bundles expose tools and skills to full agent presets. Workspace-aware guidance advertises a relevant capability once; full instructions load on demand through the skill catalog. Minimal mode remains intentionally unchanged.
