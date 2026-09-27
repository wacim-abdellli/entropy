"""
Unit tests for Windows PATH Decay & Binary Collision Auditor.
"""

import os
import unittest
from core.path_auditor import (
    audit_path_environment,
    COMMON_DEV_BINARIES,
    _get_binary_version,
)


class TestPathAuditor(unittest.TestCase):
    def test_common_binaries_list(self):
        self.assertIn("python.exe", COMMON_DEV_BINARIES)
        self.assertIn("node.exe", COMMON_DEV_BINARIES)
        self.assertIn("git.exe", COMMON_DEV_BINARIES)
        self.assertIn("cargo.exe", COMMON_DEV_BINARIES)

    def test_audit_path_environment_structure(self):
        report = audit_path_environment()
        self.assertIsNotNone(report)
        self.assertIsInstance(report.user_path_length, int)
        self.assertIsInstance(report.system_path_length, int)
        self.assertIsInstance(report.user_entries_count, int)
        self.assertIsInstance(report.dead_entries_count, int)
        self.assertIsInstance(report.duplicate_entries_count, int)
        self.assertIsInstance(report.user_entries, list)
        self.assertIsInstance(report.dead_entries, list)
        self.assertIsInstance(report.duplicate_entries, list)
        self.assertIsInstance(report.collisions, list)
        self.assertIn(report.status, ("optimal", "warning", "critical"))
        self.assertTrue(0 <= report.health_score <= 100)

    def test_get_binary_version_nonexistent(self):
        ver = _get_binary_version("fake_binary.exe", r"C:\fake\nonexistent\fake_binary.exe")
        self.assertIsNone(ver)


if __name__ == "__main__":
    unittest.main()
