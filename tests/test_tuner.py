"""
Unit tests for the tuner module (Windows optimizations, Defender exclusions).
"""

import os
import tempfile
import unittest
from unittest.mock import MagicMock, patch

from core.tuner import add_defender_exclusion, add_defender_exclusions_batch


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
            mock_run.return_value = MagicMock(returncode=0)
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


if __name__ == "__main__":
    unittest.main()
