#!/usr/bin/env python3
"""Detect repository worktree changes that affect OKF catalog scopes.

OKF-lite keeps the original report/sync behaviour while removing every
repository-specific assumption: no fixed tactics paths or asset suffixes
(suffix companions are configured per repo through the catalog map), no
project-owned scope vocabulary (scopes come entirely from the repo's own
catalog-scopes.yaml), and a configurable bundle root.
"""

from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import os
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from okf_yaml import YamlParseError, safe_load


DEFAULT_BUNDLE = Path(".agents/knowledge")


@dataclass(frozen=True)
class ScopeConfig:
    concept: str
    paths: tuple[str, ...]


@dataclass(frozen=True)
class CatalogConfig:
    tracked_roots: tuple[str, ...]
    ignored_paths: tuple[str, ...]
    companion_suffixes: tuple[str, ...]
    scopes: dict[str, ScopeConfig]


def default_bundle_arg() -> Path:
    value = os.environ.get("OKF_BUNDLE")
    return Path(value) if value else DEFAULT_BUNDLE


def resolve_bundle(repo_root: Path, bundle_arg: Path | None) -> Path:
    bundle = bundle_arg if bundle_arg is not None else default_bundle_arg()
    return bundle if bundle.is_absolute() else repo_root / bundle


def normalize_path(value: str) -> str:
    normalized = value.replace("\\", "/").strip()
    while normalized.startswith("./"):
        normalized = normalized[2:]
    return normalized.lstrip("/")


def path_matches(path: str, pattern: str, companion_suffixes: tuple[str, ...] = ()) -> bool:
    """Match a path against a scope pattern, honouring companion suffixes.

    ``companion_suffixes`` (e.g. ``.meta`` for Unity or ``.import`` for godot
    repositories) lets a file inherit the mapping of the asset it accompanies.
    """
    normalized_path = normalize_path(path)
    normalized_pattern = normalize_path(pattern).rstrip("/")
    if not normalized_pattern:
        return False
    candidates = [normalized_path]
    for suffix in companion_suffixes:
        if suffix and normalized_path.endswith(suffix):
            candidates.append(normalized_path[: -len(suffix)])
    if any(character in normalized_pattern for character in "*?["):
        return any(fnmatch.fnmatchcase(candidate, normalized_pattern) for candidate in candidates)
    return any(
        candidate == normalized_pattern or candidate.startswith(f"{normalized_pattern}/")
        for candidate in candidates
    )


def load_catalog(path: Path) -> CatalogConfig:
    try:
        payload = safe_load(path.read_text(encoding="utf-8")) or {}
    except (OSError, UnicodeDecodeError, YamlParseError) as exc:
        raise ValueError(f"{path}: 无法解析 catalog: {exc}") from exc
    if not isinstance(payload, dict) or payload.get("version") != 1:
        raise ValueError(f"{path}: catalog version 必须是 1")

    raw_scopes = payload.get("scopes")
    if not isinstance(raw_scopes, dict):
        raise ValueError(f"{path}: scopes 必须是 YAML mapping")

    scopes: dict[str, ScopeConfig] = {}
    for raw_scope, raw_config in raw_scopes.items():
        if not isinstance(raw_scope, str) or not isinstance(raw_config, dict):
            raise ValueError(f"{path}: scope 配置无效：{raw_scope!r}")
        concept = raw_config.get("concept")
        patterns = raw_config.get("paths")
        if not isinstance(concept, str) or not concept.strip():
            raise ValueError(f"{path}: {raw_scope}.concept 必须是非空字符串")
        if not isinstance(patterns, list) or not patterns or any(not isinstance(item, str) for item in patterns):
            raise ValueError(f"{path}: {raw_scope}.paths 必须是非空字符串列表")
        scopes[raw_scope] = ScopeConfig(
            concept=normalize_path(concept),
            paths=tuple(normalize_path(item) for item in patterns),
        )

    def string_tuple(field: str) -> tuple[str, ...]:
        value = payload.get(field, [])
        if not isinstance(value, list) or any(not isinstance(item, str) for item in value):
            raise ValueError(f"{path}: {field} 必须是字符串列表")
        return tuple(normalize_path(item) for item in value)

    companion_suffixes: tuple[str, ...] = ()
    raw_suffixes = payload.get("companion_suffixes")
    if raw_suffixes is not None:
        if not isinstance(raw_suffixes, list) or any(
            not isinstance(item, str) or not item.strip() for item in raw_suffixes
        ):
            raise ValueError(f"{path}: companion_suffixes 必须是字符串列表")
        suffixes = tuple(item.strip() for item in raw_suffixes)
        if any(not suffix.startswith(".") or "/" in suffix for suffix in suffixes):
            raise ValueError(f"{path}: companion_suffixes 必须是 '.ext' 形式的扩展名")
        companion_suffixes = suffixes

    return CatalogConfig(
        tracked_roots=string_tuple("tracked_roots"),
        ignored_paths=string_tuple("ignored_paths"),
        companion_suffixes=companion_suffixes,
        scopes=scopes,
    )


def _git_paths(repo_root: Path, arguments: list[str]) -> set[str]:
    result = subprocess.run(
        ["git", *arguments],
        cwd=repo_root,
        check=True,
        capture_output=True,
    )
    return {
        normalize_path(raw.decode("utf-8", errors="surrogateescape"))
        for raw in result.stdout.split(b"\0")
        if raw
    }


def changed_worktree_paths(repo_root: Path) -> list[str]:
    tracked = _git_paths(repo_root, ["diff", "--name-only", "--no-renames", "-z", "HEAD"])
    untracked = _git_paths(repo_root, ["ls-files", "--others", "--exclude-standard", "-z"])
    return sorted(tracked | untracked)


def impacts_for_paths(
    config: CatalogConfig,
    paths: list[str],
) -> tuple[dict[str, list[str]], list[str]]:
    impacts: dict[str, list[str]] = {}
    unmapped: list[str] = []
    for raw_path in paths:
        path = normalize_path(raw_path)
        if any(path_matches(path, pattern, config.companion_suffixes) for pattern in config.ignored_paths):
            continue
        matched_scopes = [
            scope
            for scope, scope_config in config.scopes.items()
            if any(path_matches(path, pattern, config.companion_suffixes) for pattern in scope_config.paths)
        ]
        for scope in matched_scopes:
            impacts.setdefault(scope, []).append(path)
        if (
            not matched_scopes
            and any(path_matches(path, root, config.companion_suffixes) for root in config.tracked_roots)
        ):
            unmapped.append(path)
    return impacts, unmapped


def _repo_files(repo_root: Path) -> list[str]:
    paths = _git_paths(repo_root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"])
    return sorted(path for path in paths if (repo_root / path).is_file())


def source_fingerprint(repo_root: Path, scope: str, config: CatalogConfig) -> str:
    scope_config = config.scopes[scope]
    digest = hashlib.sha256()
    digest.update(b"okf-lite-source-v1\0")
    digest.update(scope.encode("utf-8"))
    for pattern in sorted(scope_config.paths):
        digest.update(b"\0pattern\0")
        digest.update(pattern.encode("utf-8"))
    for path in _repo_files(repo_root):
        if not any(path_matches(path, pattern, config.companion_suffixes) for pattern in scope_config.paths):
            continue
        content = (repo_root / path).read_bytes()
        digest.update(b"\0file\0")
        digest.update(path.encode("utf-8"))
        digest.update(b"\0")
        digest.update(hashlib.sha256(content).digest())
    return f"sha256:{digest.hexdigest()}"


def update_concept_frontmatter(path: Path, timestamp: str, fingerprint: str) -> bool:
    original = path.read_text(encoding="utf-8")
    if original.startswith("\ufeff"):
        original = original[1:]
    lines = original.splitlines(keepends=True)
    if not lines or lines[0].strip() != "---":
        raise ValueError(f"{path}: 缺少 YAML frontmatter")
    end_index = next((index for index in range(1, len(lines)) if lines[index].strip() == "---"), None)
    if end_index is None:
        raise ValueError(f"{path}: frontmatter 缺少结束分隔符")

    current_fingerprint = next(
        (
            line.split(":", 1)[1].strip()
            for line in lines[1:end_index]
            if line.split(":", 1)[0].strip() == "source_fingerprint"
        ),
        None,
    )
    if current_fingerprint == fingerprint:
        return False

    replacements = {
        "timestamp": f'timestamp: "{timestamp}"\n',
        "source_fingerprint": f"source_fingerprint: {fingerprint}\n",
    }
    found: set[str] = set()
    for index in range(1, end_index):
        key = lines[index].split(":", 1)[0].strip()
        if key in replacements:
            newline = "\r\n" if lines[index].endswith("\r\n") else "\n"
            lines[index] = replacements[key].replace("\n", newline)
            found.add(key)
    for key in ("timestamp", "source_fingerprint"):
        if key not in found:
            lines.insert(end_index, replacements[key])
            end_index += 1

    updated = "".join(lines)
    if updated == original:
        return False
    path.write_text(updated, encoding="utf-8", newline="")
    return True


def update_log(path: Path, timestamp: str, fingerprints: dict[str, str]) -> bool:
    original = path.read_text(encoding="utf-8")
    if original.startswith("\ufeff"):
        original = original[1:]
    date_heading = f"## {timestamp[:10]}"
    additions = [
        f"* **Sync**: `{scope}` 已同步到来源指纹 `{fingerprint}`。"
        for scope, fingerprint in sorted(fingerprints.items())
    ]
    lines = original.splitlines()
    try:
        heading_index = lines.index(date_heading)
    except ValueError:
        title_index = next((index for index, line in enumerate(lines) if line.startswith("# ")), 0)
        insert_at = title_index + 1
        lines[insert_at:insert_at] = ["", date_heading, *additions]
    else:
        section_end = next(
            (index for index in range(heading_index + 1, len(lines)) if lines[index].startswith("## ")),
            len(lines),
        )
        prefixes = tuple(f"* **Sync**: `{scope}` " for scope in fingerprints)
        section = [
            line
            for line in lines[heading_index + 1:section_end]
            if not line.startswith(prefixes)
        ]
        lines[heading_index + 1:section_end] = [*additions, *section]
    updated = "\n".join(lines).rstrip() + "\n"
    if updated == original:
        return False
    path.write_text(updated, encoding="utf-8")
    return True


def _payload(config: CatalogConfig, paths: list[str]) -> dict[str, object]:
    impacts, unmapped = impacts_for_paths(config, paths)
    return {
        "changed_paths": paths,
        "affected_scopes": [
            {
                "catalog_scope": scope,
                "concept": config.scopes[scope].concept,
                "changed_paths": scope_paths,
            }
            for scope, scope_paths in sorted(impacts.items())
        ],
        "unmapped_paths": unmapped,
    }


def _print_report(payload: dict[str, object], output_format: str) -> None:
    if output_format == "json":
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return
    affected = payload["affected_scopes"]
    unmapped = payload["unmapped_paths"]
    print(f"OKF_IMPACT scopes={len(affected)} unmapped={len(unmapped)}")
    for item in affected:
        print(f"- {item['catalog_scope']} -> {item['concept']}")
        for path in item["changed_paths"]:
            print(f"  - {path}")
    if unmapped:
        print("UNMAPPED_TRACKED_PATHS")
        for path in unmapped:
            print(f"- {path}")


def main() -> int:
    parser = argparse.ArgumentParser(description="检测工作区改动对 OKF catalog_scope 的影响")
    parser.add_argument("--repo-root", type=Path, default=Path.cwd())
    parser.add_argument("--bundle", type=Path, default=None, help="bundle 根目录(默认 <repo>/.agents/knowledge,可用 OKF_BUNDLE 环境变量覆盖)")
    subparsers = parser.add_subparsers(dest="command", required=True)

    report_parser = subparsers.add_parser("report", help="报告 worktree 中受影响的 catalog_scope")
    report_parser.add_argument("--worktree", action="store_true", required=True)
    report_parser.add_argument("--format", choices=("text", "json"), default="text")
    report_parser.add_argument("--strict-unmapped", action="store_true")

    sync_parser = subparsers.add_parser("sync", help="同步受影响概念的元数据与根日志")
    sync_parser.add_argument("--worktree", action="store_true", required=True)
    sync_parser.add_argument(
        "--scope",
        action="append",
        required=True,
        help="只同步本任务实际影响的 scope；可重复传入",
    )
    sync_parser.add_argument("--write", action="store_true")

    args = parser.parse_args()
    repo_root = args.repo_root.resolve()
    bundle_root = resolve_bundle(repo_root, args.bundle)
    catalog_path = bundle_root / "catalog-scopes.yaml"
    try:
        config = load_catalog(catalog_path)
        changed_paths = changed_worktree_paths(repo_root)
    except (OSError, ValueError, subprocess.CalledProcessError) as exc:
        print(f"OKF_IMPACT_FAILED: {exc}")
        return 1

    payload = _payload(config, changed_paths)
    if args.command == "report":
        _print_report(payload, args.format)
        return 1 if args.strict_unmapped and payload["unmapped_paths"] else 0

    selected_scopes = set(args.scope)
    unknown_scopes = sorted(selected_scopes - config.scopes.keys())
    if unknown_scopes:
        print(f"OKF_SYNC_FAILED unknown_scopes={','.join(unknown_scopes)}")
        return 1
    if not selected_scopes:
        print("OKF_SYNC_OK scopes=0 changed_files=0")
        return 0

    fingerprints = {
        scope: source_fingerprint(repo_root, scope, config)
        for scope in sorted(selected_scopes)
    }
    if not args.write:
        for scope, fingerprint in fingerprints.items():
            print(f"{scope} {fingerprint} {config.scopes[scope].concept}")
        print("OKF_SYNC_PREVIEW use --write to update concepts and log")
        return 0

    timestamp = datetime.now().astimezone().isoformat(timespec="seconds")
    changed_files: list[str] = []
    try:
        for scope, fingerprint in fingerprints.items():
            concept_path = bundle_root / config.scopes[scope].concept
            if update_concept_frontmatter(concept_path, timestamp, fingerprint):
                changed_files.append(concept_path.relative_to(repo_root).as_posix())
        log_path = bundle_root / "log.md"
        if update_log(log_path, timestamp, fingerprints):
            changed_files.append(log_path.relative_to(repo_root).as_posix())
    except (OSError, ValueError) as exc:
        print(f"OKF_SYNC_FAILED: {exc}")
        return 1

    print(f"OKF_SYNC_OK scopes={len(selected_scopes)} changed_files={len(changed_files)}")
    for path in changed_files:
        print(f"- {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())