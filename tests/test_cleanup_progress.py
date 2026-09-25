"""
Unit tests for CleanupProgressTracker in core/cleanup_progress.py.
"""

import unittest
from core.cleanup_progress import CleanupProgressTracker


class TestCleanupProgressTracker(unittest.TestCase):
    def test_tracker_lifecycle(self):
        tracker = CleanupProgressTracker()
        self.assertFalse(tracker.is_running)
        self.assertFalse(tracker.done)

        tracker.start("Testing Phase 1")
        self.assertTrue(tracker.is_running)
        self.assertEqual(tracker.current_phase, "Testing Phase 1")
        self.assertEqual(tracker.percent, 0)
        self.assertEqual(tracker.bytes_freed, 0)

        # Update progress
        tracker.update(
            current_file="foo.tmp",
            bytes_delta=1024,
            deleted_count=1,
            skipped_count=0,
            percent=25,
            log_line="Deleted foo.tmp",
        )
        snap = tracker.snapshot()
        self.assertEqual(snap["current_file"], "foo.tmp")
        self.assertEqual(snap["bytes_freed"], 1024)
        self.assertEqual(snap["items_deleted"], 1)
        self.assertEqual(snap["percent"], 25)
        self.assertIn("Deleted foo.tmp", snap["recent_logs"])

        # Change phase
        tracker.set_phase("Testing Phase 2", percent=50)
        self.assertEqual(tracker.current_phase, "Testing Phase 2")
        self.assertEqual(tracker.percent, 50)

        # Finish tracker
        summary = {"total_freed_bytes": 2048, "total_deleted_count": 2, "total_skipped_count": 0}
        tracker.finish(summary=summary)
        self.assertFalse(tracker.is_running)
        self.assertTrue(tracker.done)
        self.assertEqual(tracker.percent, 100)
        self.assertEqual(tracker.summary, summary)

        # Reset
        tracker.reset()
        self.assertFalse(tracker.is_running)
        self.assertFalse(tracker.done)
        self.assertEqual(tracker.percent, 0)
        self.assertEqual(tracker.bytes_freed, 0)


if __name__ == "__main__":
    unittest.main()
