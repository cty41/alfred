# Fin Value Xiaomi Cloud research archive

## Purpose

Make archived official filings available to Fin Value without putting research binaries or machine paths in Git. On the first relevant Hong Kong equity request, Alfred prompts a read-only status check. An unconfigured user sees an automatically detected Xiaomi Cloud path and enables it with one later-turn confirmation.

## Ownership

- Alfred owns proactive top-level direct-user routing and capability discovery.
- Fin Value owns archive detection, local preferences, source listing/reading, and constrained official-PDF writes.
- Xiaomi Cloud's desktop client owns synchronization. Neither component uses Xiaomi credentials or APIs.
- Git contains implementation and generic conventions only, never filings, local paths, or generated extracts.

## Setup flow

1. `fin_value_research_archive_status` reports `unconfigured`, `ready`, or `degraded` without exposing an absolute path.
2. `fin_value_prepare_research_archive` checks fixed Windows candidates and returns a preview. It performs no write.
3. `fin_value_commit_research_archive` accepts the session-bound, expiring, single-use token only in a later user turn.
4. Commit creates `FinValueResearch/_inbox` and atomically creates platform-local `research-archive.json` with standing authorization for trusted official PDFs.
5. Services read this file on demand, so setup needs no DSH restart.

No candidate means no fallback directory. A missing configured root is degraded and never causes silent relocation.

## Layout

```text
FinValueResearch/
  HKEX/
    0688/
      2025-FY/
        source/
        extracts/
        evidence/
  _inbox/
```

The runtime MVP supports canonical HKEX instruments and periods `YYYY-FY`, `YYYY-H1`, `YYYY-Q1`, and `YYYY-Q3`. Official filenames are deterministic:

```text
<publishedAt>-<documentType>-<language>-<source>.pdf
```

No global manifest or research database is maintained. Listings scan the bounded convention directly. Text reads accept only returned document ids and Markdown/TXT/CSV/JSON; PDFs are retained as originals without OCR.

## Write boundary

The setup confirmation is standing authorization only for adding official PDFs under the confirmed root. The downloader enforces:

- HTTPS with no URL credentials or custom port;
- a compiled exchange/regulator host allowlist;
- public DNS and redirect revalidation;
- timeout, 50 MiB bound, content type and `%PDF-` magic;
- canonical metadata enums and path containment;
- complete temporary write followed by exclusive publication;
- duplicate no-op and conflict without overwrite.

It never authorizes deletion, overwrite, root relocation, arbitrary web downloads, investment strategy persistence, ledger changes, or broker actions. Path validation covers untrusted model/URL inputs and symlinks or junctions present before an operation. A malicious same-account process deliberately racing directory-entry replacement is already inside the local-data trust boundary and is not treated as an OS-isolation guarantee; detected identity changes fail, but that excluded race may already have filesystem side effects. Archive failure is a separate degraded persistence result and does not fabricate or invalidate research evidence.

## ALF routing

`investment-research-archive` is separate from read-only `hk-equity-research` and is declared `confirm-before-write`. On the first matched request in each top-level user session, routing requires status first. Ready state continues silently; unconfigured state permits only prepare and a displayed preview. Capability suggestions never authorize commit.

## Non-goals

- Xiaomi API integration or upload-state claims.
- GitHub/LFS research corpus, global manifest, OCR, full-text index, or vector database.
- Automatic scanning of arbitrary machine directories.
- Automatic archive deletion, overwrite, or non-official rating/news caches.
- A-share runtime research support or a Web settings panel in this release.
