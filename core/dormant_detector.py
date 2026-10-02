"""
Entropy Smart Dormant Space Reclaimer & Recommendation Engine.

Detects idle, obsolete, and reconstructible storage consumers across Windows developer systems:
1. Dormant Workspaces: Projects untouched for >30-90 days with heavy build folders (node_modules, target, .venv).
2. Stale Downloads: Obsolete setup installers (.exe, .msi) and heavy archives (.zip, .iso) older than 30 days.
3. AI & ML Models: Hugging Face and Ollama model weights taking gigabytes of SSD space.
"""

from __future__ import annotations

import logging
import os
import subprocess
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

from core.audit_log import log_deletion
from core.config import get_scan_roots
from core.disk_cleaner import clean_artifact_directory
from core.large_files import _send_to_recycle_bin

logger = logging.getLogger(__name__)

# Reconstructible artifact folders that can be safely purged from dormant projects
RECONSTRUCTIBLE_FOLDERS: Dict[str, str] = {
    "node_modules": "npm install",
    "target": "cargo build",
    ".venv": "python -m venv .venv",
    "venv": "python -m venv venv",
    ".next": "npm run build",
    ".nuxt": "npm run build",
    "build": "npm run build / make",
    "dist": "npm run build",
    "bin": "dotnet build",
    "obj": "dotnet build",
    ".gradle": "gradle build",
}

STALE_EXTENSIONS: Set[str] = {
    ".exe",
    ".msi",
    ".iso",
    ".zip",
    ".tar",
    ".gz",
    ".tgz",
    ".7z",
    ".rar",
    ".cab",
    ".pkg",
}


def _get_dir_size(path: str, timeout_seconds: float = 3.0) -> int:
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


def _format_bytes(num_bytes: int) -> str:
    """Format bytes into human-readable string."""
    if num_bytes <= 0:
        return "0 B"
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if abs(num_bytes) < 1024.0:
            return f"{num_bytes:3.1f} {unit}"
        num_bytes /= 1024.0
    return f"{num_bytes:.1f} PB"


def _detect_rebuild_command(project_path: str, artifact_name: str) -> str:
    """Infer the exact package manager rebuild recipe from lockfiles in the project."""
    norm = artifact_name.lower()
    if norm in ("node_modules", ".next", ".nuxt"):
        if os.path.exists(os.path.join(project_path, "pnpm-lock.yaml")):
            return "pnpm install"
        if os.path.exists(os.path.join(project_path, "yarn.lock")):
            return "yarn install"
        if os.path.exists(os.path.join(project_path, "bun.lockb")) or os.path.exists(os.path.join(project_path, "bun.lock")):
            return "bun install"
        if os.path.exists(os.path.join(project_path, "package-lock.json")):
            return "npm install"
        return "npm install"

    if norm == "target":
        return "cargo build"

    if norm in (".venv", "venv"):
        if os.path.exists(os.path.join(project_path, "poetry.lock")):
            return "poetry install"
        if os.path.exists(os.path.join(project_path, "Pipfile")):
            return "pipenv install"
        if os.path.exists(os.path.join(project_path, "requirements.txt")):
            return "pip install -r requirements.txt"
        return "python -m venv .venv"

    return RECONSTRUCTIBLE_FOLDERS.get(norm, "rebuild project")


def _get_workspace_last_active(workspace_path: str) -> Tuple[float, bool, bool]:
    """
    Determine the last activity timestamp of a workspace.
    Returns: (timestamp, is_git, is_clean)
    """
    git_dir = os.path.join(workspace_path, ".git")
    if os.path.isdir(git_dir):
        try:
            # 1. Check last commit timestamp
            cmd = ["git", "-C", workspace_path, "log", "-1", "--format=%ct"]
            proc = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=4,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            commit_time = 0.0
            if proc.returncode == 0 and proc.stdout.strip().isdigit():
                commit_time = float(proc.stdout.strip())

            # 2. Check git status clean/dirty
            status_cmd = ["git", "-C", workspace_path, "status", "--porcelain"]
            status_proc = subprocess.run(
                status_cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=4,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            is_clean = status_proc.returncode == 0 and not status_proc.stdout.strip()

            if commit_time > 0:
                return commit_time, True, is_clean
        except Exception:
            pass

    # Fallback: check workspace folder modification time
    try:
        mtime = os.path.getmtime(workspace_path)
        return mtime, False, True
    except OSError:
        return time.time(), False, True


def detect_dormant_workspaces(
    roots: Optional[List[str]] = None,
    inactivity_days_threshold: int = 30,
    min_inactivity_days: Optional[int] = None,
    min_reclaimable_mb: int = 20,
    min_artifact_mb: int = 5,
) -> List[Dict[str, Any]]:
    """
    Search for workspaces inactive for >= inactivity_days_threshold that still hold heavy
    reconstructible build artifacts (node_modules, target, .venv, etc.).
    """
    if min_inactivity_days is not None:
        inactivity_days_threshold = min_inactivity_days
    if roots is None:
        roots = get_scan_roots()

    now = time.time()
    dormant_list: List[Dict[str, Any]] = []

    # First discover candidate workspace directories (up to depth 2)
    candidate_dirs: Set[str] = set()
    for root in roots:
        if not os.path.isdir(root):
            continue
        try:
            # Depth 1 & 2
            with os.scandir(root) as it:
                for entry in it:
                    if entry.is_dir(follow_symlinks=False) and not entry.name.startswith("."):
                        candidate_dirs.add(entry.path)
                        # Check one level deeper
                        try:
                            with os.scandir(entry.path) as sub_it:
                                for sub_entry in sub_it:
                                    if sub_entry.is_dir(follow_symlinks=False) and not sub_entry.name.startswith("."):
                                        candidate_dirs.add(sub_entry.path)
                        except OSError:
                            pass
        except OSError:
            pass

    for ws_path in candidate_dirs:
        # Check if directory contains recognizable project indicators
        has_sentinel = any(
            os.path.exists(os.path.join(ws_path, s))
            for s in ("package.json", "Cargo.toml", "pyproject.toml", "requirements.txt", "pom.xml", ".git")
        )
        if not has_sentinel:
            continue

        last_active, is_git, is_clean = _get_workspace_last_active(ws_path)
        inactivity_days = int((now - last_active) / 86400)

        if inactivity_days < inactivity_days_threshold:
            continue

        # Inspect reconstructible build folders inside this dormant project
        artifacts: List[Dict[str, Any]] = []
        total_reclaimable = 0

        for folder_name, default_recipe in RECONSTRUCTIBLE_FOLDERS.items():
            folder_path = os.path.join(ws_path, folder_name)
            if os.path.isdir(folder_path):
                try:
                    sz = _get_dir_size(folder_path, timeout_seconds=2.0)
                    if sz >= min_artifact_mb * 1024 * 1024:
                        rebuild_cmd = _detect_rebuild_command(ws_path, folder_name)
                        artifacts.append({
                            "name": folder_name,
                            "path": folder_path,
                            "size_bytes": sz,
                            "size_formatted": _format_bytes(sz),
                            "rebuild_command": rebuild_cmd,
                        })
                        total_reclaimable += sz
                except OSError:
                    pass

        if artifacts and total_reclaimable >= min_reclaimable_mb * 1024 * 1024:
            dormant_list.append({
                "path": ws_path,
                "name": os.path.basename(ws_path),
                "inactivity_days": inactivity_days,
                "last_active_timestamp": last_active,
                "last_active_formatted": f"{inactivity_days} days ago",
                "is_git": is_git,
                "is_clean": is_clean,
                "artifacts": artifacts,
                "total_reclaimable_bytes": total_reclaimable,
                "total_reclaimable_formatted": _format_bytes(total_reclaimable),
            })

    # Sort by largest reclaimable space descending
    dormant_list.sort(key=lambda x: x["total_reclaimable_bytes"], reverse=True)
    return dormant_list


def detect_stale_downloads(
    downloads_dir: Optional[str] = None,
    min_age_days: int = 21,
    min_size_mb: int = 15,
    max_results: int = 50,
) -> List[Dict[str, Any]]:
    """
    Search ~/Downloads for installer setup executables, ISOs, and large archives
    that have been sitting untouched for longer than min_age_days.
    """
    if downloads_dir:
        dl_dir = Path(downloads_dir)
    else:
        dl_dir = Path.home() / "Downloads"
    if not dl_dir.is_dir():
        return []

    now = time.time()
    min_bytes = min_size_mb * 1024 * 1024
    stale_files: List[Dict[str, Any]] = []

    try:
        with os.scandir(str(dl_dir)) as it:
            for entry in it:
                try:
                    if not entry.is_file(follow_symlinks=False):
                        continue
                    ext = os.path.splitext(entry.name)[1].lower()
                    if ext not in STALE_EXTENSIONS:
                        continue

                    stat = entry.stat(follow_symlinks=False)
                    if stat.st_size < min_bytes:
                        continue

                    age_days = int((now - stat.st_mtime) / 86400)
                    if age_days >= min_age_days:
                        category = "installer" if ext in (".exe", ".msi", ".pkg") else "archive"
                        if ext == ".iso":
                            category = "disk_image"

                        stale_files.append({
                            "path": entry.path,
                            "name": entry.name,
                            "extension": ext,
                            "size_bytes": stat.st_size,
                            "size_formatted": _format_bytes(stat.st_size),
                            "age_days": age_days,
                            "last_modified": stat.st_mtime,
                            "category": category,
                        })
                except OSError:
                    continue
    except OSError:
        pass

    stale_files.sort(key=lambda x: x["size_bytes"], reverse=True)
    return stale_files[:max_results]


def detect_ai_models() -> List[Dict[str, Any]]:
    """
    Detect Hugging Face, Ollama, and PyTorch model weight storage locations.
    """
    models: List[Dict[str, Any]] = []
    home = Path.home()

    # 1. HuggingFace Hub
    hf_dir = home / ".cache" / "huggingface" / "hub"
    if hf_dir.is_dir():
        try:
            with os.scandir(str(hf_dir)) as it:
                for entry in it:
                    if entry.is_dir() and entry.name.startswith("models--"):
                        clean_name = entry.name.replace("models--", "").replace("--", "/")
                        sz = _get_dir_size(entry.path, timeout_seconds=2.0)
                        if sz > 10 * 1024 * 1024:
                            models.append({
                                "id": entry.path,
                                "name": clean_name,
                                "framework": "Hugging Face",
                                "path": entry.path,
                                "size_bytes": sz,
                                "size_formatted": _format_bytes(sz),
                                "last_modified": os.path.getmtime(entry.path),
                            })
        except OSError:
            pass

    # 2. Ollama models
    ollama_dir = home / ".ollama" / "models"
    if ollama_dir.is_dir():
        try:
            blobs_dir = ollama_dir / "blobs"
            if blobs_dir.is_dir():
                total_sz = _get_dir_size(str(blobs_dir), timeout_seconds=3.0)
                if total_sz > 50 * 1024 * 1024:
                    models.append({
                        "id": str(ollama_dir),
                        "name": "Ollama Local Models",
                        "framework": "Ollama",
                        "path": str(ollama_dir),
                        "size_bytes": total_sz,
                        "size_formatted": _format_bytes(total_sz),
                        "last_modified": os.path.getmtime(str(ollama_dir)),
                    })
        except OSError:
            pass

    # 3. PyTorch Hub Checkpoints
    torch_dir = home / ".cache" / "torch" / "hub" / "checkpoints"
    if torch_dir.is_dir():
        try:
            with os.scandir(str(torch_dir)) as it:
                for entry in it:
                    if entry.is_file():
                        sz = entry.stat().st_size
                        if sz > 20 * 1024 * 1024:
                            models.append({
                                "id": entry.path,
                                "name": entry.name,
                                "framework": "PyTorch",
                                "path": entry.path,
                                "size_bytes": sz,
                                "size_formatted": _format_bytes(sz),
                                "last_modified": entry.stat().st_mtime,
                            })
        except OSError:
            pass

    models.sort(key=lambda m: m["size_bytes"], reverse=True)
    return models


def get_storage_recommendations(roots: Optional[List[str]] = None) -> Dict[str, Any]:
    """
    High-level recommendation engine that synthesizes all dormant workspaces,
    stale downloads, and AI models into prioritized, risk-free space reclamation actions.
    """
    dormant_ws = detect_dormant_workspaces(roots=roots)
    stale_dls = detect_stale_downloads()
    ai_models = detect_ai_models()

    total_dormant_bytes = sum(ws["total_reclaimable_bytes"] for ws in dormant_ws)
    total_stale_dl_bytes = sum(dl["size_bytes"] for dl in stale_dls)
    total_ai_bytes = sum(m["size_bytes"] for m in ai_models)
    grand_total_bytes = total_dormant_bytes + total_stale_dl_bytes + total_ai_bytes

    return {
        "total_reclaimable_bytes": grand_total_bytes,
        "total_reclaimable_formatted": _format_bytes(grand_total_bytes),
        "dormant_workspaces": dormant_ws,
        "dormant_workspaces_bytes": total_dormant_bytes,
        "dormant_workspaces_formatted": _format_bytes(total_dormant_bytes),
        "stale_downloads": stale_dls,
        "stale_downloads_bytes": total_stale_dl_bytes,
        "stale_downloads_formatted": _format_bytes(total_stale_dl_bytes),
        "ai_models": ai_models,
        "ai_models_bytes": total_ai_bytes,
        "ai_models_formatted": _format_bytes(total_ai_bytes),
    }


def clean_dormant_workspace(
    workspace_path: str,
    artifact_names: Optional[List[str]] = None,
    artifacts: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Safely clean specified reconstructible artifacts from a dormant workspace.
    """
    if artifact_names is None and artifacts is not None:
        artifact_names = artifacts
    if not os.path.isdir(workspace_path):
        return {"success": False, "error": f"Workspace directory not found: {workspace_path}"}

    cleaned: List[str] = []
    freed_bytes = 0
    errors: List[str] = []

    targets = artifact_names or list(RECONSTRUCTIBLE_FOLDERS.keys())

    for name in targets:
        folder = os.path.join(workspace_path, name)
        if os.path.isdir(folder):
            res = clean_artifact_directory(folder)
            if res.get("success"):
                cleaned.append(name)
                freed_bytes += res.get("freed_bytes", 0)
            else:
                errors.append(f"{name}: {res.get('error', 'unknown failure')}")

    return {
        "success": len(cleaned) > 0,
        "cleaned_artifacts": cleaned,
        "freed_bytes": freed_bytes,
        "freed_formatted": _format_bytes(freed_bytes),
        "errors": errors,
    }


def clean_stale_downloads(file_paths: List[str]) -> Dict[str, Any]:
    """
    Safely delete stale installer files and archives by moving them to the Windows Recycle Bin.
    """
    deleted: List[str] = []
    freed_bytes = 0
    failed: List[str] = []

    for path in file_paths:
        if os.path.isfile(path):
            try:
                sz = os.path.getsize(path)
                if _send_to_recycle_bin(path):
                    deleted.append(path)
                    freed_bytes += sz
                    log_deletion(
                        action="stale_download_recycle",
                        paths=[path],
                        freed_bytes=sz,
                        outcome="success",
                        details={"file": os.path.basename(path)},
                    )
                else:
                    failed.append(path)
            except Exception as e:
                failed.append(path)
                logger.warning("Failed to recycle download %s: %s", path, e)

    return {
        "success": len(deleted) > 0,
        "deleted_count": len(deleted),
        "failed_count": len(failed),
        "freed_bytes": freed_bytes,
        "freed_formatted": _format_bytes(freed_bytes),
        "deleted_paths": deleted,
    }
