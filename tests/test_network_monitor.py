"""Unit tests for the network_monitor module."""

import unittest
from unittest.mock import MagicMock, patch

from core.network_monitor import (
    NetworkConnectionItem,
    get_network_connections,
    get_port_diagnostics,
)


class TestNetworkMonitor(unittest.TestCase):
    def test_network_connection_item_dict(self):
        item = NetworkConnectionItem(
            id="conn:TCP:3000:1234",
            fd=4,
            family="IPv4",
            protocol="TCP",
            local_ip="127.0.0.1",
            local_port=3000,
            remote_ip=None,
            remote_port=None,
            status="LISTEN",
            pid=1234,
            process_name="node.exe",
            exe_path="C:\\Program Files\\nodejs\\node.exe",
            cmdline_preview="node server.js",
            is_listening=True,
            is_dev=True,
            is_protected=False,
        )
        d = item.to_dict()
        self.assertEqual(d["local_port"], 3000)
        self.assertTrue(d["is_listening"])
        self.assertTrue(d["is_dev"])
        self.assertFalse(d["is_protected"])

    def test_get_network_connections_live(self):
        conns = get_network_connections()
        self.assertIsInstance(conns, list)
        if conns:
            first = conns[0]
            self.assertIn("local_port", first)
            self.assertIn("protocol", first)
            self.assertIn("status", first)

    def test_get_port_diagnostics_live(self):
        # Even if not occupied, it returns a structured dict
        diag = get_port_diagnostics(65534)
        self.assertIn("is_occupied", diag)
        self.assertIn("message", diag)


if __name__ == "__main__":
    unittest.main()
