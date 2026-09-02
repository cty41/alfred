# Alfred

Alfred is a public umbrella repository for a local, agent-first personal tool stack. It pins independent repositories and provides one dry-run-first command surface without mixing private LifeKnowledge data into Git.

## Included repositories

- `knowledge-base-kit` — deterministic private-vault control plane
- `skills` — user-level reusable agent skills
- `fin-alfred` — local-first DSH investment research capability

## Clone

```powershell
git clone --recurse-submodules https://github.com/cty41/alfred.git
cd alfred
powershell -ExecutionPolicy Bypass -File ./alfred.ps1 doctor -Quick
```

A clone without submodules can run:

```powershell
powershell -ExecutionPolicy Bypass -File ./alfred.ps1 bootstrap -DryRun -Json
powershell -ExecutionPolicy Bypass -File ./alfred.ps1 bootstrap
```

## Commands

```powershell
powershell -ExecutionPolicy Bypass -File ./alfred.ps1 doctor -Quick -Json
powershell -ExecutionPolicy Bypass -File ./alfred.ps1 bootstrap -DryRun -Json
powershell -ExecutionPolicy Bypass -File ./alfred.ps1 install -Profile all -ActivationRoot 'D:\path\to\LifeKnowledge' -DshCheckout 'D:\path\to\deepseek-harness' -DryRun -Json
powershell -ExecutionPolicy Bypass -File ./alfred.ps1 install -Profile all -ActivationRoot 'D:\path\to\LifeKnowledge' -DshCheckout 'D:\path\to\deepseek-harness'
powershell -ExecutionPolicy Bypass -File ./alfred.ps1 update -DryRun -Json
```

`install -Profile all` targets DSH Web and Headless. Real installation invokes the child repositories' owned installers. Tushare and model credentials remain in environment/DSH credential storage and are never written here.

## Safety

Every mutating command supports `-DryRun`. Update refuses dirty submodules. The public repository contains no personal vault content, local profile, database, token, or brokerage data. GitHub publication is a separate operator action.

See [`docs/architecture.md`](docs/architecture.md) and [`SECURITY.md`](SECURITY.md).
