"""Unit tests for the smart_mover module."""

import json
import os
import shutil
import tempfile
import unittest
from unittest.mock import MagicMock, patch

from core.smart_mover import (
    _calc_directory_size,
    _format_bytes,
    _load_junctions_manifest,
    _save_junctions_manifest,
    discover_relocation_candidates,
    get_available_destinations,
)


class TestSmartMover(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="entropy_test_smart_mover_")

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_format_bytes(self):
        self.assertEqual(_format_bytes(0), "0 B")
        self.assertEqual(_format_bytes(1024), "1.0 KB")
        self.assertEqual(_format_bytes(1024 * 1024 * 15), "15.0 MB")
        self.assertEqual(_format_bytes(1024 * 1024 * 1024 * 2), "2.0 GB")

    def test_calc_directory_size(self):
        sub = os.path.join(self.test_dir, "subfolder")
        os.makedirs(sub, exist_ok=True)
        f1 = os.path.join(sub, "f1.bin")
        f2 = os.path.join(sub, "f2.bin")
        with open(f1, "wb") as f:
            f.write(b"X" * 1000)
        with open(f2, "wb") as f:
            f.write(b"Y" * 2500)

        total_bytes, count = _calc_directory_size(sub)
        self.assertEqual(total_bytes, 3500)
        self.assertEqual(count, 2)

    def test_manifest_save_load(self):
        manifest_file = os.path.join(self.test_dir, "manifest.json")
        entries = [
            {"id": "junc_1", "name": "docker", "size_bytes": 1000},
            {"id": "junc_2", "name": "cache", "size_bytes": 2000},
        ]
        with patch("core.smart_mover.JUNCTIONS_MANIFEST", os.path.abspath(manifest_file)):
            from pathlib import Path
            with patch("core.smart_mover.JUNCTIONS_MANIFEST", Path(manifest_file)):
                _save_junctions_manifest(entries)
                loaded = _load_junctions_manifest()
                self.assertEqual(len(loaded), 2)
                self.assertEqual(loaded[0]["name"], "docker")

    def test_discover_relocation_candidates_live(self):
        candidates = discover_relocation_candidates()
        self.assertIsInstance(candidates, list)
        for c in candidates:
            self.assertIn("id", c)
            self.assertIn("name", c)
            self.assertIn("original_path", c)
            self.assertIn("size_bytes", c)

    def test_get_available_destinations_live(self):
        dests = get_available_destinations()
        self.assertIsInstance(dests, list)
        self.assertGreater(len(dests), 0)
        self.assertTrue(any(d["is_system"] for d in dests))

    def test_concurrent_operation_prevention(self):
        """CON-01: Operations must be rejected if another operation is actively running."""
        from core.smart_mover import relocate_directory_junction, restore_directory_junction

        source = os.path.join(self.test_dir, "my_cache")
        os.makedirs(source, exist_ok=True)
        target = os.path.join(self.test_dir, "target_drive")

        with patch("core.smart_mover.progress_tracker.is_active", return_value=True):
            res1 = relocate_directory_junction(source, target)
            self.assertFalse(res1["success"])
            self.assertIn("Another operation is currently in progress", res1["error"])

            manifest_entry = {"id": "junc_test", "original_path": source, "destination_path": target, "name": "my_cache"}
            with patch("core.smart_mover._load_junctions_manifest", return_value=[manifest_entry]), \
                 patch("os.path.exists", return_value=True):
                res2 = restore_directory_junction("junc_test")
                self.assertFalse(res2["success"])
                self.assertIn("Another operation is currently in progress", res2["error"])

    def test_restore_fails_when_insufficient_space(self):
        """RES-01: restore_directory_junction must abort safely if target drive lacks space."""
        from collections import namedtuple
        from core.smart_mover import restore_directory_junction

        dest_folder = os.path.join(self.test_dir, "dest_data")
        os.makedirs(dest_folder, exist_ok=True)
        with open(os.path.join(dest_folder, "data.bin"), "wb") as f:
            f.write(b"0" * 1024 * 1024)  # 1 MB

        manifest_entry = {
            "id": "junc_space_test",
            "name": "space_test",
            "original_path": r"C:\test\orig",
            "destination_path": dest_folder,
        }

        DiskUsage = namedtuple("DiskUsage", ["total", "used", "free"])
        # Mock free space to be 500 KB (less than 1.1 MB required)
        mock_usage = DiskUsage(total=10000000, used=9500000, free=500000)

        with patch("core.smart_mover._load_junctions_manifest", return_value=[manifest_entry]), \
             patch("core.smart_mover.progress_tracker.is_active", return_value=False), \
             patch("psutil.disk_usage", return_value=mock_usage):
            res = restore_directory_junction("junc_space_test")
            self.assertFalse(res["success"])
            self.assertIn("Insufficient disk space", res["error"])

    def test_to_extended_path(self):
        """WIN-01: Verify Win32 extended path prefixing in smart_mover."""
        from core.smart_mover import _to_extended_path
        sample = r"C:\Users\test\data"
        res = _to_extended_path(sample)
        if os.name == "nt":
            self.assertTrue(res.startswith(r"\\?\C:"))
        else:
            self.assertEqual(res, sample)


if __name__ == "__main__":
    unittest.main()

