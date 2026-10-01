import os
import tempfile
import unittest
from core.large_files import scan_large_files, delete_large_file, _classify_category


class TestLargeFiles(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        # Create a small file and a large file
        self.small_file = os.path.join(self.temp_dir.name, "small.txt")
        with open(self.small_file, "wb") as f:
            f.write(b"hello" * 100)

        self.large_file = os.path.join(self.temp_dir.name, "big_archive.zip")
        with open(self.large_file, "wb") as f:
            f.seek(2 * 1024 * 1024 - 1)
            f.write(b"\0")

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_classify_category(self):
        self.assertEqual(_classify_category(".mp4"), "media")
        self.assertEqual(_classify_category(".zip"), "archive")
        self.assertEqual(_classify_category(".sqlite"), "database")
        self.assertEqual(_classify_category(".onnx"), "model_ml")
        self.assertEqual(_classify_category(".exe"), "binary")
        self.assertEqual(_classify_category(".unknown"), "other")

    def test_scan_large_files(self):
        found = scan_large_files(roots=[self.temp_dir.name], min_size_mb=1)
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0]["name"], "big_archive.zip")
        self.assertEqual(found[0]["category"], "archive")

        # Threshold 5MB should find 0
        found_none = scan_large_files(roots=[self.temp_dir.name], min_size_mb=5)
        self.assertEqual(len(found_none), 0)

    def test_delete_large_file(self):
        res = delete_large_file(self.large_file, use_recycle_bin=False)
        self.assertTrue(res["success"])
        self.assertFalse(os.path.exists(self.large_file))


if __name__ == "__main__":
    unittest.main()
