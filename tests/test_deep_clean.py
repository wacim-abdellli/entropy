"""
Unit tests for Docker Control and Global Cache Cleaner features.
"""

import os
import shutil
import tempfile
import unittest

from core.cache_cleaner import (
    get_known_cache_targets,
    is_safe_cache_path,
    purge_system_cache,
    purge_multiple_caches,
)
from core.docker_control import _parse_size, get_docker_disk_usage, prune_docker_resources


class TestDeepClean(unittest.TestCase):
    def test_docker_parse_size(self):
        self.assertEqual(_parse_size("1.5GB"), int(1.5 * 1024**3))
        self.assertEqual(_parse_size("500MB"), int(500 * 1024**2))
        self.assertEqual(_parse_size("100KB"), 100 * 1024)
        self.assertEqual(_parse_size("50B"), 50)
        self.assertEqual(_parse_size("800MB (53%)"), int(800 * 1024**2))
        self.assertEqual(_parse_size(""), 0)

    def test_docker_graceful_offline(self):
        # Should gracefully return available=False when docker is offline without raising unhandled exceptions
        usage = get_docker_disk_usage()
        self.assertIn("available", usage)
        self.assertIn("message", usage)
        self.assertIn("items", usage)

    def test_docker_prune_invalid_target(self):
        res = prune_docker_resources("invalid_target")
        self.assertFalse(res["success"])
        self.assertIn("Invalid prune target", res["error"])

    def test_cache_safety_validator_rejects_unsafe(self):
        is_safe, reason = is_safe_cache_path("C:\\Windows\\System32")
        self.assertFalse(is_safe)
        self.assertIn("not in the recognized", reason)

        is_safe, reason = is_safe_cache_path(os.path.expanduser("~"))
        self.assertFalse(is_safe)

    def test_cache_targets_discovery(self):
        targets = get_known_cache_targets()
        self.assertIsInstance(targets, list)
        for t in targets:
            self.assertIn("id", t)
            self.assertIn("label", t)
            self.assertIn("path", t)
            self.assertIn("size_bytes", t)
            self.assertTrue(os.path.isabs(t["path"]))


if __name__ == "__main__":
    unittest.main()
