# Intent routing

## Optional collection routing

Use only collection metadata reported by the control kit. Treat declared intent hints as routing evidence, not permission to bypass the target capability's own workflow.

| Match state | Route |
|---|---|
| Matching collection is available | Invoke its advertised skill or tool entry point for the domain portion of the request |
| Matching collection is configured but unavailable | Offer the reported recovery action once per conversation, then use an ordinary-answer fallback |
| Matching collection is not configured or not reported | Continue with available general capabilities; do not guess an integration |
| Multiple available collections match | Choose the narrowest declared intent match, or ask one concise routing question if ambiguity changes the result |

Collection routing precedes generic vault drafting for the domain portion of a request. The selected capability owns its confirmations and mutations. Vault operations below still apply when the user also asks to retain or organize the result.

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
