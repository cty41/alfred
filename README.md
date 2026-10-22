# Alfred

My personal agent skill pack: the everyday skills I want available in every
project and every agent. Like Batman's butler, Alfred is not a place you go to;
it is installed once and is at hand everywhere.

## 中文简介

Alfred 是我常用 Skill 的总集合(公共仓库 `cty41/alfred`,MIT)。所有 Skill 平铺在
仓库根目录(`<技能名>/SKILL.md`),通过 `scripts/install-user.ps1` 链接到
`~/.agents/skills`(Cursor、Codex、OpenCode)和 `~/.claude/skills`(Claude Code),
之后在**任何项目**里都能用。是否调用某个 Skill 只取决于它 frontmatter 里的
`description`,没有额外的路由或激活层。

需要确定性执行逻辑的 Skill 把脚本放在自己的目录里,例如
`life-knowledge/kit/`(个人知识库控制工具)和 `audio-transcribe/scripts/`(本地转写)。

## Skills

| Skill | Purpose |
| --- | --- |
| `audio-transcribe` | Transcribe a local recording with faster-whisper, proofread it, and deliver a full-text translation |
| `brainstorming` | Explore a vague request into a confirmed design before implementation |
| `eli5` | Explain a topic for a named audience |
| `grill-me` | Entry point for explicit "grill me" requests |
| `grilling` | Interview engine that stress-tests a plan or design |
| `knowledge-maintenance` | Query/ingest/supersede the cross-system knowledge index (OKF-lite) |
| `life-knowledge` | Bootstrap and maintain a private life-knowledge vault through its bundled kit |
| `make-dev-plan` | Deprecated; redirects to `plan-plain` |
| `manual-qa-handoff` | Maintain the manual-acceptance ledger after automated gates pass |
| `plan-mode-plan-writer` | Deprecated; redirects to `plan-plain` |
| `plan-plain` | Generate/land an executable plan with a plain-language section |
| `project-doc-organization` | Keep docs/plans/knowledge short, current, discoverable |
| `skill-writing` | Progressive-disclosure profile for authoring skills |

Portable rules (not skills) live in `rules/`. Shared tools live in `tools/`.

## Install and update

```powershell
git clone git@github.com:cty41/alfred.git D:\codes\alfred
powershell -ExecutionPolicy Bypass -File D:\codes\alfred\scripts\install-user.ps1
```

By default the installer links into `~/.agents/skills` only (Cursor, Codex,
OpenCode). Cursor also reads `~/.claude/skills`, so Claude Code is opt-in to
avoid duplicate skills:

```powershell
powershell -ExecutionPolicy Bypass -File D:\codes\alfred\scripts\install-user.ps1 -IncludeClaude
```

Update with `git pull`, then re-run the installer. The installer is idempotent:
it keeps correct links, repairs or prunes links that point into this checkout,
and never replaces real directories or links owned by another checkout. Use
`-DryRun -Json` to preview, `-Remove` to uninstall (add `-IncludeClaude` when
removing Claude-root links), and `-Scope Project -ProjectRoot <path>` to install
into `<project>/.agents/skills` only.

Skill-specific prerequisites:

- `audio-transcribe`: `uv` and `ffmpeg` on PATH.
- `life-knowledge`: Windows PowerShell; the vault path is resolved from
  `~/.config/life-knowledge/profile.json` or asked for on first use.

## Self-test

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\validate.ps1   # repository health
powershell -ExecutionPolicy Bypass -File .\scripts\smoke.ps1      # installed state
```

`validate.ps1` runs the nesting audit, per-skill `quick_validate` when available,
markdown link checks, installer tests, OKF-lite tests, and the Pester suites
bundled with skills (requires Pester 5).

## Authoring rules

See [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE). Skills ported from the personal project `tactics`; third-party
attributions are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
