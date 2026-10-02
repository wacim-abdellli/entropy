import os
import tempfile
import unittest
from core.ssd_lens import (
    get_ssd_drives_overview,
    get_drive_category_breakdown,
    scan_path_breakdown,
    _classify_path_category,
)


class TestSsdLens(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()

        # Create nested mock folders
        self.sub_dir = os.path.join(self.temp_dir.name, "sub_folder")
        os.makedirs(self.sub_dir, exist_ok=True)

        self.mock_file = os.path.join(self.sub_dir, "test.txt")
        with open(self.mock_file, "wb") as f:
            f.write(b"SAMPLE_CONTENT" * 100)

        self.mock_zip = os.path.join(self.temp_dir.name, "backup.zip")
        with open(self.mock_zip, "wb") as f:
            f.write(b"ZIP_CONTENT" * 50)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_get_ssd_drives_overview(self):
        drives = get_ssd_drives_overview()
        self.assertIsInstance(drives, list)
        self.assertGreater(len(drives), 0)
        # Check that C: drive is present
        c_drive = next((d for d in drives if d["drive"].upper().startswith("C")), None)
        self.assertIsNotNone(c_drive)
        self.assertTrue(c_drive["is_system"])
        self.assertGreater(c_drive["total_bytes"], 0)

    def test_get_drive_category_breakdown(self):
        breakdown = get_drive_category_breakdown("C:")
        self.assertEqual(breakdown["drive"], "C:")
        self.assertGreater(breakdown["total_bytes"], 0)
        self.assertIsInstance(breakdown["categories"], list)
        self.assertGreater(len(breakdown["categories"]), 0)
        cat_ids = [c["id"] for c in breakdown["categories"]]
        self.assertIn("artifacts", cat_ids)
        self.assertIn("caches", cat_ids)

    def test_scan_path_breakdown(self):
        rep = scan_path_breakdown(self.temp_dir.name, depth=1)
        self.assertEqual(rep["path"], self.temp_dir.name)
        self.assertIsInstance(rep["items"], list)
        self.assertGreater(len(rep["items"]), 0)
        names = [it["name"] for it in rep["items"]]
        self.assertIn("sub_folder", names)
        self.assertIn("backup.zip", names)

    def test_classify_path_category(self):
        cat1, label1 = _classify_path_category("node_modules", is_dir=True)
        self.assertEqual(cat1, "artifact")

        cat2, label2 = _classify_path_category("models", is_dir=True)
        self.assertEqual(cat2, "folder")

        cat3, label3 = _classify_path_category("setup.exe", is_dir=False)
        self.assertEqual(cat3, "download")

        cat4, label4 = _classify_path_category("test.mp4", is_dir=False)
        self.assertEqual(cat4, "media")

    def test_breadcrumbs(self):
        rep = scan_path_breakdown(self.temp_dir.name, depth=1)
        crumbs = rep["breadcrumbs"]
        self.assertGreater(len(crumbs), 0)
        self.assertEqual(crumbs[-1]["path"], self.temp_dir.name)


if __name__ == "__main__":
    unittest.main()
