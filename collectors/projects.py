"""
Project collector module.

Walks directories from a scan root, identifies development project roots via
sentinel files, collects Windows filesystem creation and modification timestamps,
and isolates dependency directories (node_modules, venvs, targets, etc.).
"""

from __future__ import annotations

import logging
import os
import time
from typing import List, Optional, Set, Tuple

from core.entities import (
    ActivityLevel,
    DependencyEnvironment,
    Project,
    ProjectType,
)

logger = logging.getLogger(__name__)

# Directories to avoid recursing INTO during project search
SKIP_DIRS = {
    "node_modules", ".git", "venv", ".venv", "__pycache__", "target", "build",
    "dist", ".next", "vendor", ".cache", ".local", ".config", "AppData",
    "$Recycle.Bin", "System Volume Information", "Windows", "Program Files",
    "Program Files (x86)", "ProgramData", "$WinREAgent", "Recovery"
}

DEPENDENCY_DIR_NAMES = {
    "node_modules": "node_modules",
    "venv": "venv",
    ".venv": "venv",
    "vendor": "vendor",
    "target": "target",
}

LOCKFILES = {
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "Pipfile.lock",
    "poetry.lock", "Cargo.lock", "composer.lock", "go.sum", "Gemfile.lock"
}

RUNTIME_HINT_FILES = {
    ".nvmrc", ".node-version", ".python-version", ".ruby-version",
    ".tool-versions", ".java-version"
}


def _get_dir_size(path: str, timeout_seconds: float = 0.75) -> int:
    """Calculate directory size in bytes iteratively without following symlinks, capped by timeout."""
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
                            if entry.name not in SKIP_DIRS:
                                stack.append(entry.path)
                    except OSError:
                        pass
        except OSError:
            pass
    return total_size


def _detect_project_type_and_sentinels(
    entries: List[os.DirEntry],
) -> Tuple[ProjectType, List[str]]:
    """Determine project type and matching sentinel files from directory entries."""
    sentinels: List[str] = []
    ptype = ProjectType.UNKNOWN

    filenames = {e.name for e in entries if e.is_file()}
    dirnames = {e.name for e in entries if e.is_dir()}

    if ".git" in dirnames or ".git" in filenames:
        sentinels.append(".git")

    if "package.json" in filenames:
        sentinels.append("package.json")
        ptype = ProjectType.NODE
    elif "Cargo.toml" in filenames:
        sentinels.append("Cargo.toml")
        ptype = ProjectType.RUST
    elif "pubspec.yaml" in filenames:
        sentinels.append("pubspec.yaml")
        ptype = ProjectType.FLUTTER
    elif "pyproject.toml" in filenames or "setup.py" in filenames or "requirements.txt" in filenames:
        if "pyproject.toml" in filenames:
            sentinels.append("pyproject.toml")
        if "setup.py" in filenames:
            sentinels.append("setup.py")
        if "requirements.txt" in filenames:
            sentinels.append("requirements.txt")
        ptype = ProjectType.PYTHON
    elif "go.mod" in filenames:
        sentinels.append("go.mod")
        ptype = ProjectType.GO
    elif "composer.json" in filenames:
        sentinels.append("composer.json")
        ptype = ProjectType.PHP
    elif "Gemfile" in filenames:
        sentinels.append("Gemfile")
        ptype = ProjectType.RUBY
    elif "pom.xml" in filenames or "build.gradle" in filenames:
        if "pom.xml" in filenames:
            sentinels.append("pom.xml")
        if "build.gradle" in filenames:
            sentinels.append("build.gradle")
        ptype = ProjectType.JAVA
    else:
        for fname in filenames:
            if fname.endswith(".csproj") or fname.endswith(".sln"):
                sentinels.append(fname)
                ptype = ProjectType.DOTNET
                break

    return ptype, sentinels


def collect_projects_and_dependencies(
    scan_root: str,
    max_depth: int = 5,
) -> Tuple[List[Project], List[DependencyEnvironment]]:
    """
    Scans scan_root up to max_depth for projects and their dependency environments.
    Returns (projects, dependency_environments).
    """
    projects: List[Project] = []
    dep_envs: List[DependencyEnvironment] = []
    current_time = time.time()

    # Queue of (path, current_depth)
    dirs_to_visit = [(os.path.abspath(scan_root), 0)]

    while dirs_to_visit:
        current_dir, depth = dirs_to_visit.pop(0)

        if depth > max_depth:
            continue

        try:
            entries = list(os.scandir(current_dir))
        except (PermissionError, OSError) as e:
            logger.debug(f"Cannot access {current_dir}: {e}")
            continue

        ptype, sentinels = _detect_project_type_and_sentinels(entries)

        # A project is recognized if it has a detected project type or a .git directory
        if ptype != ProjectType.UNKNOWN or ".git" in sentinels:
            # Filesystem timestamps
            stat_info = None
            try:
                stat_info = os.stat(current_dir)
            except OSError:
                pass

            created_ts = stat_info.st_ctime if stat_info else None
            mtime_ts = stat_info.st_mtime if stat_info else None

            # Runtime version hint (e.g. .nvmrc, .python-version)
            runtime_hint: Optional[str] = None
            for entry in entries:
                if entry.is_file() and entry.name in RUNTIME_HINT_FILES:
                    try:
                        # Safe read: limit to 100 bytes (hints are version strings like '20.10.0')
                        with open(entry.path, "r", encoding="utf-8", errors="ignore") as f:
                            hint_content = f.read(100).strip()
                            if hint_content:
                                runtime_hint = hint_content
                                break
                    except OSError:
                        pass

            # Inspect dependency folders and lockfiles in this project
            lockfile_latest_mtime: Optional[float] = None
            for entry in entries:
                if entry.is_file() and entry.name in LOCKFILES:
                    try:
                        lm = entry.stat().st_mtime
                        if lockfile_latest_mtime is None or lm > lockfile_latest_mtime:
                            lockfile_latest_mtime = lm
                    except OSError:
                        pass

                elif entry.is_dir(follow_symlinks=False):
                    dep_kind = DEPENDENCY_DIR_NAMES.get(entry.name)
                    if dep_kind:
                        dep_size = _get_dir_size(entry.path)
                        dep_envs.append(
                            DependencyEnvironment(
                                entity_id=f"dep:{os.path.abspath(entry.path)}",
                                path=os.path.abspath(entry.path),
                                dep_type=dep_kind,
                                size_bytes=dep_size,
                                lockfile_mtime=lockfile_latest_mtime,
                            )
                        )

            # Sample immediate entries for latest modified timestamp if directory mtime is stale
            try:
                latest_entry_mtime = max(
                    (e.stat().st_mtime for e in entries if not e.name.startswith(".")),
                    default=mtime_ts or current_time,
                )
            except (ValueError, OSError):
                latest_entry_mtime = mtime_ts

            # Project total size
            total_size = _get_dir_size(current_dir)

            project = Project(
                entity_id=f"project:{os.path.abspath(current_dir)}",
                path=os.path.abspath(current_dir),
                project_type=ptype,
                total_size_bytes=total_size,
                created=created_ts,
                last_modified=latest_entry_mtime,
                detected_sentinels=sentinels,
                activity=ActivityLevel.UNKNOWN,  # Linkers/git will classify activity level accurately
                runtime_version_hint=runtime_hint,
            )
            projects.append(project)

            # Boundary rule: do not recurse into a detected project looking for nested projects
            continue

        # If not a project, queue subdirectories for traversal
        for entry in entries:
            if entry.is_dir(follow_symlinks=False):
                if entry.name in SKIP_DIRS:
                    continue
                if entry.name.startswith(".") and entry.name != ".git":
                    continue
                dirs_to_visit.append((entry.path, depth + 1))

    return projects, dep_envs
