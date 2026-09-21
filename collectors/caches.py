"""
Cache collector module.

Identifies large package manager caches, build artifact directories,
and tool storage locations across Windows developer paths.
"""

from __future__ import annotations

import logging
import os
import time
from pathlib import Path
from typing import List, Optional, Set

from core.entities import CacheDirectory

logger = logging.getLogger(__name__)


def _get_dir_size(path: str, timeout_seconds: float = 6.0) -> Optional[int]:
    """Calculate directory size in bytes without following symlinks, capped by timeout."""
    total_size = 0
    start_time = time.time()
    stack = [path]

    while stack:
        if (time.time() - start_time) > timeout_seconds:
            logger.debug(f"Timeout measuring cache directory {path}")
            return total_size

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


def collect_caches() -> List[CacheDirectory]:
    """Inspects well-known cache locations on Windows."""
    caches: List[CacheDirectory] = []
    seen_paths: Set[str] = set()

    home = Path.home()
    local_appdata = Path(os.environ.get("LOCALAPPDATA", str(home / "AppData" / "Local")))
    roaming_appdata = Path(os.environ.get("APPDATA", str(home / "AppData" / "Roaming")))

    candidate_locations = [
        (home / ".nuget" / "packages", "nuget", "NuGet package cache"),
        (home / ".gradle" / "caches", "gradle", "Gradle cache"),
        (home / ".m2" / "repository", "maven", "Maven repository cache"),
        (home / ".cargo" / "registry", "cargo", "Cargo registry cache"),
        (home / ".cargo" / "git", "cargo", "Cargo git cache"),
        (local_appdata / "pip" / "cache", "pip", "pip wheel cache"),
        (home / ".cache" / "pip", "pip", "pip cache"),
        (roaming_appdata / "npm-cache", "npm", "npm cache"),
        (local_appdata / "npm-cache", "npm", "npm cache"),
        (home / ".npm", "npm", "npm cache"),
        (local_appdata / "yarn" / "Cache", "yarn", "Yarn cache"),
        (local_appdata / "pnpm" / "store", "pnpm", "pnpm store"),
        (roaming_appdata / "Composer" / "cache", "composer", "Composer cache"),
        (home / "go" / "pkg" / "mod", "go", "Go module cache"),
    ]

    from concurrent.futures import ThreadPoolExecutor

    to_measure = []
    for cpath, cat, desc in candidate_locations:
        if cpath.is_dir():
            norm_path = os.path.abspath(str(cpath))
            if norm_path not in seen_paths:
                seen_paths.add(norm_path)
                to_measure.append((norm_path, cat, desc))

    # Inspect subdirectories in ~/.cache if it exists
    dot_cache = home / ".cache"
    if dot_cache.is_dir():
        try:
            for entry in dot_cache.iterdir():
                if entry.is_dir():
                    norm_path = os.path.abspath(str(entry))
                    if norm_path not in seen_paths:
                        seen_paths.add(norm_path)
                        to_measure.append((norm_path, "general", f"{entry.name} cache"))
        except OSError:
            pass

    if to_measure:
        with ThreadPoolExecutor(max_workers=min(6, len(to_measure))) as executor:
            sizes = list(executor.map(lambda item: _get_dir_size(item[0]), to_measure))
        for (norm_path, cat, desc), sz in zip(to_measure, sizes):
            caches.append(
                CacheDirectory(
                    entity_id=f"cache:{norm_path}",
                    path=norm_path,
                    size_bytes=sz,
                    category=cat,
                    description=desc,
                )
            )

    # Sort descending by size
    caches.sort(key=lambda c: c.size_bytes or 0, reverse=True)
    return caches
