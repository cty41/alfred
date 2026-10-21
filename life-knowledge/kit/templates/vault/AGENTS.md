# Vault Agent Instructions

## Session bootstrap

On the first relevant request in a session, run a read-only quick doctor. Continue silently when healthy. If configuration is missing or degraded, ask whether to configure now, answer first and configure later, or suppress reminders for this session.

## Rule order

1. Read `00_System/managed/policies/base-agent-rules.md`.
2. Read `00_System/local/local-rules.md` when present.
3. Read the nearest project `AGENTS.md`.
4. More specific rules may tighten but not weaken privacy and safety requirements.
