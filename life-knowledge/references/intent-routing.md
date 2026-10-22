# Intent routing

## Vault operation routing

| User intent | Kit operation | Confirmation |
|---|---|---|
| Check status | `doctor` | None; read-only |
| Detect sensitive content | `scan-private` | None; read-only |
| Initialize association | `init -DryRun`, then `init` | Confirm after preview |
| Create a project | `new-project -DryRun`, then apply | Confirm after preview |
| Ingest a reviewed file | `ingest -DryRun`, then apply | Confirm after preview |
| Archive a project | `archive -DryRun`, then apply | Confirm move |
| Upgrade managed rules | `upgrade -DryRun`, then apply | Confirm managed changes |
| Create backup | `backup -DryRun`, then apply | Confirm destination |
| Delete, overwrite or publish | Dedicated safe operation only | Separate explicit confirmation |

If no kit operation matches, produce a reviewed Markdown draft and ask before writing; do not invent a hidden mutation path.
