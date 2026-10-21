# Ownership boundary

Kit-owned: `00_System/managed/**` and generated reports.

User-owned: root entry documents, `00_System/local/**`, Projects, Areas, Resources and Archive.

Upgrade stops on managed drift and must never overwrite user-owned content.
