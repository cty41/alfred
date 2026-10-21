from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from validate_bundle import validate_bundle


VALID_FRONTMATTER = """---
type: System
title: Test System
description: Test system description.
timestamp: 2026-07-14T00:00:00+08:00
status: active
catalog_scope: test-system
repo_paths: [source.txt]
source_fingerprint: sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
---

"""


class ValidateBundleTests(unittest.TestCase):
    def create_bundle(self) -> tuple[tempfile.TemporaryDirectory[str], Path, Path]:
        temporary = tempfile.TemporaryDirectory()
        repo_root = Path(temporary.name)
        bundle = repo_root / ".agents" / "knowledge"
        systems = bundle / "systems"
        systems.mkdir(parents=True)
        (repo_root / "source.txt").write_text("source", encoding="utf-8")
        (bundle / "index.md").write_text(
            "---\nokf_version: '0.1'\nprofile: '0.2'\n---\n\n"
            "# Bundle\n\n* [Systems](systems/index.md) - Systems.\n",
            encoding="utf-8",
        )
        (bundle / "log.md").write_text(
            "# Update Log\n\n## 2026-07-14\n* **Creation**: Created bundle.\n",
            encoding="utf-8",
        )
        (systems / "index.md").write_text(
            "# Systems\n\n* [Test System](test.md) - Test system description.\n",
            encoding="utf-8",
        )
        (systems / "test.md").write_text(VALID_FRONTMATTER + "# Summary\n\nValid.\n", encoding="utf-8")
        (bundle / "catalog-scopes.yaml").write_text(
            "version: 1\n"
            "tracked_roots: [source.txt]\n"
            "ignored_paths: [.agents/knowledge]\n"
            "scopes:\n"
            "  test-system:\n"
            "    concept: systems/test.md\n"
            "    paths: [source.txt]\n",
            encoding="utf-8",
        )
        return temporary, repo_root, bundle

    def test_valid_bundle_passes(self) -> None:
        temporary, repo_root, bundle = self.create_bundle()
        with temporary:
            self.assertEqual([], validate_bundle(bundle, repo_root))

    def test_missing_required_field_fails(self) -> None:
        temporary, repo_root, bundle = self.create_bundle()
        with temporary:
            concept = bundle / "systems" / "test.md"
            concept.write_text(concept.read_text(encoding="utf-8").replace("title: Test System\n", ""), encoding="utf-8")
            errors = validate_bundle(bundle, repo_root)
            self.assertTrue(any("必填字段 title" in error for error in errors))

    def test_broken_internal_link_fails(self) -> None:
        temporary, repo_root, bundle = self.create_bundle()
        with temporary:
            concept = bundle / "systems" / "test.md"
            concept.write_text(concept.read_text(encoding="utf-8") + "[Missing](/systems/missing.md)\n", encoding="utf-8")
            errors = validate_bundle(bundle, repo_root)
            self.assertTrue(any("内部链接目标不存在" in error for error in errors))

    def test_duplicate_active_scope_fails(self) -> None:
        temporary, repo_root, bundle = self.create_bundle()
        with temporary:
            systems = bundle / "systems"
            (systems / "second.md").write_text(
                VALID_FRONTMATTER.replace("title: Test System", "title: Second System") + "# Summary\n\nSecond.\n",
                encoding="utf-8",
            )
            index = systems / "index.md"
            index.write_text(index.read_text(encoding="utf-8") + "* [Second System](second.md) - Second.\n", encoding="utf-8")
            errors = validate_bundle(bundle, repo_root)
            self.assertTrue(any("catalog_scope 'test-system'" in error for error in errors))

    def test_invalid_source_fingerprint_fails(self) -> None:
        temporary, repo_root, bundle = self.create_bundle()
        with temporary:
            concept = bundle / "systems" / "test.md"
            concept.write_text(
                concept.read_text(encoding="utf-8").replace(
                    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                    "invalid",
                ),
                encoding="utf-8",
            )
            errors = validate_bundle(bundle, repo_root)
            self.assertTrue(any("有效 source_fingerprint" in error for error in errors))

    def test_missing_catalog_scope_mapping_fails(self) -> None:
        temporary, repo_root, bundle = self.create_bundle()
        with temporary:
            (bundle / "catalog-scopes.yaml").write_text(
                "version: 1\ntracked_roots: []\nignored_paths: []\nscopes: {}\n",
                encoding="utf-8",
            )
            errors = validate_bundle(bundle, repo_root)
            self.assertTrue(any("实现型概念未在 catalog-scopes.yaml 中登记" in error for error in errors))

    def test_intentionally_excluded_repo_prefix_can_be_allowed(self) -> None:
        temporary, repo_root, bundle = self.create_bundle()
        with temporary:
            concept = bundle / "systems" / "test.md"
            concept.write_text(
                concept.read_text(encoding="utf-8").replace("source.txt", "generated/out/source.txt"),
                encoding="utf-8",
            )
            self.assertTrue(any("repo_path 不存在" in error for error in validate_bundle(bundle, repo_root)))
            self.assertEqual([], validate_bundle(bundle, repo_root, ("generated",)))

    def test_allowed_repo_prefix_requires_a_path_boundary(self) -> None:
        temporary, repo_root, bundle = self.create_bundle()
        with temporary:
            concept = bundle / "systems" / "test.md"
            concept.write_text(
                concept.read_text(encoding="utf-8").replace("source.txt", "generatedLegacy/source.txt"),
                encoding="utf-8",
            )
            errors = validate_bundle(bundle, repo_root, ("generated",))
            self.assertTrue(any("repo_path 不存在" in error for error in errors))


if __name__ == "__main__":
    unittest.main()