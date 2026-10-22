# life-knowledge kit

The deterministic tool behind the `life-knowledge` skill: a Windows-first control kit for an Agent-first, file-based personal knowledge base. The kit owns reusable policies, templates, validation, migration and backup tools; personal data remains in a separate local/cloud-synced vault and never flows back to this repository.

## Quick start

```powershell
.\kb.ps1 doctor -VaultPath 'D:\小米云盘\LifeKnowledge' -Quick
.\kb.ps1 init -VaultPath 'D:\小米云盘\LifeKnowledge' -DryRun
.\kb.ps1 init -VaultPath 'D:\小米云盘\LifeKnowledge'
```

All mutating commands support `-DryRun`. Add `-Json` for stable machine-readable output.

Run the Pester 5 suite with `Invoke-Pester -Path ./tests`.

## Security boundary

- The repository must contain only generic code, templates and tests.
- Real medical, family, travel, account and credential data belong only in the private vault.
- `00_System/managed` is kit-owned; project content and `00_System/local` are user-owned.
- The kit never pushes vault content to GitHub.
