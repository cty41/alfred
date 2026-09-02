# knowledge-base-kit

A Windows-first control plane for an Agent-first, file-based personal knowledge base. The kit owns reusable policies, templates, validation, migration and backup tools; personal data remains in a separate local/cloud-synced vault and never flows back to this repository.

## Quick start

```powershell
.\kb.ps1 doctor -VaultPath 'D:\小米云盘\LifeKnowledge' -Quick
.\kb.ps1 init -VaultPath 'D:\小米云盘\LifeKnowledge' -DryRun
.\kb.ps1 init -VaultPath 'D:\小米云盘\LifeKnowledge'
```

All mutating commands support `-DryRun`. Add `-Json` for stable machine-readable output.

## Optional tool collections

A vault may declare portable optional tool collections in `knowledge-config.json`; machine-local checkout paths stay in `~/.config/life-knowledge/profile.json` under `toolCollectionPaths`. `doctor -Json` reports each collection as `available`, `unavailable`, or `unconfigured` with declared intent and entry-point metadata. Collection availability never changes the vault's health state and never exposes the local checkout path in the doctor result.

## Security boundary

- The repository must contain only generic code, templates and tests.
- Real medical, family, travel, account and credential data belong only in the private vault.
- `00_System/managed` is kit-owned; project content and `00_System/local` are user-owned.
- The kit never pushes vault content to GitHub.
