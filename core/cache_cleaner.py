"""
Global Package Cache Cleaner for Entropy.

Provides safe, audited purging of global developer package caches:
- npm cache (`AppData/Roaming/npm-cache`, `~/.npm`)
- pip cache (`AppData/Local/pip/cache`, `~/.cache/pip`)
- yarn cache (`AppData/Local/yarn/Cache`)
- pnpm store (`AppData/Local/pnpm/store`)
- Cargo cache (`~/.cargo/registry/cache`, `~/.cargo/git`)
- Gradle cache (`~/.gradle/caches`)
- NuGet packages (`~/.nuget/packages`)

Safety boundaries:
- ONLY deletes within verified, known package manager cache directories
- Never deletes arbitrary user folders, source code, or system directories
- Empties directory contents and recreates root directory to keep tools stable
"""

from __future__ import annotations

import logging
import os
import shutil
import stat
from pathlib import Path
from typing import Any, Dict, List, Optional

import time
from concurrent.futures import ThreadPoolExecutor

from core.cleanup_progress import progress_tracker

logger = logging.getLogger(__name__)


def _remove_readonly(func, path, excinfo):
    """Error handler for shutil.rmtree to remove read-only file attributes on Windows."""
    try:
        os.chmod(path, stat.S_IWRITE)
        func(path)
    except Exception as e:
        logger.debug("Failed to reset permissions on %s: %s", path, e)


def _calc_dir_size(path: str, timeout_seconds: float = 2.0) -> int:
    """Calculate directory size in bytes without following symlinks, capped by timeout."""
    total_size = 0
    start_time = time.time()
    stack = [path]

    while stack:
        if (time.time() - start_time) > timeout_seconds:
            break

        cur = stack.pop()
        try:
            with os.scandir(cur) as it:
                for entry in it:
                    try:
                        if entry.is_file(follow_symlinks=False):
                            total_size += entry.stat(follow_symlinks=False).st_size
                        elif entry.is_dir(follow_symlinks=False):
                            stack.append(entry.path)
                    except OSError:
                        pass
        except OSError:
            pass

    return total_size


def get_known_cache_targets() -> List[Dict[str, Any]]:
    """Return list of known global package cache definitions and paths on this machine."""
    home = Path.home()
    local_appdata = Path(os.environ.get("LOCALAPPDATA", str(home / "AppData" / "Local")))
    roaming_appdata = Path(os.environ.get("APPDATA", str(home / "AppData" / "Roaming")))

    candidates = [
        ("npm", "npm Cache", str(roaming_appdata / "npm-cache"), "npm package and tarball cache"),
        ("npm_local", "npm Local Cache", str(local_appdata / "npm-cache"), "npm local build cache"),
        ("npm_home", "npm Home Cache", str(home / ".npm"), "npm ~/.npm metadata and tarballs"),
        ("pip", "pip Wheel Cache", str(local_appdata / "pip" / "cache"), "pip downloaded wheel & HTTP cache"),
        ("pip_home", "pip User Cache", str(home / ".cache" / "pip"), "pip user cache"),
        ("yarn", "Yarn Cache", str(local_appdata / "yarn" / "Cache"), "Yarn global package archive cache"),
        ("pnpm", "pnpm Store", str(local_appdata / "pnpm" / "store"), "pnpm content-addressable package store"),
        ("cargo_registry", "Cargo Registry Cache", str(home / ".cargo" / "registry" / "cache"), "Cargo downloaded .crate archives"),
        ("cargo_git", "Cargo Git Checkouts", str(home / ".cargo" / "git" / "checkouts"), "Cargo cloned git repository checkouts"),
        ("gradle", "Gradle Build Cache", str(home / ".gradle" / "caches"), "Gradle downloaded dependencies and build artifacts"),
        ("nuget", "NuGet Packages Cache", str(home / ".nuget" / "packages"), "NuGet downloaded packages cache"),
    ]

    to_measure = []
    seen_paths = set()

    for cid, label, cpath, desc in candidates:
        abs_p = os.path.abspath(cpath)
        if os.path.isdir(abs_p) and abs_p not in seen_paths:
            seen_paths.add(abs_p)
            to_measure.append((cid, label, abs_p, desc))

    if not to_measure:
        return []

    with ThreadPoolExecutor(max_workers=min(6, len(to_measure))) as executor:
        sizes = list(executor.map(lambda item: _calc_dir_size(item[2]), to_measure))

    discovered = []
    for (cid, label, abs_p, desc), size in zip(to_measure, sizes):
        discovered.append({
            "id": cid,
            "label": label,
            "path": abs_p,
            "description": desc,
            "size_bytes": size,
            "safe_to_purge": True,
        })

    return discovered


def is_safe_cache_path(path: str) -> tuple[bool, str]:
    """Validate whether target directory matches a known safe global cache."""
    if not path or not isinstance(path, str):
        return False, "Invalid path."

    abs_p = os.path.abspath(path)
    if not os.path.isdir(abs_p):
        return False, f"Directory '{abs_p}' does not exist."

    # Validate against known cache paths
    known_targets = get_known_cache_targets()
    known_paths = {t["path"].lower() for t in known_targets}

    if abs_p.lower() not in known_paths:
        return False, f"Path '{abs_p}' is not in the recognized global cache registry."

    user_home = os.path.abspath(str(Path.home())).lower()
    if abs_p.lower() == user_home or abs_p.lower() == os.path.dirname(user_home):
        return False, "Cannot delete user home or root directory."

    return True, ""


def purge_system_cache(target_path_or_id: str) -> Dict[str, Any]:
    """
    Safely purge a recognized global developer cache directory.
    Empties all files and folders inside it, then recreates the empty root.
    """
    # Check if target is an ID
    known_targets = get_known_cache_targets()
    target_path = None
    target_label = target_path_or_id

    for t in known_targets:
        if t["id"] == target_path_or_id or t["path"].lower() == os.path.abspath(target_path_or_id).lower():
            target_path = t["path"]
            target_label = t["label"]
            break

    if not target_path:
        target_path = os.path.abspath(target_path_or_id)

    is_safe, error_reason = is_safe_cache_path(target_path)
    if not is_safe:
        return {
            "success": False,
            "path": target_path,
            "freed_bytes": 0,
            "error": error_reason,
        }

    size_before = _calc_dir_size(target_path)

    try:
        # Delete contents inside target directory
        for entry in os.listdir(target_path):
            entry_path = os.path.join(target_path, entry)
            try:
                if os.path.isdir(entry_path) and not os.path.islink(entry_path):
                    shutil.rmtree(entry_path, onerror=_remove_readonly)
                else:
                    os.chmod(entry_path, stat.S_IWRITE)
                    os.unlink(entry_path)
            except Exception as e:
                logger.debug("Could not remove item %s: %s", entry_path, e)

        size_after = _calc_dir_size(target_path)
        freed = max(0, size_before - size_after)

        return {
            "success": True,
            "id": target_path_or_id,
            "label": target_label,
            "path": target_path,
            "freed_bytes": freed,
            "message": f"Purged {target_label}: {freed / (1024*1024):.1f} MB freed.",
        }
    except Exception as e:
        logger.error("Failed to purge cache at %s: %s", target_path, e)
        return {
            "success": False,
            "id": target_path_or_id,
            "label": target_label,
            "path": target_path,
            "freed_bytes": 0,
            "error": f"Failed to purge cache: {e}",
        }


def purge_multiple_caches(targets: List[str]) -> Dict[str, Any]:
    """
    Purge multiple recognized global developer cache directories.
    Updates progress_tracker in real time for live UI feedback.
    """
    progress_tracker.start("Package Caches Purge")
    total_freed = 0
    results = []
    success_count = 0
    failed_count = 0

    total_targets = len(targets)
    for idx, target in enumerate(targets):
        pct = int((idx / max(1, total_targets)) * 100)
        progress_tracker.set_phase(f"Purging cache {target} ({idx + 1}/{total_targets})", percent=pct)
        progress_tracker.update(current_file=target, log_line=f"Emptying cache: {target}...")

        res = purge_system_cache(target)
        results.append(res)
        if res["success"]:
            freed = res.get("freed_bytes", 0)
            total_freed += freed
            success_count += 1
            progress_tracker.update(
                bytes_delta=freed,
                deleted_count=1,
                log_line=f"Purged {res.get('label', target)} ({freed / (1024*1024):.1f} MB freed)",
            )
        else:
            failed_count += 1
            progress_tracker.update(
                skipped_count=1,
                log_line=f"Failed to purge {res.get('label', target)}: {res.get('error')}",
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
