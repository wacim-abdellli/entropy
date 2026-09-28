"""
Entropy Audit Logger — Persistent, append-only deletion audit trail.

Records every destructive operation (artifact cleanup, cache purge, system cleaning)
to ~/.entropy/audit.log for forensic recovery and accountability.

Each log entry is a single JSON line containing:
- timestamp (ISO 8601)
- action (what type of cleanup)
- paths (what was targeted)
- freed_bytes (how much disk space was reclaimed)
- outcome (success/failure)
- details (additional context)
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

AUDIT_DIR = Path.home() / ".entropy"
AUDIT_FILE = AUDIT_DIR / "audit.log"


def _ensure_audit_dir() -> None:
    """Ensure the ~/.entropy directory exists."""
    try:
        AUDIT_DIR.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        logger.warning("Cannot create audit directory %s: %s", AUDIT_DIR, e)


def log_deletion(
    action: str,
    paths: List[str],
    freed_bytes: int = 0,
    outcome: str = "success",
    details: Optional[Dict[str, Any]] = None,
) -> None:
    """
    Append a single deletion audit entry to ~/.entropy/audit.log.
    
    Args:
        action: Type of cleanup (e.g., 'artifact_cleanup', 'cache_purge', 'system_cleanup').
        paths: List of absolute paths that were deleted or cleaned.
        freed_bytes: Total bytes reclaimed by this operation.
        outcome: 'success', 'partial', or 'failed'.
        details: Optional dict with additional context (error messages, counts, etc.).
    """
    _ensure_audit_dir()
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "action": action,
        "paths": paths,
        "freed_bytes": freed_bytes,
        "outcome": outcome,
        "details": details or {},
    }
    try:
        with open(AUDIT_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except OSError as e:
        logger.warning("Failed to write audit log entry: %s", e)


def log_artifact_cleanup(
    path: str,
    freed_bytes: int,
    success: bool,
    error: Optional[str] = None,
) -> None:
    """Log a single artifact directory deletion."""
    log_deletion(
        action="artifact_cleanup",
        paths=[path],
        freed_bytes=freed_bytes if success else 0,
        outcome="success" if success else "failed",
        details={"folder": os.path.basename(path), "error": error} if error else {"folder": os.path.basename(path)},
    )


def log_cache_purge(
    target_path: str,
    freed_bytes: int,
    success: bool,
    cache_name: str = "",
    error: Optional[str] = None,
) -> None:
    """Log a cache directory purge."""
    log_deletion(
        action="cache_purge",
        paths=[target_path],
        freed_bytes=freed_bytes if success else 0,
        outcome="success" if success else "failed",
        details={"cache_name": cache_name, "error": error} if error else {"cache_name": cache_name},
    )


def log_system_cleanup(
    target_id: str,
    paths: List[str],
    freed_bytes: int,
    success: bool,
    error: Optional[str] = None,
) -> None:
    """Log a system junk cleanup operation."""
    log_deletion(
        action="system_cleanup",
        paths=paths,
        freed_bytes=freed_bytes if success else 0,
        outcome="success" if success else "failed",
        details={"target_id": target_id, "error": error} if error else {"target_id": target_id},
    )
