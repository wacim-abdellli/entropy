"""
Unit tests for Dev Drive (ReFS) and storage booster engine.
"""

import os
import unittest
from core.dev_drive import (
    get_dev_drive_status,
    _get_os_build,
    _query_volumes,
    _get_package_cache_locations,
)


class TestDevDrive(unittest.TestCase):
    def test_get_os_build(self):
        build = _get_os_build()
        self.assertIsInstance(build, int)
        self.assertGreater(build, 0)

    def test_query_volumes(self):
        volumes = _query_volumes()
        self.assertIsInstance(volumes, list)
        if os.name == "nt":
            self.assertGreater(len(volumes), 0)
            self.assertTrue(any(v.drive_letter.upper() == "C:" for v in volumes))

    def test_package_cache_locations(self):
        volumes = _query_volumes()
        caches = _get_package_cache_locations(volumes)
        self.assertIsInstance(caches, list)
        self.assertEqual(len(caches), 4)
        tools = [c.tool for c in caches]
        self.assertIn("npm", tools)
        self.assertIn("pip", tools)
        self.assertIn("cargo", tools)
        self.assertIn("nuget", tools)

    def test_get_dev_drive_status_report(self):
        report = get_dev_drive_status()
        self.assertIsNotNone(report)
        self.assertIsInstance(report.is_supported, bool)
        self.assertIsInstance(report.os_build, int)
        self.assertIsInstance(report.mounted_volumes, list)
        self.assertIsInstance(report.package_caches, list)
        self.assertIsInstance(report.recommendations, list)


if __name__ == "__main__":
    unittest.main()
