# Architecture

The system has two one-way layers:

1. `knowledge-base-kit` and the public skill repository define generic behavior and deterministic tools.
2. A private file vault stores real personal content.

The kit may copy versioned snapshots into `00_System/managed`. It never reads personal data for publication and never pushes vault content to GitHub. Local machine paths live in a non-synced profile; portable repository URLs and schema versions live in `knowledge-config.json`.
