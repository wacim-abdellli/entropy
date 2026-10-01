import unittest
from core.startup_manager import (
    get_startup_programs,
    _extract_executable_path,
    _estimate_boot_impact,
)


class TestStartupManager(unittest.TestCase):
    def test_extract_executable_path(self):
        cmd1 = '"C:\\Program Files\\App\\app.exe" --silent'
        self.assertEqual(_extract_executable_path(cmd1), "C:\\Program Files\\App\\app.exe")

        cmd2 = "C:\\Windows\\System32\\cmd.exe /c start"
        self.assertEqual(_extract_executable_path(cmd2), "C:\\Windows\\System32\\cmd.exe")

        cmd3 = ""
        self.assertEqual(_extract_executable_path(cmd3), "")

    def test_estimate_boot_impact(self):
        self.assertEqual(_estimate_boot_impact("Discord", "C:\\Users\\pc\\Discord.exe"), "high")
        self.assertEqual(_estimate_boot_impact("SecurityHealth", "C:\\Windows\\SecurityHealth.exe"), "low")
        self.assertEqual(_estimate_boot_impact("MyCustomApp", "C:\\Tools\\app.exe"), "medium")

    def test_get_startup_programs(self):
        items = get_startup_programs()
        self.assertIsInstance(items, list)
        for item in items:
            self.assertIn("id", item)
            self.assertIn("name", item)
            self.assertIn("command", item)
            self.assertIn("scope", item)
            self.assertIn("is_enabled", item)
            self.assertIn("impact", item)
            self.assertIn("can_modify", item)


if __name__ == "__main__":
    unittest.main()
