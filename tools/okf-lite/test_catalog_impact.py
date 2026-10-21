from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from catalog_impact import (
    CatalogConfig,
    ScopeConfig,
    impacts_for_paths,
    path_matches,
    source_fingerprint,
    update_concept_frontmatter,
    update_log,
)


class CatalogImpactTests(unittest.TestCase):
    def setUp(self) -> None:
        self.config = CatalogConfig(
            tracked_roots=("src", "docs"),
            ignored_paths=("src/generated",),
            companion_suffixes=(".companion",),
            scopes={
                "core": ScopeConfig(
                    concept="systems/core.md",
                    paths=("src/core",),
                ),
                "docs": ScopeConfig(
                    concept="guides/docs.md",
                    paths=("docs/guides",),
                ),
                "plans": ScopeConfig(
                    concept="plans/milestone.md",
                    paths=("docs/guides",),
                ),
            },
        )

    def test_directory_pattern_matches_descendants(self) -> None:
        self.assertTrue(path_matches("src/core/logic.py", "src/core"))
        self.assertFalse(path_matches("src/common/logic.py", "src/core"))

    def test_companion_suffix_inherits_mapping(self) -> None:
        # With the configured companion suffix a sibling file maps like its
        # main asset; without any companion suffixes no implicit mapping exists.
        self.assertTrue(
            path_matches("src/core/logic.py.companion", "src/core", (".companion",))
        )
        self.assertTrue(
            path_matches("src/common/UI.py.companion", "src/common/UI.py", (".companion",))
        )
        self.assertFalse(path_matches("src/common/UI.py.meta", "src/common/UI.py"))

    def test_shared_path_maps_to_multiple_scopes(self) -> None:
        impacts, unmapped = impacts_for_paths(
            self.config,
            ["docs/guides/user-guide.md"],
        )
        self.assertEqual({"docs", "plans"}, set(impacts))
        self.assertEqual([], unmapped)

    def test_unmapped_tracked_path_is_reported(self) -> None:
        impacts, unmapped = impacts_for_paths(
            self.config,
            ["src/newfeature/newfeature.py"],
        )
        self.assertEqual({}, impacts)
        self.assertEqual(["src/newfeature/newfeature.py"], unmapped)

    def test_ignored_path_is_not_reported(self) -> None:
        impacts, unmapped = impacts_for_paths(
            self.config,
            ["src/generated/cache.bin"],
        )
        self.assertEqual({}, impacts)
        self.assertEqual([], unmapped)

    def test_frontmatter_sync_preserves_body_and_is_idempotent(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            concept = Path(temporary) / "concept.md"
            concept.write_text(
                "---\ntype: System\ntimestamp: old\n---\n\n# Body\n\nKeep me.\n",
                encoding="utf-8",
            )
            fingerprint = "sha256:" + "a" * 64
            self.assertTrue(update_concept_frontmatter(concept, "2026-07-14T12:00:00+08:00", fingerprint))
            updated = concept.read_text(encoding="utf-8")
            self.assertIn(f"source_fingerprint: {fingerprint}", updated)
            self.assertIn("# Body\n\nKeep me.", updated)
            self.assertFalse(update_concept_frontmatter(concept, "2026-07-15T12:00:00+08:00", fingerprint))

    def test_log_sync_is_idempotent(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            log = Path(temporary) / "log.md"
            log.write_text("# Log\n\n## 2026-07-14\n* **Creation**: Initial.\n", encoding="utf-8")
            fingerprints = {"core": "sha256:" + "b" * 64}
            self.assertTrue(update_log(log, "2026-07-14T12:00:00+08:00", fingerprints))
            self.assertFalse(update_log(log, "2026-07-14T12:00:00+08:00", fingerprints))
            fingerprints = {"core": "sha256:" + "c" * 64}
            self.assertTrue(update_log(log, "2026-07-14T13:00:00+08:00", fingerprints))
            self.assertEqual(1, log.read_text(encoding="utf-8").count(fingerprints["core"]))
            self.assertEqual(1, log.read_text(encoding="utf-8").count("* **Sync**: `core`"))

    def test_source_fingerprint_changes_with_source_content(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo_root = Path(temporary)
            source = repo_root / "src" / "core" / "core.py"
            source.parent.mkdir(parents=True)
            source.write_text("first", encoding="utf-8")
            import subprocess

            subprocess.run(["git", "init", "--quiet"], cwd=repo_root, check=True)
            subprocess.run(["git", "add", "."], cwd=repo_root, check=True)
            first = source_fingerprint(repo_root, "core", self.config)
            source.write_text("second", encoding="utf-8")
            second = source_fingerprint(repo_root, "core", self.config)
            self.assertNotEqual(first, second)


if __name__ == "__main__":
    unittest.main()