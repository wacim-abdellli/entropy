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
}


def _get_dir_size(path: str) -> int:
    """Calculate total size of directory in bytes iteratively."""
    total = 0
    try:
        for root, _, files in os.walk(path):
            for f in files:
                try:
                    fp = os.path.join(root, f)
                    if not os.path.islink(fp):
                        total += os.path.getsize(fp)
                except (OSError, IOError):
                    pass
    except Exception as e:
        logger.debug("Failed to calculate dir size for %s: %s", path, e)
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
    except Exception as e:
        logger.debug("Error scanning artifacts in %s: %s", project_path, e)

    return artifacts
