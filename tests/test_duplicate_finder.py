"""Unit tests for the duplicate_finder module."""

import os
import shutil
import tempfile
import unittest

from core.duplicate_finder import (
    _compute_full_sha256,
    _compute_partial_hash,
    delete_duplicate_file,
    scan_duplicate_files,
)


class TestDuplicateFinder(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="entropy_test_dups_")

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_compute_hashes(self):
        file_path = os.path.join(self.test_dir, "sample.txt")
        content = b"A" * 5000 + b"B" * 5000
        with open(file_path, "wb") as f:
            f.write(content)

        part_hash = _compute_partial_hash(file_path)
        self.assertIsNotNone(part_hash)
        self.assertEqual(len(part_hash), 32)  # MD5 hex length

        full_hash = _compute_full_sha256(file_path)
        self.assertIsNotNone(full_hash)
        self.assertEqual(len(full_hash), 64)  # SHA-256 hex length

    def test_scan_finds_duplicates(self):
        # Create identical files
        content = b"HelloWorldDuplicateContent1234567890" * 500
        file1 = os.path.join(self.test_dir, "file1.bin")
        file2 = os.path.join(self.test_dir, "file2.bin")
        file3 = os.path.join(self.test_dir, "different.bin")

        with open(file1, "wb") as f:
            f.write(content)
        with open(file2, "wb") as f:
            f.write(content)
        with open(file3, "wb") as f:
            f.write(b"Completely different content of different length")

        result = scan_duplicate_files([self.test_dir], min_size_bytes=100)
        self.assertEqual(result["total_groups"], 1)
        self.assertEqual(result["total_duplicate_files"], 2)
        self.assertGreater(result["total_wasted_bytes"], 0)

        group = result["groups"][0]
        self.assertEqual(group["file_count"], 2)
        paths = [f["path"] for f in group["files"]]
        self.assertIn(os.path.abspath(file1), paths)
        self.assertIn(os.path.abspath(file2), paths)

    def test_delete_duplicate_file(self):
        file_path = os.path.join(self.test_dir, "to_delete.txt")
        with open(file_path, "w") as f:
            f.write("temporary file")

        self.assertTrue(os.path.exists(file_path))
        res = delete_duplicate_file(file_path, use_recycle_bin=False)
        self.assertTrue(res["success"])
        self.assertFalse(os.path.exists(file_path))

    def test_delete_nonexistent_file(self):
        res = delete_duplicate_file(os.path.join(self.test_dir, "nonexistent.bin"))
        self.assertFalse(res["success"])
        self.assertIn("does not exist", res["error"])


if __name__ == "__main__":
    unittest.main()
