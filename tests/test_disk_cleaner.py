"""
Unit tests for disk_cleaner and artifacts collector modules.

Tests safety boundaries, whitelisted folder deletion, read-only attribute handling,
batch artifact cleaning, and collector detection.
"""

from __future__ import annotations

import os
import shutil
import tempfile
import unittest

from collectors.artifacts import collect_project_artifacts
from core.disk_cleaner import (
    ALLOWED_DISPOSABLE_NAMES,
    clean_artifact_directory,
    clean_multiple_artifacts,
    is_safe_to_clean,
)


class TestDiskCleaner(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="entropy_test_cleaner_")

    def tearDown(self):
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_safety_validation(self):
        """Test that only whitelisted disposable folders can be cleaned."""
        # Non-whitelisted folder inside test_dir
        src_dir = os.path.join(self.test_dir, "src")
        os.makedirs(src_dir, exist_ok=True)
        is_safe, error = is_safe_to_clean(src_dir)
        self.assertFalse(is_safe)
        self.assertIn("whitelist", error.lower())

        # Whitelisted node_modules inside test_dir
        node_dir = os.path.join(self.test_dir, "node_modules")
        os.makedirs(node_dir, exist_ok=True)
        is_safe, error = is_safe_to_clean(node_dir)
        self.assertTrue(is_safe)
        self.assertEqual(error, "")

        # System root / user home protection
        user_home = os.path.expanduser("~")
        is_safe, error = is_safe_to_clean(user_home)
        self.assertFalse(is_safe)

        # .git subpath protection
        git_sub_dir = os.path.join(self.test_dir, ".git", "node_modules")
        os.makedirs(git_sub_dir, exist_ok=True)
        is_safe, error = is_safe_to_clean(git_sub_dir)
        self.assertFalse(is_safe)
        self.assertIn(".git", error)

    def test_clean_whitelisted_directory(self):
        """Test deleting a valid whitelisted build folder with files."""
        node_dir = os.path.join(self.test_dir, "node_modules")
        os.makedirs(node_dir, exist_ok=True)

        # Create dummy file inside node_modules
        dummy_file = os.path.join(node_dir, "package.json")
        with open(dummy_file, "w") as f:
            f.write('{"name": "test-pkg"}')

        self.assertTrue(os.path.exists(node_dir))

        res = clean_artifact_directory(node_dir)
        self.assertTrue(res["success"])
        self.assertFalse(os.path.exists(node_dir))
        self.assertGreater(res["freed_bytes"], 0)

    def test_clean_multiple_artifacts(self):
        """Test batch deletion of multiple whitelisted artifact directories."""
        target_dir = os.path.join(self.test_dir, "target")
        venv_dir = os.path.join(self.test_dir, ".venv")
        os.makedirs(target_dir, exist_ok=True)
        os.makedirs(venv_dir, exist_ok=True)

        with open(os.path.join(target_dir, "app.exe"), "wb") as f:
            f.write(b"0" * 1024)
        with open(os.path.join(venv_dir, "python.exe"), "wb") as f:
            f.write(b"0" * 2048)

        res = clean_multiple_artifacts([target_dir, venv_dir])
        self.assertTrue(res["success"])
        self.assertEqual(res["success_count"], 2)
        self.assertEqual(res["failed_count"], 0)
        self.assertEqual(res["total_freed_bytes"], 3072)
        self.assertFalse(os.path.exists(target_dir))
        self.assertFalse(os.path.exists(venv_dir))

    def test_collect_project_artifacts(self):
        """Test scanning project directory for disposable artifact folders."""
        proj_dir = os.path.join(self.test_dir, "my_project")
        node_dir = os.path.join(proj_dir, "node_modules")
        src_dir = os.path.join(proj_dir, "src")
        os.makedirs(node_dir, exist_ok=True)
        os.makedirs(src_dir, exist_ok=True)

        with open(os.path.join(node_dir, "index.js"), "w") as f:
            f.write("console.log('hello');")

        artifacts = collect_project_artifacts(proj_dir)
        self.assertEqual(len(artifacts), 1)
        self.assertEqual(artifacts[0]["name"], "node_modules")
        self.assertEqual(artifacts[0]["category"], "node")
        self.assertGreater(artifacts[0]["size_bytes"], 0)


if __name__ == "__main__":
    unittest.main()
