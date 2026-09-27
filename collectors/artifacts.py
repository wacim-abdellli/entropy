"""
Artifacts collector module.

Identifies disposable build folders (node_modules, target, .venv, build, bin, obj, etc.)
across workspace roots and calculates their exact disk consumption.
"""

from __future__ import annotations

import logging
import os

from core.entities import Project

logger = logging.getLogger(__name__)

# Strictly whitelisted disposable build artifact folder names per ecosystem
DISPOSABLE_FOLDER_NAMES = {
    # Node.js
    "node_modules": ("node", "Node.js Dependencies"),
    ".next": ("node", "Next.js Build Cache"),
    ".nuxt": ("node", "Nuxt Build Cache"),

    # Rust & Cargo
    "target": ("rust", "Rust Build Target"),

    # Python
    ".venv": ("python", "Python Virtual Environment"),
    "venv": ("python", "Python Virtual Environment"),
    "__pycache__": ("python", "Python Bytecode Cache"),
    ".pytest_cache": ("python", "Pytest Cache"),

    # Flutter & Dart
    "build": ("flutter", "Flutter Build Directory"),
    ".dart_tool": ("flutter", "Dart Tooling Cache"),

    # .NET & C#
    "bin": ("dotnet", ".NET Binary Output"),
    "obj": ("dotnet", ".NET Intermediate Objects"),

    # Java / Maven / Gradle
    ".gradle": ("java", "Gradle Build Cache"),

    # IDE & Build Tools
    ".vs": ("dotnet", "Visual Studio Solution Cache"),
    ".turbo": ("node", "Turborepo Build Cache"),
    ".parcel-cache": ("node", "Parcel Build Cache"),
    "cmake-build-debug": ("cpp", "CMake Debug Build Output"),
    "cmake-build-release": ("cpp", "CMake Release Build Output"),
    "coverage": ("test", "Test Coverage Report Output"),
}


import time

def _get_dir_size(path: str, timeout_seconds: float = 0.5) -> int:
    """Calculate total size of directory in bytes quickly using os.scandir, capped by timeout."""
    total = 0
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
                            total += entry.stat(follow_symlinks=False).st_size
                        elif entry.is_dir(follow_symlinks=False):
                            stack.append(entry.path)
                    except OSError:
                        pass
        except OSError:
            pass
    return total


def collect_project_artifacts(project_path: str) -> list[dict[str, any]]:
    """
    Scans a workspace project directory for disposable build artifact folders.
    
    Returns a list of dicts:
    [
        {
            "path": "C:\\dev\\app\\node_modules",
            "name": "node_modules",
            "category": "node",
            "label": "Node.js Dependencies",
            "size_bytes": 850000000,
            "project_path": "C:\\dev\\app"
        },
        ...
    ]
    """
    artifacts: list[dict[str, any]] = []
    if not os.path.isdir(project_path):
        return artifacts

    try:
        with os.scandir(project_path) as entries:
            for entry in entries:
                if entry.is_dir(follow_symlinks=False):
                    folder_name = entry.name
                    if folder_name in DISPOSABLE_FOLDER_NAMES:
                        category, label = DISPOSABLE_FOLDER_NAMES[folder_name]
                        folder_path = os.path.abspath(entry.path)
                        size_bytes = _get_dir_size(folder_path)
                        artifacts.append({
                            "path": folder_path,
                            "name": folder_name,
                            "category": category,
                            "label": label,
                            "size_bytes": size_bytes,
                            "project_path": os.path.abspath(project_path),
                        })

        # Monorepo nested inspection: check packages/*, apps/*, services/*, modules/*
        monorepo_parent_dirs = ("packages", "apps", "services", "modules")
        for parent_name in monorepo_parent_dirs:
            parent_path = os.path.join(project_path, parent_name)
            if os.path.isdir(parent_path):
                try:
                    with os.scandir(parent_path) as sub_entries:
                        for sub_entry in sub_entries:
                            if sub_entry.is_dir(follow_symlinks=False):
                                try:
                                    with os.scandir(sub_entry.path) as pkg_entries:
                                        for pkg_entry in pkg_entries:
                                            if pkg_entry.is_dir(follow_symlinks=False):
                                                p_name = pkg_entry.name
                                                if p_name in DISPOSABLE_FOLDER_NAMES:
                                                    cat, lbl = DISPOSABLE_FOLDER_NAMES[p_name]
                                                    f_path = os.path.abspath(pkg_entry.path)
                                                    s_bytes = _get_dir_size(f_path)
                                                    artifacts.append({
                                                        "path": f_path,
                                                        "name": f"{sub_entry.name}/{p_name}",
                                                        "category": cat,
                                                        "label": f"{sub_entry.name} {lbl}",
                                                        "size_bytes": s_bytes,
                                                        "project_path": os.path.abspath(project_path),
                                                    })
                                except OSError:
                                    pass
                except OSError:
                    pass
    except Exception as e:
        logger.debug("Error scanning artifacts in %s: %s", project_path, e)

    return artifacts
