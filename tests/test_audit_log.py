"""
Unit tests for core.audit_log module.
"""

from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from core.audit_log import (
    log_deletion,
    log_artifact_cleanup,
    log_cache_purge,
    log_system_cleanup,
)


class TestAuditLog(unittest.TestCase):
    """Test persistent audit logging functionality."""

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.audit_dir = Path(self.temp_dir.name) / ".entropy"
        self.audit_file = self.audit_dir / "audit.log"

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_log_deletion_creates_file_and_valid_json(self):
        with patch("core.audit_log.AUDIT_DIR", self.audit_dir), \
             patch("core.audit_log.AUDIT_FILE", self.audit_file):
            log_deletion(
                action="artifact_cleanup",
                paths=["C:\\dev\\project\\node_modules"],
                freed_bytes=1048576,
                outcome="success",
                details={"folder": "node_modules"},
            )

            self.assertTrue(self.audit_file.exists())
            with open(self.audit_file, "r", encoding="utf-8") as f:
                lines = f.readlines()

            self.assertEqual(len(lines), 1)
            entry = json.loads(lines[0])
            self.assertEqual(entry["action"], "artifact_cleanup")
            self.assertEqual(entry["paths"], ["C:\\dev\\project\\node_modules"])
            self.assertEqual(entry["freed_bytes"], 1048576)
            self.assertEqual(entry["outcome"], "success")
            self.assertEqual(entry["details"]["folder"], "node_modules")
            self.assertIn("timestamp", entry)

    def test_log_artifact_cleanup_helper(self):
        with patch("core.audit_log.AUDIT_DIR", self.audit_dir), \
             patch("core.audit_log.AUDIT_FILE", self.audit_file):
            log_artifact_cleanup("C:\\dev\\app\\.venv", 2097152, success=True)

            with open(self.audit_file, "r", encoding="utf-8") as f:
                entry = json.loads(f.readline())

            self.assertEqual(entry["action"], "artifact_cleanup")
            self.assertEqual(entry["outcome"], "success")
            self.assertEqual(entry["freed_bytes"], 2097152)

    def test_log_cache_purge_helper(self):
        with patch("core.audit_log.AUDIT_DIR", self.audit_dir), \
             patch("core.audit_log.AUDIT_FILE", self.audit_file):
            log_cache_purge("C:\\Users\\test\\.npm", 5242880, success=True, cache_name="npm-cache")

            with open(self.audit_file, "r", encoding="utf-8") as f:
                entry = json.loads(f.readline())

            self.assertEqual(entry["action"], "cache_purge")
            self.assertEqual(entry["details"]["cache_name"], "npm-cache")

    def test_log_system_cleanup_helper(self):
        with patch("core.audit_log.AUDIT_DIR", self.audit_dir), \
             patch("core.audit_log.AUDIT_FILE", self.audit_file):
            log_system_cleanup("win_temp", ["C:\\Users\\test\\AppData\\Local\\Temp"], 1000, success=True)

            with open(self.audit_file, "r", encoding="utf-8") as f:
                entry = json.loads(f.readline())

            self.assertEqual(entry["action"], "system_cleanup")
            self.assertEqual(entry["details"]["target_id"], "win_temp")


if __name__ == "__main__":
    unittest.main()
