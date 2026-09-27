import os
import unittest
from core.memory_booster import _format_size, trim_process_working_set, trim_developer_working_sets

class TestMemoryBooster(unittest.TestCase):
    def test_format_size(self):
        self.assertEqual(_format_size(500), "500 B")
        self.assertEqual(_format_size(2048), "2.0 KB")
        self.assertEqual(_format_size(5 * 1024 * 1024), "5.0 MB")
        self.assertEqual(_format_size(2 * 1024 * 1024 * 1024), "2.00 GB")

    def test_trim_own_process_rejected(self):
        res = trim_process_working_set(os.getpid())
        self.assertFalse(res["success"])
        self.assertIn("own process", res["error"])

    def test_trim_developer_working_sets_empty(self):
        # Trimming empty list should succeed with 0 freed
        res = trim_developer_working_sets(pids=[])
        self.assertTrue(res["success"])
        self.assertEqual(res["target_count"], 0)
        self.assertEqual(res["total_freed_bytes"], 0)
