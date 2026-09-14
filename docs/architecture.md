# Architecture

The system has two one-way layers:

1. `knowledge-base-kit` and the public skill repository define generic behavior and deterministic tools.
2. A private file vault stores real personal content.

The kit may copy versioned snapshots into `00_System/managed`. Dynamic private integration data belongs under `00_System/managed/runtime-data/<application-id>` and is excluded from the immutable managed-template tree hash; doctor validates that subtree separately. The owning application remains responsible for its data schema, integrity, and restore semantics. The kit never reads personal data for publication and never pushes vault content to GitHub. Local machine paths live in a non-synced profile; portable repository URLs and schema versions live in `knowledge-config.json`.

Optional tool collections preserve the same split: the vault may declare a public repository URL, intent hints, and skill/tool entry points, while `toolCollectionPaths` remains machine-local. Doctor reports collection capability separately from vault health, so a missing optional checkout cannot degrade an otherwise healthy knowledge base.

The generic `capability-status` interface is a narrower integration boundary than doctor. It reads only the local profile, the vault configuration file, and declared collection directory existence; it does not recurse or use the network. Its output contains no vault or local checkout paths and limits collections to identifiers plus coarse states. Runtime entry points are explicitly `not-assessed`, so directory availability is never presented as runtime loading or activation.
