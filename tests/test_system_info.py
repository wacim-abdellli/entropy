import unittest
from core.system_info import get_system_specs, get_live_metrics, LiveMetricsTracker


class TestSystemInfo(unittest.TestCase):
    def test_get_system_specs_structure(self):
        specs = get_system_specs()
        self.assertIn("os", specs)
        self.assertIn("pc", specs)
        self.assertIn("cpu", specs)
        self.assertIn("ram", specs)
        self.assertIn("gpus", specs)
        self.assertIn("battery", specs)
        self.assertIn("drives", specs)
        self.assertIn("uptime_seconds", specs)
        self.assertIn("uptime_formatted", specs)

        # Validate OS
        self.assertTrue(len(specs["os"].get("product_name", "")) > 0)
        self.assertTrue(len(specs["os"].get("hostname", "")) > 0)

        # Validate CPU
        self.assertTrue(len(specs["cpu"].get("name", "")) > 0)
        self.assertGreater(specs["cpu"].get("logical_cores", 0), 0)

        # Validate RAM
        self.assertGreater(specs["ram"].get("total_bytes", 0), 0)
        self.assertGreaterEqual(specs["ram"].get("percent", 0), 0)

        # Validate Drives
        self.assertIsInstance(specs["drives"], list)
        if len(specs["drives"]) > 0:
            drive = specs["drives"][0]
            self.assertIn("mountpoint", drive)
            self.assertIn("total_bytes", drive)
            self.assertIn("free_bytes", drive)
            self.assertIn("status", drive)

    def test_get_live_metrics_structure(self):
        metrics = get_live_metrics()
        self.assertIn("cpu_percent", metrics)
        self.assertIn("ram_percent", metrics)
        self.assertIn("ram_used_bytes", metrics)
        self.assertIn("ram_total_bytes", metrics)
        self.assertIn("disk_read_bytes_sec", metrics)
        self.assertIn("disk_write_bytes_sec", metrics)
        self.assertIn("net_sent_bytes_sec", metrics)
        self.assertIn("net_recv_bytes_sec", metrics)
        self.assertIn("uptime_seconds", metrics)
        self.assertIn("uptime_formatted", metrics)

    def test_live_tracker_class(self):
        tracker = LiveMetricsTracker()
        m1 = tracker.get_metrics()
        self.assertIsInstance(m1["cpu_percent"], float)
        self.assertGreaterEqual(m1["ram_percent"], 0)


if __name__ == "__main__":
    unittest.main()
