import os
import time
import shutil
import tempfile
import unittest
from core.dormant_detector import (
    detect_dormant_workspaces,
    detect_stale_downloads,
    detect_ai_models,
    get_storage_recommendations,
    clean_dormant_workspace,
    clean_stale_downloads,
)


class TestDormantDetector(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.workspace_root = os.path.join(self.temp_dir.name, "old_project")
        os.makedirs(self.workspace_root, exist_ok=True)

        # Create source files
        self.source_file = os.path.join(self.workspace_root, "index.js")
        with open(self.source_file, "w") as f:
            f.write("console.log('hello');")

        # Create project sentinel file
        self.pkg_json = os.path.join(self.workspace_root, "package.json")
        with open(self.pkg_json, "w") as f:
            f.write('{"name": "old-project", "version": "1.0.0"}')

        # Create reconstructible artifact folder (e.g., node_modules)
        self.artifact_dir = os.path.join(self.workspace_root, "node_modules", "some_pkg")
        os.makedirs(self.artifact_dir, exist_ok=True)
        with open(os.path.join(self.artifact_dir, "pkg.js"), "w") as f:
            f.write("module.exports = {};")

        # Set mtime to 60 days ago
        old_time = time.time() - 60 * 86400
        os.utime(self.source_file, (old_time, old_time))
        os.utime(self.pkg_json, (old_time, old_time))
        os.utime(self.workspace_root, (old_time, old_time))

        # Create a mock Downloads folder with an old .exe installer
        self.downloads_dir = os.path.join(self.temp_dir.name, "Downloads")
        os.makedirs(self.downloads_dir, exist_ok=True)
        self.installer_file = os.path.join(self.downloads_dir, "setup_v1.0.exe")
        with open(self.installer_file, "wb") as f:
            f.write(b"MOCK_EXE" * 1000)
        os.utime(self.installer_file, (old_time, old_time))

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_detect_dormant_workspaces(self):
        dormant = detect_dormant_workspaces(
            roots=[self.temp_dir.name],
            min_inactivity_days=30,
            min_reclaimable_mb=0,
            min_artifact_mb=0,
        )
        self.assertEqual(len(dormant), 1)
        ws = dormant[0]
        self.assertEqual(ws["name"], "old_project")
        self.assertGreaterEqual(ws["inactivity_days"], 59)
        self.assertEqual(len(ws["artifacts"]), 1)
        self.assertEqual(ws["artifacts"][0]["name"], "node_modules")
        self.assertEqual(ws["artifacts"][0]["rebuild_command"], "npm install")

    def test_clean_dormant_workspace(self):
        # Clean the artifact
        res = clean_dormant_workspace(self.workspace_root, artifacts=["node_modules"])
        self.assertTrue(res["success"])
        self.assertIn("node_modules", res["cleaned_artifacts"])
        self.assertFalse(os.path.exists(os.path.join(self.workspace_root, "node_modules")))
        # Crucial check: source code must NOT be deleted
        self.assertTrue(os.path.exists(self.source_file))

    def test_detect_stale_downloads(self):
        stale = detect_stale_downloads(
            downloads_dir=self.downloads_dir,
            min_age_days=30,
            min_size_mb=0,
        )
        self.assertEqual(len(stale), 1)
        item = stale[0]
        self.assertEqual(item["name"], "setup_v1.0.exe")
        self.assertEqual(item["category"], "installer")
        self.assertGreaterEqual(item["age_days"], 59)

    def test_clean_stale_downloads(self):
        res = clean_stale_downloads([self.installer_file])
        self.assertTrue(res["success"])
        self.assertEqual(res["deleted_count"], 1)
        self.assertFalse(os.path.exists(self.installer_file))

    def test_get_storage_recommendations(self):
        rec = get_storage_recommendations(roots=[self.temp_dir.name])
        self.assertIn("dormant_workspaces", rec)
        self.assertIn("stale_downloads", rec)
        self.assertIn("ai_models", rec)
        self.assertIn("total_reclaimable_bytes", rec)


if __name__ == "__main__":
    unittest.main()
