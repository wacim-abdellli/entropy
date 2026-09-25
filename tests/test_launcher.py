"""
Tests for the launcher module in core.launcher.
"""

from __future__ import annotations

import os
import unittest
from unittest.mock import patch, MagicMock

from core.launcher import (
    detect_installed_launchers,
    launch_workspace_in_editor,
    _find_vscode_executable,
    _find_cursor_executable,
    _find_windows_terminal_executable,
)


class TestLauncherModule(unittest.TestCase):
    def setUp(self) -> None:
        self.test_dir = os.path.abspath(".")

    def test_detect_installed_launchers_returns_expected_keys(self) -> None:
        launchers = detect_installed_launchers()
        self.assertIsInstance(launchers, dict)
        expected_keys = {"explorer", "terminal", "powershell", "cmd", "code", "cursor"}
        for k in expected_keys:
            self.assertIn(k, launchers)
            self.assertIsInstance(launchers[k], bool)

    def test_launch_workspace_nonexistent_path(self) -> None:
        res = launch_workspace_in_editor(r"C:\nonexistent_entropy_test_path_12345", "code")
        self.assertFalse(res["success"])
        self.assertIn("does not exist", res["error"])

    def test_launch_workspace_empty_path(self) -> None:
        res = launch_workspace_in_editor("", "code")
        self.assertFalse(res["success"])
        self.assertIn("does not exist", res["error"])

    def test_launch_workspace_unsupported_editor(self) -> None:
        res = launch_workspace_in_editor(self.test_dir, "unsupported_xyz_app")
        self.assertFalse(res["success"])
        self.assertIn("Unsupported editor launcher ID", res["error"])

    @patch("core.launcher._launch_interactive_console")
    def test_launch_explorer(self, mock_console: MagicMock) -> None:
        mock_console.return_value = "Opened File Explorer."
        res = launch_workspace_in_editor(self.test_dir, "explorer")
        self.assertTrue(res["success"])
        mock_console.assert_called_once_with("explorer", self.test_dir)

    @patch("core.launcher._launch_interactive_console")
    def test_launch_cmd(self, mock_console: MagicMock) -> None:
        mock_console.return_value = "Opened Command Prompt."
        res = launch_workspace_in_editor(self.test_dir, "cmd")
        self.assertTrue(res["success"])
        mock_console.assert_called_once_with("cmd", self.test_dir)

    @patch("core.launcher._launch_interactive_console")
    def test_launch_powershell(self, mock_console: MagicMock) -> None:
        mock_console.return_value = "Opened PowerShell."
        res = launch_workspace_in_editor(self.test_dir, "powershell")
        self.assertTrue(res["success"])
        mock_console.assert_called_once_with("powershell", self.test_dir)

    @patch("core.launcher._launch_interactive_console")
    def test_launch_terminal(self, mock_console: MagicMock) -> None:
        mock_console.return_value = "Opened Windows Terminal."
        res = launch_workspace_in_editor(self.test_dir, "terminal")
        self.assertTrue(res["success"])
        mock_console.assert_called_once_with("terminal", self.test_dir)

    @patch("core.launcher._find_vscode_executable")
    @patch("core.launcher._launch_silent_gui")
    def test_launch_vscode_alias(self, mock_launch: MagicMock, mock_find: MagicMock) -> None:
        mock_find.return_value = r"C:\Programs\VSCode\Code.exe"
        res = launch_workspace_in_editor(self.test_dir, "vscode")
        self.assertTrue(res["success"])
        mock_launch.assert_called_once_with(r"C:\Programs\VSCode\Code.exe", self.test_dir)

    @patch("core.launcher._find_cursor_executable")
    @patch("core.launcher._launch_silent_gui")
    def test_launch_cursor(self, mock_launch: MagicMock, mock_find: MagicMock) -> None:
        mock_find.return_value = r"C:\Programs\Cursor\Cursor.exe"
        res = launch_workspace_in_editor(self.test_dir, "cursor")
        self.assertTrue(res["success"])
        mock_launch.assert_called_once_with(r"C:\Programs\Cursor\Cursor.exe", self.test_dir)


if __name__ == "__main__":
    unittest.main()
