# Architecture

The system has two one-way layers:

1. `knowledge-base-kit` and the public skill repository define generic behavior and deterministic tools.
2. A private file vault stores real personal content.

The kit may copy versioned snapshots into `00_System/managed`. It never reads personal data for publication and never pushes vault content to GitHub. Local machine paths live in a non-synced profile; portable repository URLs and schema versions live in `knowledge-config.json`.

Optional tool collections preserve the same split: the vault may declare a public repository URL, intent hints, and skill/tool entry points, while `toolCollectionPaths` remains machine-local. Doctor reports collection capability separately from vault health, so a missing optional checkout cannot degrade an otherwise healthy knowledge base.
