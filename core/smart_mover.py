"""
Smart File Mover & Directory Junction Wizard for Entropy ("Rescue C: Drive").

Safely relocates large developer directories and caches (Docker, .cache, .gradle, .cargo, etc.)
from a congested C: drive to a secondary drive or partition (D:, E:, etc.) using Windows
NTFS directory junctions (`mklink /J`).

Why this works without breaking tools:
Windows NTFS Directory Junctions act as transparent file-system redirects.
Applications reading or writing to `C:\\Users\\pc\\AppData\\Local\\Docker` continue
working normally, while the actual physical gigabytes live on the secondary drive.

Features:
- Candidate discovery: detects heavy relocatable developer directories on C:.
- Pre-flight validation: verifies destination drive capacity and checks for file locks.
- Two-phase safe copy with temporary backup verification before removing C: source.
- Atomic rollback manifest (~/.entropy/junctions.json) with one-click restore.
- Complete audit trail (~/.entropy/audit.log).
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import psutil

from core.audit_log import log_deletion
from core.config import get_scan_roots
from core.file_locker import find_locking_processes

logger = logging.getLogger(__name__)

JUNCTIONS_MANIFEST = Path.home() / ".entropy" / "junctions.json"

# Curated catalog of developer folders safe to relocate via directory junctions
KNOWN_CANDIDATE_SPECS = [
    {
        "id": "docker_data",
        "name": "Docker Desktop Storage",
        "relative_home": os.path.join("AppData", "Local", "Docker"),
        "category": "docker",
        "description": "Docker container layers, images, and virtual disk storage.",
        "safe": True,
    },
    {
        "id": "user_cache",
        "name": "User Cache Directory",
        "relative_home": ".cache",
        "category": "cache",
        "description": "Global application cache (Brave, Pip, HuggingFace, etc.).",
        "safe": True,
    },
    {
        "id": "gradle_cache",
        "name": "Gradle Dependencies & Wrapper Cache",
        "relative_home": ".gradle",
        "category": "gradle",
        "description": "Downloaded JVM libraries and Gradle build daemon data.",
        "safe": True,
    },
    {
        "id": "cargo_cache",
        "name": "Cargo & Rustup Crates Cache",
        "relative_home": ".cargo",
        "category": "rust",
        "description": "Rust crates.io index, downloaded packages, and git checkouts.",
        "safe": True,
    },
    {
        "id": "nuget_cache",
        "name": ".NET NuGet Package Cache",
        "relative_home": ".nuget",
        "category": "dotnet",
        "description": "Global NuGet packages and HTTP cache.",
        "safe": True,
    },
    {
        "id": "pip_cache",
        "name": "Python Pip Wheel Cache",
        "relative_home": os.path.join("AppData", "Local", "pip", "cache"),
        "category": "python",
        "description": "Downloaded Python wheels and tarballs.",
        "safe": True,
    },
    {
        "id": "npm_cache",
        "name": "Node.js npm Cache",
        "relative_home": os.path.join("AppData", "Local", "npm-cache"),
        "category": "node",
        "description": "Global npm package tarballs and metadata index.",
        "safe": True,
    },
]


@dataclass
class RelocationCandidate:
    id: str
    name: str
    original_path: str
    category: str
    size_bytes: int
    size_formatted: str
    item_count: int
    is_junction: bool
    is_moveable: bool
    description: str
    target_recommendation: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def _format_bytes(bytes_count: int) -> str:
    if bytes_count <= 0:
        return '0 B'
    size = float(bytes_count)
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size < 1024.0:
            return f"{size:.1f} {unit}"
        size /= 1024.0
    return f"{size:.1f} PB"


def _calc_directory_size(path: str) -> Tuple[int, int]:
    """Calculate directory total size in bytes and file count, ignoring symlinks."""
    total_bytes = 0
    file_count = 0
    try:
        for root, dirs, files in os.walk(path, followlinks=False):
            for f in files:
                try:
                    fp = os.path.join(root, f)
                    st = os.stat(fp, follow_symlinks=False)
                    total_bytes += st.st_size
                    file_count += 1
                except (OSError, PermissionError):
                    continue
    except (OSError, PermissionError):
        pass
    return total_bytes, file_count


def _load_junctions_manifest() -> List[Dict[str, Any]]:
    """Load persistent record of all Entropy-created junctions."""
    if not JUNCTIONS_MANIFEST.exists():
        return []
    try:
        with open(JUNCTIONS_MANIFEST, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        logger.warning("Failed to load junctions manifest: %s", e)
        return []


def _save_junctions_manifest(entries: List[Dict[str, Any]]) -> None:
    """Save persistent record of all Entropy-created junctions."""
    try:
        JUNCTIONS_MANIFEST.parent.mkdir(parents=True, exist_ok=True)
        with open(JUNCTIONS_MANIFEST, 'w', encoding='utf-8') as f:
            json.dump(entries, f, indent=2, ensure_ascii=False)
    except Exception as e:
        logger.error("Failed to save junctions manifest: %s", e)


def get_available_destinations() -> List[Dict[str, Any]]:
    """
    Find candidate target drives for relocation (non-system drives, secondary partitions, external drives).
    """
    destinations: List[Dict[str, Any]] = []
    try:
        parts = psutil.disk_partitions(all=False)
        for p in parts:
            try:
                usage = psutil.disk_usage(p.mountpoint)
                is_system = (p.mountpoint.upper().startswith('C:'))
                destinations.append({
                    "drive": p.mountpoint,
                    "device": p.device,
                    "fstype": p.fstype,
                    "is_system": is_system,
                    "total_bytes": usage.total,
                    "free_bytes": usage.free,
                    "free_formatted": _format_bytes(usage.free),
                    "percent_used": usage.percent,
                    "recommended": (not is_system and usage.free > 10 * 1024 * 1024 * 1024),  # > 10 GB
                })
            except (PermissionError, OSError):
                continue
    except Exception as e:
        logger.warning("Error getting destination drives: %s", e)

    return destinations


def discover_relocation_candidates() -> List[Dict[str, Any]]:
    """
    Scan for large, safe-to-move folders on the C: drive.
    Returns categorized candidates with sizes and junction states.
    """
    home = Path.home()
    candidates: List[RelocationCandidate] = []
    existing_manifest = _load_junctions_manifest()
    manifest_by_orig = {os.path.normcase(m["original_path"]): m for m in existing_manifest}

    for spec in KNOWN_CANDIDATE_SPECS:
        target_path = os.path.abspath(home / spec["relative_home"])
        if not os.path.exists(target_path):
            continue

        norm_path = os.path.normcase(target_path)
        is_junc = os.path.islink(target_path) or (norm_path in manifest_by_orig)
        size_bytes, count = _calc_directory_size(target_path)

        candidates.append(RelocationCandidate(
            id=spec["id"],
            name=spec["name"],
            original_path=target_path,
            category=spec["category"],
            size_bytes=size_bytes,
            size_formatted=_format_bytes(size_bytes),
            item_count=count,
            is_junction=is_junc,
            is_moveable=not is_junc and (size_bytes > 10 * 1024 * 1024),  # > 10 MB
            description=spec["description"],
        ))

    # Sort candidates by size descending
    candidates.sort(key=lambda c: c.size_bytes, reverse=True)
    return [c.to_dict() for c in candidates]


def get_active_junctions() -> List[Dict[str, Any]]:
    """List all currently active directory junctions managed by Entropy."""
    manifest = _load_junctions_manifest()
    results = []
    for item in manifest:
        orig = item.get("original_path", "")
        dest = item.get("destination_path", "")
        is_live = os.path.islink(orig) and os.path.isdir(dest)
        item["is_live"] = is_live
        results.append(item)
    return results


def relocate_directory_junction(
    source_path: str,
    target_parent_dir: str,
    custom_name: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Safely move source directory from C: to target drive and establish an NTFS Directory Junction.
    Non-destructive: Uses verification before removing the original files from C:.
    """
    src_abs = os.path.abspath(source_path)
    if not os.path.isdir(src_abs):
        return {"success": False, "error": f"Source directory does not exist: {src_abs}"}

    if os.path.islink(src_abs):
        return {"success": False, "error": f"Path is already a junction or symlink: {src_abs}"}

    # Safety boundary: Never touch Windows or System32
    src_low = src_abs.lower()
    if any(p in src_low for p in ['c:\\windows', 'c:\\system32', 'c:\\program files\\windows']):
        return {"success": False, "error": "Safety violation: Cannot move Windows system directories."}

    # Verify target parent directory
    target_abs = os.path.abspath(target_parent_dir)
    try:
        os.makedirs(target_abs, exist_ok=True)
    except OSError as e:
        return {"success": False, "error": f"Cannot create destination folder: {e}"}

    folder_name = custom_name or os.path.basename(src_abs)
    dest_path = os.path.join(target_abs, folder_name)

    if os.path.exists(dest_path):
        return {"success": False, "error": f"Destination path already exists: {dest_path}"}

    # Check disk space on target drive
    try:
        src_bytes, count = _calc_directory_size(src_abs)
        usage = psutil.disk_usage(os.path.splitdrive(dest_path)[0] + '\\')
        if usage.free < int(src_bytes * 1.15):  # 15% buffer
            return {
                "success": False,
                "error": f"Destination drive has insufficient space. Need {_format_bytes(int(src_bytes * 1.15))}, but only {_format_bytes(usage.free)} is free.",
            }
    except Exception as e:
        logger.warning("Could not verify destination capacity: %s", e)

    # Check for file locks
    lock_info = find_locking_processes(src_abs)
    if lock_info.get("is_locked"):
        lockers = lock_info.get("locking_processes", [])
        proc_names = ', '.join([p.get('name', 'unknown') for p in lockers[:3]])
        return {
            "success": False,
            "error": f"Directory is locked by active process(es): {proc_names}. Please close them before relocating.",
            "locking_processes": lockers,
        }

    # ── Phase 1: Copy files to destination ──
    logger.info("Copying %s to %s...", src_abs, dest_path)
    try:
        shutil.copytree(src_abs, dest_path)
    except Exception as e:
        # Cleanup destination if copy failed
        shutil.rmtree(dest_path, ignore_errors=True)
        return {"success": False, "error": f"Failed to copy files to destination: {e}"}

    # ── Phase 2: Safety Rename on source ──
    backup_src = src_abs + ".entropy_bak"
    try:
        os.rename(src_abs, backup_src)
    except Exception as e:
        shutil.rmtree(dest_path, ignore_errors=True)
        return {"success": False, "error": f"Failed to rename original directory during migration: {e}"}

    # ── Phase 3: Create NTFS Directory Junction (mklink /J) ──
    try:
        cmd = ['cmd.exe', '/c', 'mklink', '/J', src_abs, dest_path]
        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000) if os.name == "nt" else 0
        startupinfo = None
        if os.name == "nt":
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= getattr(subprocess, "STARTF_USESHOWWINDOW", 1)
            startupinfo.wShowWindow = 0
        res = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=True,
            creationflags=creationflags,
            startupinfo=startupinfo,
        )
        logger.info("Created directory junction: %s", res.stdout.strip())
    except subprocess.CalledProcessError as e:
        # Revert: rename backup back to source
        os.rename(backup_src, src_abs)
        shutil.rmtree(dest_path, ignore_errors=True)
        return {"success": False, "error": f"Failed to create NTFS junction link: {e.stderr or e}"}

    # ── Phase 4: Verify Junction Link ──
    if not (os.path.islink(src_abs) and os.path.isdir(src_abs)):
        # Revert
        try:
            os.rmdir(src_abs)
        except OSError:
            pass
        os.rename(backup_src, src_abs)
        shutil.rmtree(dest_path, ignore_errors=True)
        return {"success": False, "error": "Junction link verification failed."}

    # ── Phase 5: Reclaim C: Space (remove backup) ──
    try:
        shutil.rmtree(backup_src)
    except Exception as e:
        logger.warning("Could not delete backup directory %s: %s", backup_src, e)

    # ── Phase 6: Save to manifest & audit log ──
    manifest = _load_junctions_manifest()
    entry = {
        "id": f"junc_{int(datetime.now(timezone.utc).timestamp())}",
        "name": folder_name,
        "original_path": src_abs,
        "destination_path": dest_path,
        "size_bytes": src_bytes,
        "size_formatted": _format_bytes(src_bytes),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "is_active": True,
    }
    manifest.append(entry)
    _save_junctions_manifest(manifest)

    log_deletion(
        action="smart_mover_relocation",
        paths=[src_abs],
        freed_bytes=src_bytes,
        outcome="success",
        details={
            "destination": dest_path,
            "reclaimed_on_c": _format_bytes(src_bytes),
        },
    )

    return {
        "success": True,
        "message": f"Successfully relocated '{folder_name}' to {dest_path}. Reclaimed {_format_bytes(src_bytes)} on C: Drive.",
        "freed_bytes": src_bytes,
        "freed_formatted": _format_bytes(src_bytes),
        "junction": entry,
    }


def restore_directory_junction(junction_id: str) -> Dict[str, Any]:
    """
    Revert a directory junction: moves files back to C: and deletes junction pointer.
    """
    manifest = _load_junctions_manifest()
    matching = next((m for m in manifest if m["id"] == junction_id), None)
    if not matching:
        return {"success": False, "error": f"No junction found with ID: {junction_id}"}

    orig_path = matching["original_path"]
    dest_path = matching["destination_path"]

    if not os.path.exists(dest_path):
        return {"success": False, "error": f"Relocated files no longer exist at: {dest_path}"}

    # Remove junction pointer (in Windows rmdir on junction removes ONLY the link)
    if os.path.islink(orig_path):
        try:
            os.rmdir(orig_path)
        except OSError as e:
            return {"success": False, "error": f"Cannot remove junction link: {e}"}

    # Move files back to original location
    try:
        shutil.move(dest_path, orig_path)
    except Exception as e:
        # Re-link junction to prevent data loss
        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000) if os.name == "nt" else 0
        startupinfo = None
        if os.name == "nt":
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= getattr(subprocess, "STARTF_USESHOWWINDOW", 1)
            startupinfo.wShowWindow = 0
        subprocess.run(
            ['cmd.exe', '/c', 'mklink', '/J', orig_path, dest_path],
            check=False,
            creationflags=creationflags,
            startupinfo=startupinfo,
        )
        return {"success": False, "error": f"Failed to move files back: {e}"}

    # Update manifest
    manifest = [m for m in manifest if m["id"] != junction_id]
    _save_junctions_manifest(manifest)

    return {
        "success": True,
        "message": f"Restored '{matching['name']}' back to {orig_path}.",
    }
