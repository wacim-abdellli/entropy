"""
Unit tests for System Cleaner module.
"""

import os
import shutil
import tempfile
import time
import unittest
from core.system_cleaner import (
    get_system_cleanup_targets,
    clean_system_target,
    clean_multiple_system_targets,
    _calc_dir_footprint,
    _query_recycle_bin,
    KNOWN_TARGETS_SPECS,
)


class TestSystemCleaner(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="entropy_sys_test_")

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_calc_dir_footprint(self):
        sub = os.path.join(self.test_dir, "sub")
        os.makedirs(sub, exist_ok=True)
        file1 = os.path.join(sub, "f1.txt")
        file2 = os.path.join(self.test_dir, "f2.txt")
        with open(file1, "wb") as f:
            f.write(b"x" * 100)
        with open(file2, "wb") as f:
            f.write(b"y" * 200)

        total_bytes, total_files = _calc_dir_footprint(self.test_dir)
        self.assertEqual(total_bytes, 300)
        self.assertEqual(total_files, 2)

    def test_get_system_cleanup_targets_structure(self):
        targets = get_system_cleanup_targets()
        self.assertIsInstance(targets, list)
        self.assertGreater(len(targets), 0)

        # Check required fields
        for t in targets:
            self.assertIn("id", t)
            self.assertIn("name", t)
            self.assertIn("category", t)
            self.assertIn("size_bytes", t)
            self.assertIn("item_count", t)
            self.assertIn("risk", t)
            self.assertIn("safety_notice", t)
            self.assertIn("is_default_selected", t)
            self.assertIn("paths", t)
            self.assertIn(t["risk"], ("safe", "review", "danger"))

    def test_recycle_bin_query(self):
        rb_bytes, rb_items = _query_recycle_bin()
        self.assertGreaterEqual(rb_bytes, 0)
        self.assertGreaterEqual(rb_items, 0)

    def test_clean_unknown_target(self):
        res = clean_system_target("invalid_target_xyz")
        self.assertFalse(res["success"])
        self.assertIn("Unknown target ID", res["error"])

    def test_clean_multiple_targets_graceful(self):
        res = clean_multiple_system_targets([])
        self.assertTrue(res["success"])
        self.assertEqual(res["total_freed_bytes"], 0)


if __name__ == "__main__":
    unittest.main()
