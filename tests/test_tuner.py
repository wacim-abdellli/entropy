"""
Unit tests for the tuner module (Windows optimizations, Defender exclusions).
"""

import os
import tempfile
import unittest
from unittest.mock import MagicMock, patch

from core.tuner import (
    add_defender_exclusion,
    add_defender_exclusions_batch,
    enable_developer_mode,
    enable_long_paths,
)


class TestTuner(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="entropy_test_tuner_")

    def tearDown(self):
        import shutil
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_defender_exclusion_rejects_control_characters(self):
        """SEC-01: Verify that paths with newlines, null bytes, backticks, or quotes are rejected."""
        malicious_paths = [
            f"{self.test_dir}\nwhoami",
            f"{self.test_dir}\rwhoami",
            f"{self.test_dir}\0calc.exe",
            f"{self.test_dir}`Get-Process",
            f'{self.test_dir}" -and 1 -eq 1',
        ]
        res = add_defender_exclusions_batch(malicious_paths)
        self.assertFalse(res["success"])
        self.assertIn("No valid directories", res["error"])

    def test_defender_exclusion_single_quote_escaping(self):
        """SEC-01: Verify single quotes are safely doubled in PowerShell array literals."""
        quote_dir = os.path.join(self.test_dir, "developer's workspace")
        os.makedirs(quote_dir, exist_ok=True)

        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0, stderr="", stdout="")
            res = add_defender_exclusions_batch([quote_dir])
            self.assertTrue(res["success"])
            self.assertEqual(res["count"], 1)

            # Inspect the command passed to powershell
            called_cmd = mock_run.call_args[0][0]
            # Argument 5 is the script command string passed after -Command
            cmd_string = called_cmd[5]
            # Must contain the doubled single quote: 'developer''s workspace'
            expected_escaped = quote_dir.replace("'", "''")
            self.assertIn(f"'{expected_escaped}'", cmd_string)

    def test_defender_exclusion_nonexistent_path(self):
        """Verify non-existent paths are rejected."""
        res = add_defender_exclusion(os.path.join(self.test_dir, "does_not_exist"))
        self.assertFalse(res["success"])
        self.assertIn("No valid directories", res["error"])

    def test_enable_long_paths_uac_cancelled(self):
        """Verify detection of user declining UAC prompt (Win32 1223)."""
        with patch("subprocess.run") as mock_run, patch("core.tuner.is_long_paths_enabled", return_value=False):
            mock_run.return_value = MagicMock(
                returncode=1,
                stderr="Start-Process : This command cannot be run due to the error: The operation was canceled by the user (1223).",
                stdout="",
            )
            res = enable_long_paths()
            self.assertFalse(res["success"])
            self.assertTrue(res.get("cancelled"))
            self.assertIn("Administrator permission was declined", res["error"])
            self.assertIn("resolution", res)

    def test_enable_developer_mode_uac_cancelled(self):
        """Verify detection of user declining UAC prompt for Developer Mode."""
        with patch("subprocess.run") as mock_run, patch("core.tuner.is_dev_mode_enabled", return_value=False):
            mock_run.return_value = MagicMock(
                returncode=1,
                stderr="The operation was canceled by the user.",
                stdout="",
            )
            res = enable_developer_mode()
            self.assertFalse(res["success"])
            self.assertTrue(res.get("cancelled"))
            self.assertIn("Administrator permission was declined", res["error"])
            self.assertIn("resolution", res)

    def test_defender_exclusion_uac_cancelled(self):
        """Verify detection of user declining UAC prompt for Defender exclusions."""
        test_sub = os.path.join(self.test_dir, "my_project")
        os.makedirs(test_sub, exist_ok=True)
        with patch("subprocess.run") as mock_run, patch("core.tuner.get_defender_exclusions", return_value=[]):
            mock_run.return_value = MagicMock(
                returncode=1,
                stderr="Start-Process : The operation was canceled by the user.",
                stdout="",
            )
            res = add_defender_exclusions_batch([test_sub])
            self.assertFalse(res["success"])
            self.assertTrue(res.get("cancelled"))
            self.assertIn("Administrator permission was declined", res["error"])
            self.assertIn("resolution", res)


if __name__ == "__main__":
    unittest.main()
