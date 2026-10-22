# Architecture

The system has two one-way layers:

1. The `life-knowledge` skill and this kit define generic behavior and deterministic tools.
2. A private file vault stores real personal content.

The kit may copy versioned snapshots into `00_System/managed`. Anything under `00_System/managed/runtime-data/` is not kit-owned: it is excluded from the managed-template tree hash and is preserved by `upgrade`. The kit never reads personal data for publication and never pushes vault content to GitHub. Local machine paths live in a non-synced profile; portable repository URLs and schema versions live in `knowledge-config.json`.
