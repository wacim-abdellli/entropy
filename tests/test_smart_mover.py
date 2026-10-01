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


if __name__ == "__main__":
    unittest.main()
