"""
Real-Time Cleanup Progress Tracker for Entropy Workstation Orchestrator.

Provides thread-safe state tracking, live file tickers, and activity logs
so the desktop interface can render real-time progress bars, rolling file paths,
and transparent reclamation statistics.
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class CleanupProgressTracker:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.reset()

    def reset(self) -> None:
        with self._lock:
            self.is_running = False
            self.current_phase = ""
            self.current_file = ""
            self.items_deleted = 0
            self.items_skipped = 0
            self.bytes_freed = 0
            self.percent = 0
            self.recent_logs: List[str] = []
            self.done = False
            self.error: Optional[str] = None
            self.start_time: float = 0
            self.summary: Optional[Dict[str, Any]] = None

    def start(self, phase_name: str) -> None:
        with self._lock:
            self.is_running = True
            self.current_phase = phase_name
            self.current_file = ""
            self.items_deleted = 0
            self.items_skipped = 0
            self.bytes_freed = 0
            self.percent = 0
            self.recent_logs = [f"Initializing {phase_name}..."]
            self.done = False
            self.error = None
            self.start_time = time.time()
            self.summary = None

    def update(
        self,
        current_file: str = "",
        bytes_delta: int = 0,
        deleted_count: int = 0,
        skipped_count: int = 0,
        percent: Optional[int] = None,
        log_line: Optional[str] = None,
    ) -> None:
        with self._lock:
            if current_file:
                self.current_file = current_file
            if bytes_delta > 0:
                self.bytes_freed += bytes_delta
            if deleted_count > 0:
                self.items_deleted += deleted_count
            if skipped_count > 0:
                self.items_skipped += skipped_count
            if percent is not None:
                self.percent = min(100, max(0, percent))
            if log_line:
                self.recent_logs.append(log_line)
                if len(self.recent_logs) > 60:
                    self.recent_logs = self.recent_logs[-60:]

    def set_phase(self, phase_name: str, percent: Optional[int] = None) -> None:
        with self._lock:
            self.current_phase = phase_name
            if percent is not None:
                self.percent = min(100, max(0, percent))
            self.recent_logs.append(f"→ {phase_name}")
            if len(self.recent_logs) > 60:
                self.recent_logs = self.recent_logs[-60:]

    def finish(self, summary: Optional[Dict[str, Any]] = None, error: Optional[str] = None) -> None:
        with self._lock:
            self.is_running = False
            self.done = True
            self.percent = 100
            self.error = error
            elapsed = round(time.time() - self.start_time, 2) if self.start_time else 0
            self.summary = summary or {
                "total_freed_bytes": self.bytes_freed,
                "total_deleted_count": self.items_deleted,
                "total_skipped_count": self.items_skipped,
                "elapsed_seconds": elapsed,
            }
            if error:
                self.recent_logs.append(f"Completed with warning/error: {error}")
            else:
                self.recent_logs.append(f"Successfully finished in {elapsed}s.")

    def snapshot(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "is_running": self.is_running,
                "current_phase": self.current_phase,
                "current_file": self.current_file,
                "items_deleted": self.items_deleted,
                "items_skipped": self.items_skipped,
                "bytes_freed": self.bytes_freed,
                "percent": self.percent,
                "recent_logs": list(self.recent_logs),
                "done": self.done,
                "error": self.error,
                "summary": self.summary,
            }


# Singleton tracker shared across modules
progress_tracker = CleanupProgressTracker()
