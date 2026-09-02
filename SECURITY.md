# Security

Alfred is a public control repository. Report security issues privately to the repository owner.

Never commit personal vault files, API keys, credentials, brokerage identifiers, SQLite databases, local DSH profile overlays, or machine-specific configuration. Submodule repositories retain their own security policies. Tool metadata is untrusted until it passes the local manifest allowlist and path-containment checks. Dry-run output must redact secret-like values and must not read personal vault content.
