"""
Entropy SSD Storage Lens & Space Cartography Engine.

Provides deep, semantic disk space forensics for developer SSDs:
- Multi-drive topology & capacity telemetry (C:, D:, Dev Drive)
- Developer domain space categorization (Artifacts vs Caches vs VHDX vs AI vs Downloads vs System)
- Fast, non-blocking hierarchical directory space exploration with drill-down breadcrumbs
"""

from __future__ import annotations

import logging
import os
import platform
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

import psutil

from core.config import get_scan_roots
from core.dormant_detector import _format_bytes, _get_dir_size, detect_ai_models, detect_stale_downloads

logger = logging.getLogger(__name__)


def _is_on_drive(path: str, drive_letter: str) -> bool:
    """Check if a path resides on the given drive letter (e.g. 'C:')."""
    try:
        norm_path = os.path.abspath(path).upper()
        norm_drive = drive_letter.upper().rstrip("\\/").rstrip(":") + ":"
        return norm_path.startswith(norm_drive)
    except Exception:
        return False


def get_ssd_drives_overview() -> List[Dict[str, Any]]:
    """
    List all active physical and logical storage drives on the machine with live capacity metrics.
    """
    drives: List[Dict[str, Any]] = []
    seen_mounts: Set[str] = set()

    try:
        partitions = psutil.disk_partitions(all=False)
    except Exception as e:
        logger.warning("Failed to query disk partitions: %s", e)
        partitions = []

    for part in partitions:
        mount = part.mountpoint
        if mount in seen_mounts:
            continue
        seen_mounts.add(mount)

        drive_letter = mount.rstrip("\\/")
        if not drive_letter:
            drive_letter = mount

        try:
            usage = psutil.disk_usage(mount)
            total = usage.total
            used = usage.used
            free = usage.free
            pct = usage.percent
        except (PermissionError, OSError):
            continue

        is_system = drive_letter.upper().startswith("C:")
        is_dev_drive = "refs" in part.fstype.lower()

        # Query volume label if available on Windows
        label = "Local Disk"
        if platform.system() == "Windows":
            try:
                import ctypes
                vol_name_buf = ctypes.create_unicode_buffer(1024)
                fs_name_buf = ctypes.create_unicode_buffer(1024)
                ctypes.windll.kernel32.GetVolumeInformationW(
                    ctypes.c_wchar_p(mount),
                    vol_name_buf,
                    ctypes.sizeof(vol_name_buf),
                    None,
                    None,
                    None,
                    fs_name_buf,
                    ctypes.sizeof(fs_name_buf),
                )
                if vol_name_buf.value:
                    label = vol_name_buf.value
            except Exception:
                pass

        drives.append({
            "drive": drive_letter,
            "mountpoint": mount,
            "label": label,
            "fstype": part.fstype,
            "total_bytes": total,
            "used_bytes": used,
            "free_bytes": free,
            "percent_used": pct,
            "total_formatted": _format_bytes(total),
            "used_formatted": _format_bytes(used),
            "free_formatted": _format_bytes(free),
            "is_system": is_system,
            "is_dev_drive": is_dev_drive,
        })

    return drives


def get_drive_category_breakdown(drive_letter: str = "C:") -> Dict[str, Any]:
    """
    Calculate semantic developer categories for storage consumed on the specified drive.
    """
    norm_drive = drive_letter.upper().rstrip("\\/").rstrip(":") + ":\\"
    try:
        disk_usage = psutil.disk_usage(norm_drive)
        total_disk = disk_usage.total
        used_disk = disk_usage.used
        free_disk = disk_usage.free
    except Exception:
        total_disk = 1
        used_disk = 0
        free_disk = 0

    # 1. Project Build Artifacts (node_modules, target, etc.)
    artifact_bytes = 0
    try:
        from collectors.artifacts import collect_project_artifacts
        from collectors.projects import collect_projects_and_dependencies

        roots = [r for r in get_scan_roots() if _is_on_drive(r, drive_letter)]
        for r in roots:
            if os.path.isdir(r):
                projects, _ = collect_projects_and_dependencies(r, max_depth=2)
                for p in projects:
                    arts = collect_project_artifacts(p.path)
                    for a in arts:
                        artifact_bytes += a.get("size_bytes", 0)
    except Exception as e:
        logger.debug("Failed measuring artifacts for drive breakdown: %s", e)

    # 2. Package Manager Caches (pip, npm, cargo, etc.)
    cache_bytes = 0
    try:
        from collectors.caches import collect_caches
        caches = collect_caches()
        for c in caches:
            if _is_on_drive(c.path, drive_letter):
                cache_bytes += c.size_bytes or 0
    except Exception as e:
        logger.debug("Failed measuring caches for drive breakdown: %s", e)

    # 3. Virtual Disks (Docker/WSL2 VHDX)
    vhdx_bytes = 0
    try:
        from core.vhdx_compact import discover_virtual_disks
        disks = discover_virtual_disks()
        for d in disks:
            if _is_on_drive(d.path, drive_letter):
                vhdx_bytes += d.size_bytes
    except Exception as e:
        logger.debug("Failed measuring virtual disks for drive breakdown: %s", e)

    # 4. AI & ML Models (Ollama, HuggingFace)
    ai_bytes = 0
    try:
        models = detect_ai_models()
        for m in models:
            if _is_on_drive(m["path"], drive_letter):
                ai_bytes += m["size_bytes"]
    except Exception as e:
        logger.debug("Failed measuring AI models for drive breakdown: %s", e)

    # 5. Stale Downloads & Installers
    download_bytes = 0
    try:
        dls = detect_stale_downloads()
        for d in dls:
            if _is_on_drive(d["path"], drive_letter):
                download_bytes += d["size_bytes"]
    except Exception as e:
        logger.debug("Failed measuring stale downloads for drive breakdown: %s", e)

    # 6. Windows & System Junk
    system_bytes = 0
    try:
        from core.system_cleaner import get_system_cleanup_targets
        targets = get_system_cleanup_targets()
        for t in targets:
            system_bytes += t.size_bytes
    except Exception as e:
        logger.debug("Failed measuring system targets for drive breakdown: %s", e)

    categorized_sum = artifact_bytes + cache_bytes + vhdx_bytes + ai_bytes + download_bytes + system_bytes
    other_bytes = max(0, used_disk - categorized_sum)

    categories = [
        {
            "id": "artifacts",
            "label": "Project Build Artifacts",
            "description": "node_modules, target, .venv, bin/obj across developer workspaces",
            "size_bytes": artifact_bytes,
            "size_formatted": _format_bytes(artifact_bytes),
            "percent_of_used": round((artifact_bytes / max(used_disk, 1)) * 100, 1),
            "color_var": "var(--color-success)",
            "is_reclaimable": True,
        },
        {
            "id": "caches",
            "label": "Package Manager Caches",
            "description": "Global npm, pip, cargo, nuget, gradle, maven download caches",
            "size_bytes": cache_bytes,
            "size_formatted": _format_bytes(cache_bytes),
            "percent_of_used": round((cache_bytes / max(used_disk, 1)) * 100, 1),
            "color_var": "var(--color-warning)",
            "is_reclaimable": True,
        },
        {
            "id": "vhdx",
            "label": "Virtual Disks & Containers",
            "description": "WSL2 Linux and Docker Desktop dynamic virtual hard disks (.vhdx)",
            "size_bytes": vhdx_bytes,
            "size_formatted": _format_bytes(vhdx_bytes),
            "percent_of_used": round((vhdx_bytes / max(used_disk, 1)) * 100, 1),
            "color_var": "var(--color-info)",
            "is_reclaimable": True,
        },
        {
            "id": "ai_models",
            "label": "AI & ML Model Weights",
            "description": "Ollama local model blobs, Hugging Face Hub checkpoints",
            "size_bytes": ai_bytes,
            "size_formatted": _format_bytes(ai_bytes),
            "percent_of_used": round((ai_bytes / max(used_disk, 1)) * 100, 1),
            "color_var": "#a855f7",
            "is_reclaimable": True,
        },
        {
            "id": "downloads",
            "label": "Stale Installers & Archives",
            "description": "Older .exe installers, ISO images, and zip archives in Downloads",
            "size_bytes": download_bytes,
            "size_formatted": _format_bytes(download_bytes),
            "percent_of_used": round((download_bytes / max(used_disk, 1)) * 100, 1),
            "color_var": "#f97316",
            "is_reclaimable": True,
        },
        {
            "id": "system_junk",
            "label": "Windows System Junk",
            "description": "Temp files, Delivery Optimization, crash dumps, and Recycle Bin",
            "size_bytes": system_bytes,
            "size_formatted": _format_bytes(system_bytes),
            "percent_of_used": round((system_bytes / max(used_disk, 1)) * 100, 1),
            "color_var": "var(--color-danger)",
            "is_reclaimable": True,
        },
        {
            "id": "other",
            "label": "Windows OS & Applications",
            "description": "Operating system files, installed software binaries, and user documents",
            "size_bytes": other_bytes,
            "size_formatted": _format_bytes(other_bytes),
            "percent_of_used": round((other_bytes / max(used_disk, 1)) * 100, 1),
            "color_var": "var(--color-text-tertiary)",
            "is_reclaimable": False,
        },
    ]

    # Reclaimable subtotal
    total_reclaimable = artifact_bytes + cache_bytes + vhdx_bytes + ai_bytes + download_bytes + system_bytes

    return {
        "drive": drive_letter,
        "total_bytes": total_disk,
        "total_formatted": _format_bytes(total_disk),
        "used_bytes": used_disk,
        "used_formatted": _format_bytes(used_disk),
        "free_bytes": free_disk,
        "free_formatted": _format_bytes(free_disk),
        "percent_used": round((used_disk / max(total_disk, 1)) * 100, 1),
        "total_reclaimable_bytes": total_reclaimable,
        "total_reclaimable_formatted": _format_bytes(total_reclaimable),
        "categories": categories,
    }


def _classify_path_category(path: str, is_dir: bool) -> Tuple[str, str]:
    """Classify a folder or file path into a semantic developer category."""
    name = os.path.basename(path).lower()

    if is_dir:
        if name in ("node_modules", "target", ".venv", "venv", "bin", "obj", ".next", ".nuxt"):
            return "artifact", "Build Artifact"
        if name in (".gradle", ".m2", "npm-cache", ".cargo", "pip", ".nuget"):
            return "cache", "Package Cache"
        if name in (".ollama", "huggingface", "torch"):
            return "ai_model", "AI & ML Weights"
        if name == ".git":
            return "git", "Git Metadata"
        if name in ("downloads", "download"):
            return "download", "Downloads"
        if name in ("windows", "system32", "appdata", "temp"):
            return "system", "System / OS"
        return "folder", "Directory"

    ext = os.path.splitext(name)[1].lower()
    if ext in (".vhdx", ".vmdk", ".vdi"):
        return "virtual_disk", "Virtual Disk"
    if ext in (".bin", ".safetensors", ".onnx", ".gguf", ".pt", ".pth"):
        return "ai_model", "AI Model Weight"
    if ext in (".exe", ".msi", ".iso", ".zip", ".tar", ".gz", ".7z", ".rar"):
        return "download", "Installer / Archive"
    if ext in (".mp4", ".mkv", ".mov", ".avi", ".wav", ".mp3", ".flac"):
        return "media", "Media File"
    if ext in (".ts", ".tsx", ".js", ".jsx", ".py", ".rs", ".go", ".java", ".c", ".cpp", ".cs"):
        return "source_code", "Source Code"

    return "file", "File"


def scan_path_breakdown(
    target_path: str,
    max_depth: int = 1,
    depth: Optional[int] = None,
    timeout_seconds: float = 6.0,
) -> Dict[str, Any]:
    """
    Fast hierarchical directory space scanner for drill-down treemaps.
    Scans immediate children of target_path and calculates proportional sizes.
    """
    if depth is not None:
        max_depth = depth
    abs_path = os.path.abspath(target_path)
    if not os.path.exists(abs_path):
        return {"error": f"Path does not exist: {target_path}", "items": [], "total_size_bytes": 0}

    # Generate breadcrumb trail
    breadcrumbs: List[Dict[str, str]] = []
    current = Path(abs_path)
    while current != current.parent:
        breadcrumbs.append({"name": current.name or str(current), "path": str(current)})
        current = current.parent
    if current.name or str(current):
        breadcrumbs.append({"name": current.name or str(current), "path": str(current)})
    breadcrumbs.reverse()

    nodes: List[Dict[str, Any]] = []
    total_size = 0
    start_time = time.time()

    try:
        with os.scandir(abs_path) as it:
            entries = list(it)

        for entry in entries:
            if (time.time() - start_time) > timeout_seconds:
                logger.debug("Timeout scanning path breakdown for %s", abs_path)
                break

            try:
                is_dir = entry.is_dir(follow_symlinks=False)
                if is_dir:
                    sz = _get_dir_size(entry.path, timeout_seconds=1.2)
                else:
                    sz = entry.stat(follow_symlinks=False).st_size

                if sz > 0:
                    cat_id, cat_label = _classify_path_category(entry.path, is_dir)
                    nodes.append({
                        "id": entry.path,
                        "name": entry.name,
                        "path": entry.path,
                        "size_bytes": sz,
                        "size_formatted": _format_bytes(sz),
                        "is_dir": is_dir,
                        "category": cat_id,
                        "category_label": cat_label,
                        "last_modified": entry.stat(follow_symlinks=False).st_mtime,
                    })
                    total_size += sz
            except (OSError, PermissionError):
                continue
    except (OSError, PermissionError) as e:
        return {"error": str(e), "path": abs_path, "breadcrumbs": breadcrumbs, "items": [], "total_size_bytes": 0}

    # Sort descending by size
    nodes.sort(key=lambda n: n["size_bytes"], reverse=True)

    # Compute percentage of parent
    for n in nodes:
        n["percentage"] = round((n["size_bytes"] / max(total_size, 1)) * 100, 1)

    return {
        "path": abs_path,
        "name": os.path.basename(abs_path) or abs_path,
        "breadcrumbs": breadcrumbs,
        "total_size_bytes": total_size,
        "total_size_formatted": _format_bytes(total_size),
        "items": nodes,
    }
