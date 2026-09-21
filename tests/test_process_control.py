"""
Unit tests for process_control module.

Tests process protection, PID validation, listening port resolution,
and safe process termination.
"""

from __future__ import annotations

import os
import unittest
from unittest.mock import MagicMock, patch

from core.process_control import free_port, is_process_protected, terminate_process


class TestProcessControl(unittest.TestCase):
    def test_protected_processes(self):
        """System critical processes (PID 0, PID 4, explorer.exe, svchost.exe, self) must be protected."""
        self.assertTrue(is_process_protected(0))
        self.assertTrue(is_process_protected(4))
        self.assertTrue(is_process_protected(os.getpid()))
        self.assertTrue(is_process_protected(99999, "svchost.exe"))
        self.assertTrue(is_process_protected(99999, "explorer.exe"))
        self.assertTrue(is_process_protected(99999, "csrss.exe"))
        self.assertFalse(is_process_protected(99999, "node.exe"))
        self.assertFalse(is_process_protected(99999, "python.exe"))

    def test_terminate_protected_process(self):
        """Attempting to terminate a protected process must return an error and fail safely."""
        res = terminate_process(4)
        self.assertFalse(res["success"])
        self.assertIn("protected", res["error"].lower())

    def test_terminate_nonexistent_process(self):
        """Terminating a non-existent PID must return a clean error dict."""
        res = terminate_process(999999)
        self.assertFalse(res["success"])
        self.assertIn("no longer running", res["error"])

    @patch("psutil.Process")
    @patch("psutil.pid_exists", return_value=True)
    def test_terminate_user_process_success(self, mock_pid_exists, mock_process_cls):
        """Normal user process termination must call proc.terminate()."""
        mock_proc = MagicMock()
        mock_proc.name.return_value = "node.exe"
        mock_process_cls.return_value = mock_proc

        res = terminate_process(12345, force=False)
        self.assertTrue(res["success"])
        self.assertEqual(res["pid"], 12345)
        self.assertEqual(res["name"], "node.exe")
        mock_proc.terminate.assert_called_once()

    @patch("psutil.net_connections")
    @patch("core.process_control.terminate_process")
    def test_free_port(self, mock_terminate, mock_net_conns):
        """free_port should locate the PID listening on target port and call terminate_process."""
        mock_conn = MagicMock()
        mock_conn.status = "LISTEN"
        mock_conn.laddr.port = 3000
        mock_conn.pid = 8888
        mock_net_conns.return_value = [mock_conn]

        mock_terminate.return_value = {
            "success": True,
            "pid": 8888,
            "name": "node.exe",
            "message": "Successfully stopped node.exe (PID 8888).",
        }

        res = free_port(3000, force=True)
        self.assertTrue(res["success"])
        self.assertEqual(res["port"], 3000)
        self.assertEqual(res["pid"], 8888)
        mock_terminate.assert_called_once_with(8888, force=True)


if __name__ == "__main__":
    unittest.main()
