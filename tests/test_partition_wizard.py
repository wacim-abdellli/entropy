"""Unit tests for the partition_wizard module."""

import unittest
from unittest.mock import MagicMock, patch
from collections import namedtuple

from core.partition_wizard import (
    MIN_SYSTEM_BUFFER_BYTES,
    MIN_NEW_PARTITION_BYTES,
    _get_unused_drive_letters,
    get_shrink_advisory,
    launch_windows_disk_management,
)

PartitionMock = namedtuple("PartitionMock", ["mountpoint"])
UsageMock = namedtuple("UsageMock", ["total", "used", "free"])


class TestPartitionWizard(unittest.TestCase):
    def test_unused_drive_letters(self):
        with patch("psutil.disk_partitions") as mock_parts:
            mock_parts.return_value = [
                PartitionMock(mountpoint="C:\\"),
                PartitionMock(mountpoint="D:\\"),
            ]
            unused = _get_unused_drive_letters()
            self.assertNotIn("A", unused)
            self.assertNotIn("B", unused)
            self.assertNotIn("C", unused)
            self.assertNotIn("D", unused)
            self.assertIn("E", unused)
            self.assertEqual(unused[0], "E")

    def test_get_shrink_advisory_healthy_drive(self):
        # 300 GB total, 220 GB used, 80 GB free
        total = 300 * 1024 * 1024 * 1024
        used = 220 * 1024 * 1024 * 1024
        free = 80 * 1024 * 1024 * 1024

        with patch("psutil.disk_usage") as mock_usage, patch(
            "core.partition_wizard._get_unused_drive_letters", return_value=["D", "E"]
        ):
            mock_usage.return_value = UsageMock(total=total, used=used, free=free)

            advisory = get_shrink_advisory("C")

            self.assertTrue(advisory["can_shrink"])
            self.assertEqual(advisory["drive"], "C")
            self.assertEqual(advisory["suggested_letter"], "D")
            self.assertEqual(advisory["min_system_buffer_gb"], 25)

            # Max safe shrink should be free (80 GB) minus buffer (25 GB) = 55 GB
            expected_max_safe_mb = int((55 * 1024 * 1024 * 1024) / (1024 * 1024))
            self.assertEqual(advisory["max_safe_shrink_mb"], expected_max_safe_mb)

            # Recommended shrink is ideal 35 GB (35,840 MB or 35,000 MB range)
            self.assertGreaterEqual(advisory["recommended_shrink_mb"], 30000)
            self.assertLessEqual(advisory["recommended_shrink_mb"], 40000)

            # Check steps
            self.assertEqual(len(advisory["steps"]), 4)
            self.assertEqual(advisory["steps"][0]["action"], "launch_diskmgmt")
            self.assertIn("copy_value", advisory["steps"][2])

    def test_get_shrink_advisory_low_free_space(self):
        # 300 GB total, 285 GB used, 15 GB free (less than 25 GB system buffer)
        total = 300 * 1024 * 1024 * 1024
        used = 285 * 1024 * 1024 * 1024
        free = 15 * 1024 * 1024 * 1024

        with patch("psutil.disk_usage") as mock_usage:
            mock_usage.return_value = UsageMock(total=total, used=used, free=free)

            advisory = get_shrink_advisory("C")

            self.assertFalse(advisory["can_shrink"])
            self.assertEqual(advisory["max_safe_shrink_mb"], 0)
            self.assertEqual(advisory["recommended_shrink_mb"], 0)

    def test_get_shrink_advisory_invalid_drive(self):
        with patch("psutil.disk_usage", side_effect=OSError("Drive not found")):
            advisory = get_shrink_advisory("Z")
            self.assertFalse(advisory["can_shrink"])
            self.assertIn("error", advisory)

    def test_launch_windows_disk_management_non_windows(self):
        with patch("platform.system", return_value="Linux"):
            res = launch_windows_disk_management()
            self.assertFalse(res["success"])
            self.assertIn("only available on Windows", res["error"])

    def test_launch_windows_disk_management_windows(self):
        with patch("platform.system", return_value="Windows"), patch(
            "subprocess.Popen"
        ) as mock_popen:
            res = launch_windows_disk_management()
            self.assertTrue(res["success"])
            mock_popen.assert_called_once()
            call_args = mock_popen.call_args[0][0]
            self.assertIn("diskmgmt.msc", " ".join(call_args))


if __name__ == "__main__":
    unittest.main()
