"""
Disk cleaner module.

Provides safe, audited directory deletion for whitelisted build artifacts
(node_modules, target, .venv, build, bin, obj, etc.).

Strictly enforces safety boundaries:
- NEVER deletes .git directories or root workspace folders
- ONLY deletes directories matching the explicit DISPOSABLE_NAMES whitelist
- Requires valid absolute directory paths
"""

from __future__ import annotations

import logging
import os
import shutil
import stat
from typing import Any, Dict, List

from core.cleanup_progress import progress_tracker

logger = logging.getLogger(__name__)

ALLOWED_DISPOSABLE_NAMES = {
    "node_modules",
    "target",
    ".venv",
    "venv",
    "__pycache__",
    ".pytest_cache",
    "build",
    ".dart_tool",
    "bin",
    "obj",
    ".next",
    ".nuxt",
    ".gradle",
}


def _remove_readonly(func, path, excinfo):
    """Error handler for shutil.rmtree to remove read-only file attributes on Windows."""
    try:
        os.chmod(path, stat.S_IWRITE)
        func(path)
    except Exception as e:
        logger.debug("Failed to reset permissions on %s: %s", path, e)


def is_safe_to_clean(path: str) -> tuple[bool, str]:
    """
    Validates whether a target directory is safe to clean.
    
    Returns (is_safe, error_reason).
    """
    if not path or not isinstance(path, str):
        return False, "Invalid path format."

    abs_path = os.path.abspath(path)

    if not os.path.exists(abs_path):
        return False, f"Path '{abs_path}' does not exist."

    if not os.path.isdir(abs_path):
        return False, f"Path '{abs_path}' is a file, not a directory."

    folder_name = os.path.basename(abs_path)

    # Protection Rule 1: Folder name MUST be in the whitelisted disposable set
    if folder_name not in ALLOWED_DISPOSABLE_NAMES:
        return False, f"Folder '{folder_name}' is not in the disposable build artifact whitelist."

    # Protection Rule 2: Cannot be root drive or user home directory
    user_home = os.path.expanduser("~")
    if abs_path in (user_home, os.path.abspath("/"), os.path.dirname(abs_path)):
        return False, f"Path '{abs_path}' is a protected system or root directory."

    # Protection Rule 3: Path cannot contain .git folder
    if ".git" in abs_path.split(os.sep):
        return False, "Target path is inside a .git repository metadata folder."

    return True, ""


def clean_artifact_directory(path: str) -> Dict[str, Any]:
    """
    Safely deletes a single whitelisted build artifact directory.
    
    Returns a result dict:
    {
        "success": bool,
        "path": str,
        "freed_bytes": int,
        "message": str,
        "error": Optional[str]
    }
    """
    abs_path = os.path.abspath(path)
    is_safe, error_reason = is_safe_to_clean(abs_path)
    if not is_safe:
        return {
            "success": False,
            "path": abs_path,
            "freed_bytes": 0,
            "error": error_reason,
        }

    # Calculate size before deletion
    freed_bytes = 0
    try:
        for root, _, files in os.walk(abs_path):
            for f in files:
                try:
                    fp = os.path.join(root, f)
                    if not os.path.islink(fp):
                        freed_bytes += os.path.getsize(fp)
                except (OSError, IOError):
                    pass
    except Exception:
        pass

    try:
        shutil.rmtree(abs_path, onerror=_remove_readonly)
        return {
            "success": True,
            "path": abs_path,
            "freed_bytes": freed_bytes,
            "message": f"Successfully deleted '{os.path.basename(abs_path)}' ({freed_bytes / (1024*1024):.1f} MB freed).",
        }
    except Exception as e:
        logger.error("Failed to delete directory %s: %s", abs_path, e)
        return {
            "success": False,
            "path": abs_path,
            "freed_bytes": 0,
            "error": f"Deletion failed: {e}",
        }


def clean_multiple_artifacts(paths: List[str]) -> Dict[str, Any]:
    """
    Deletes multiple whitelisted build artifact directories.
    Updates progress_tracker in real time for live UI feedback.
    Returns total freed bytes and results per path.
    """
    progress_tracker.start("Build Artifacts Cleanup")
    total_freed = 0
    results: List[Dict[str, Any]] = []
    success_count = 0
    failed_count = 0

    total_paths = len(paths)
    for idx, path in enumerate(paths):
        name = os.path.basename(path)
        pct = int((idx / max(1, total_paths)) * 100)
        progress_tracker.set_phase(f"Cleaning {name} ({idx + 1}/{total_paths})", percent=pct)
        progress_tracker.update(current_file=path, log_line=f"Purging directory: {name}...")

        res = clean_artifact_directory(path)
        results.append(res)
        if res["success"]:
            freed = res["freed_bytes"]
            total_freed += freed
            success_count += 1
            progress_tracker.update(
                bytes_delta=freed,
                deleted_count=1,
                log_line=f"Deleted {name} ({freed / (1024*1024):.1f} MB freed)",
            )
        else:
            failed_count += 1
            progress_tracker.update(
                skipped_count=1,
                log_line=f"Failed to delete {name}: {res.get('error')}",
            )

    progress_tracker.finish(summary={
        "total_freed_bytes": total_freed,
        "total_deleted_count": success_count,
        "total_skipped_count": failed_count,
        "results": results,
    })

    return {
        "success": failed_count == 0,
        "total_freed_bytes": total_freed,
        "success_count": success_count,
        "failed_count": failed_count,
        "results": results,
    }
