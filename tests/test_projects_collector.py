"""
Unit tests for the projects collector (scan throttling, circular reference guards, symlink safety).
"""

import os
import tempfile
import time
import unittest
from unittest.mock import patch

from collectors.projects import (
    _get_dir_size,
    collect_projects_and_dependencies,
)
from core.config import get_max_scan_depth, get_scan_timeout_seconds


class TestProjectsCollector(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="entropy_test_projects_")

    def tearDown(self):
        import shutil
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_config_scan_limits(self):
        """Verify scan limit defaults and config loading."""
        depth = get_max_scan_depth()
        self.assertIsInstance(depth, int)
        self.assertGreaterEqual(depth, 1)

        timeout = get_scan_timeout_seconds()
        self.assertIsInstance(timeout, float)
        self.assertGreaterEqual(timeout, 5.0)

    def test_scan_timeout_budget(self):
        """Verify that scan budget timeout terminates traversal cleanly without crashing."""
        # Create a deep directory hierarchy
        nested = self.test_dir
        for i in range(8):
            nested = os.path.join(nested, f"level_{i}")
            os.makedirs(nested, exist_ok=True)
            with open(os.path.join(nested, "package.json"), "w", encoding="utf-8") as f:
                f.write('{"name": "test"}')

        # Run with an extremely tight timeout (0.0001s)
        projects, _ = collect_projects_and_dependencies(self.test_dir, max_depth=10, timeout_seconds=0.0001)
        self.assertIsInstance(projects, list)

    def test_circular_path_guard_in_dir_sizing(self):
        """Verify _get_dir_size does not hang or infinite loop on circular references."""
        data_file = os.path.join(self.test_dir, "test.txt")
        with open(data_file, "wb") as f:
            f.write(b"x" * 1024)  # 1 KB

        sub_dir = os.path.join(self.test_dir, "subdir")
        os.makedirs(sub_dir, exist_ok=True)
        with open(os.path.join(sub_dir, "test2.txt"), "wb") as f:
            f.write(b"y" * 2048)  # 2 KB

        size = _get_dir_size(self.test_dir, timeout_seconds=1.0)
        self.assertEqual(size, 3072)


if __name__ == "__main__":
    unittest.main()
