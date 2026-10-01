"""Unit tests for the installed_apps module."""

import unittest
from unittest.mock import MagicMock, patch

from core.installed_apps import (
    InstalledApp,
    _categorize_app,
    _format_registry_date,
    get_installed_apps,
    launch_uninstaller,
    open_install_folder,
)


class TestInstalledApps(unittest.TestCase):
    def test_categorize_app_dev(self):
        cat, is_dev = _categorize_app("Visual Studio Code", "Microsoft Corporation")
        self.assertEqual(cat, "development")
        self.assertTrue(is_dev)

        cat, is_dev = _categorize_app("Docker Desktop", "Docker Inc.")
        self.assertEqual(cat, "development")
        self.assertTrue(is_dev)

        cat, is_dev = _categorize_app("MongoDB 7.0.5", "MongoDB")
        self.assertEqual(cat, "development")
        self.assertTrue(is_dev)

    def test_categorize_app_browser(self):
        cat, is_dev = _categorize_app("Google Chrome", "Google LLC")
        self.assertEqual(cat, "browser")
        self.assertFalse(is_dev)

    def test_categorize_app_communication(self):
        cat, is_dev = _categorize_app("Discord", "Discord Inc.")
        self.assertEqual(cat, "communication")
        self.assertFalse(is_dev)

    def test_categorize_app_productivity(self):
        cat, is_dev = _categorize_app("Microsoft PowerBI Desktop", "Microsoft Corporation")
        self.assertEqual(cat, "productivity")
        self.assertFalse(is_dev)

    def test_format_registry_date(self):
        self.assertEqual(_format_registry_date("20240315"), "2024-03-15")
        self.assertEqual(_format_registry_date("2023-11-01"), "2023-11-01")
        self.assertIsNone(_format_registry_date(None))
        self.assertIsNone(_format_registry_date(""))

    def test_installed_app_size_formatting(self):
        app = InstalledApp(
            id="test-app",
            name="Test App",
            version="1.0.0",
            publisher="Acme",
            install_date="2024-01-01",
            size_bytes=1024 * 1024 * 500,  # 500 MB
            install_location=None,
            scope="user",
            category="development",
            can_uninstall=True,
            uninstall_command="C:\\uninstall.exe",
            is_dev_tool=True,
        )
        d = app.to_dict()
        self.assertEqual(d["size_formatted"], "500.0 MB")
        self.assertTrue(d["is_dev_tool"])

    def test_open_install_folder_invalid(self):
        res = open_install_folder("Z:\\this\\does\\not\\exist\\path\\12345")
        self.assertFalse(res["success"])
        self.assertIn("does not exist", res["error"])

    def test_launch_uninstaller_invalid(self):
        res = launch_uninstaller("non_existent_app_id_9999999")
        self.assertFalse(res["success"])
        self.assertIn("No uninstaller", res["error"])

    def test_get_installed_apps_live_returns_list(self):
        apps = get_installed_apps()
        self.assertIsInstance(apps, list)
        if apps:
            first = apps[0]
            self.assertIn("name", first)
            self.assertIn("category", first)
            self.assertIn("scope", first)


if __name__ == "__main__":
    unittest.main()
