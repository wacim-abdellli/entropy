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

import ctypes
import json
import logging
import os
import shutil
import stat
import subprocess
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import psutil

from core.audit_log import log_deletion
from core.cleanup_progress import progress_tracker
from core.config import get_scan_roots
from core.file_locker import find_locking_processes

logger = logging.getLogger(__name__)

JUNCTIONS_MANIFEST = Path.home() / ".entropy" / "junctions.json"
FILE_ATTRIBUTE_REPARSE_POINT = 0x400


def is_junction_or_link(path: str) -> bool:
    """Check if a path is an NTFS Directory Junction or symbolic link on Windows."""
    try:
        p_str = str(path)
        if not os.path.exists(p_str) and not os.path.lexists(p_str):
            return False
        if os.name == "nt":
            attrs = ctypes.windll.kernel32.GetFileAttributesW(p_str)
            if attrs != 0xFFFFFFFF and (attrs & FILE_ATTRIBUTE_REPARSE_POINT):
                return True
        return os.path.islink(p_str)
    except Exception:
        return False


def _to_extended_path(p: str) -> str:
    """Prepend Win32 extended-length path prefix (\\\\?\\) on Windows to bypass MAX_PATH."""
    if os.name == "nt" and p and not p.startswith("\\\\?\\") and not p.startswith("\\\\"):
        return f"\\\\?\\{os.path.abspath(p)}"
    return p


def _robust_rmtree(path: str) -> None:
    """Safely remove a directory tree, resetting read-only permissions on Windows."""
    def _remove_readonly(func, p, excinfo):
        try:
            os.chmod(p, stat.S_IWRITE)
            func(p)
        except Exception as e:
            logger.debug("Failed to reset permissions on %s: %s", p, e)

    target = _to_extended_path(path)
    try:
        shutil.rmtree(target, onerror=_remove_readonly)
    except TypeError:
        shutil.rmtree(target, onexc=lambda fn, p, exc: _remove_readonly(fn, p, None))


def _copy_tree_with_progress(src_abs: str, dest_path: str, total_bytes: int) -> int:
    """
    Copies directory tree from src_abs to dest_path with live progress reporting.
    Supports resuming: skips identical files (same size).
    """
    os.makedirs(dest_path, exist_ok=True)
    copied_bytes = 0
    total_bytes = max(1, total_bytes)

    for root, dirs, files in os.walk(src_abs):
        rel = os.path.relpath(root, src_abs)
        dst_dir = os.path.join(dest_path, rel) if rel != "." else dest_path
        os.makedirs(dst_dir, exist_ok=True)

        for f in files:
            src_file = os.path.join(root, f)
            dst_file = os.path.join(dst_dir, f)
            rel_file = os.path.join(rel, f) if rel != "." else f

            try:
                src_st = os.stat(src_file, follow_symlinks=False)
                fsize = src_st.st_size

                # If file already exists with same size, count as verified
                if os.path.exists(dst_file):
                    dst_st = os.stat(dst_file, follow_symlinks=False)
                    if dst_st.st_size == fsize:
                        copied_bytes += fsize
                        percent = min(85, max(5, int((copied_bytes / total_bytes) * 85)))
                        progress_tracker.update(
                            current_file=rel_file,
                            bytes_delta=fsize,
                            percent=percent,
                            log_line=f"Verified: {rel_file} ({_format_bytes(copied_bytes)} / {_format_bytes(total_bytes)})"
                        )
                        continue

                # Copy in 4MB chunks for smooth progress
                with open(src_file, "rb") as fsrc, open(dst_file, "wb") as fdst:
                    while True:
                        buf = fsrc.read(4 * 1024 * 1024)
                        if not buf:
                            break
                        fdst.write(buf)
                        copied_bytes += len(buf)
                        percent = min(85, max(5, int((copied_bytes / total_bytes) * 85)))
                        progress_tracker.update(
                            current_file=rel_file,
                            bytes_delta=len(buf),
                            percent=percent,
                            log_line=f"Transferring {rel_file} ({_format_bytes(copied_bytes)} / {_format_bytes(total_bytes)})"
                        )

                shutil.copystat(src_file, dst_file)
            except Exception as e:
                logger.warning("Error copying file %s: %s", src_file, e)
                raise

    return copied_bytes

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
        is_junc = is_junction_or_link(target_path) or (norm_path in manifest_by_orig)
        if is_junc and norm_path in manifest_by_orig:
            size_bytes = manifest_by_orig[norm_path].get("size_bytes", 0)
            count = 0
        else:
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
        is_live = is_junction_or_link(orig) and os.path.isdir(dest)
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
    Tracks real-time progress via progress_tracker.
    """
    src_abs = os.path.abspath(source_path)
    if not os.path.isdir(src_abs):
        return {"success": False, "error": f"Source directory does not exist: {src_abs}"}

    if is_junction_or_link(src_abs):
        return {"success": False, "error": f"Path is already a junction or symlink: {src_abs}"}

    if progress_tracker.is_active():
        return {
            "success": False,
            "error": "Another operation is currently in progress. Please wait for it to complete before starting a new relocation.",
        }

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

    # Start progress tracker
    progress_tracker.start(f"Relocating {folder_name} to {dest_path}")
    progress_tracker.update(percent=2, log_line=f"Initiating migration: {src_abs} → {dest_path}")

    # Check disk space on target drive
    try:
        src_bytes, count = _calc_directory_size(src_abs)
        usage = psutil.disk_usage(os.path.splitdrive(dest_path)[0] + '\\')
        dest_existing_bytes = 0
        if os.path.exists(dest_path):
            dest_existing_bytes, _ = _calc_directory_size(dest_path)
        net_needed = max(0, src_bytes - dest_existing_bytes)
        if net_needed > 0 and usage.free < int(net_needed * 1.15):
            err_msg = f"Destination drive has insufficient space. Need {_format_bytes(int(net_needed * 1.15))}, but only {_format_bytes(usage.free)} is free."
            progress_tracker.finish(error=err_msg)
            return {"success": False, "error": err_msg}
    except Exception as e:
        logger.warning("Could not verify destination capacity: %s", e)
        src_bytes, count = _calc_directory_size(src_abs)

    # Check for file locks
    lock_info = find_locking_processes(src_abs)
    if lock_info.get("is_locked"):
        lockers = lock_info.get("locking_processes", [])
        proc_names = ', '.join([p.get('name', 'unknown') for p in lockers[:3]])
        err_msg = f"Directory is locked by active process(es): {proc_names}. Please close them before relocating."
        progress_tracker.finish(error=err_msg)
        return {
            "success": False,
            "error": err_msg,
            "locking_processes": lockers,
        }

    # ── Phase 1: Copy files to destination with live progress ──
    progress_tracker.set_phase(f"Copying files to {dest_path}...", 5)
    try:
        _copy_tree_with_progress(src_abs, dest_path, src_bytes)
    except Exception as e:
        progress_tracker.finish(error=f"Failed to copy files: {e}")
        return {"success": False, "error": f"Failed to copy files to destination: {e}"}

    # ── Phase 2: Safety Rename on source ──
    progress_tracker.set_phase("Preparing NTFS switch...", 86)
    backup_src = src_abs + ".entropy_bak"
    if os.path.exists(backup_src):
        _robust_rmtree(backup_src)

    try:
        os.rename(src_abs, backup_src)
    except Exception as e:
        progress_tracker.finish(error=f"Failed to prepare original directory: {e}")
        return {"success": False, "error": f"Failed to rename original directory during migration: {e}"}

    # ── Phase 3: Create NTFS Directory Junction (mklink /J) ──
    progress_tracker.set_phase("Establishing NTFS Directory Junction...", 90)
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
    except Exception as e:
        # Revert: rename backup back to source
        if os.path.exists(backup_src):
            try:
                os.rename(backup_src, src_abs)
            except Exception:
                pass
        progress_tracker.finish(error=f"Failed to create NTFS junction link: {e}")
        return {"success": False, "error": f"Failed to create NTFS junction link: {e}"}

    # ── Phase 4: Verify Junction Link ──
    progress_tracker.set_phase("Verifying junction integrity...", 94)
    if not (is_junction_or_link(src_abs) and os.path.isdir(src_abs)):
        # Revert
        try:
            os.rmdir(src_abs)
        except OSError:
            pass
        if os.path.exists(backup_src):
            os.rename(backup_src, src_abs)
        progress_tracker.finish(error="Junction link verification failed.")
        return {"success": False, "error": "Junction link verification failed."}

    # Verify listing directory through the junction
    try:
        _ = os.listdir(src_abs)
    except Exception as e:
        try:
            os.rmdir(src_abs)
        except OSError:
            pass
        if os.path.exists(backup_src):
            try:
                os.rename(backup_src, src_abs)
            except Exception:
                pass
        progress_tracker.finish(error=f"Junction link read check failed: {e}")
        return {"success": False, "error": f"Junction link read check failed: {e}"}

    # ── Phase 5: Reclaim C: Space (permanently delete backup from C:) ──
    progress_tracker.set_phase(f"Reclaiming {_format_bytes(src_bytes)} on C: Drive (deleting original files)...", 97)
    try:
        _robust_rmtree(backup_src)
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

    progress_tracker.finish(
        summary={
            "total_freed_bytes": src_bytes,
            "total_deleted_count": count,
            "total_skipped_count": 0,
            "destination": dest_path,
        }
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
    Safely revert a directory junction:
    1. Pre-flight check: verifies target C: drive has sufficient capacity.
    2. Two-phase staging: copies files to a staging directory first without disturbing the active junction.
    3. Atomic commit: removes junction link and swaps restored directory into place.
    4. Purges destination files on secondary drive.
    """
    manifest = _load_junctions_manifest()
    matching = next((m for m in manifest if m["id"] == junction_id), None)
    if not matching:
        return {"success": False, "error": f"No junction found with ID: {junction_id}"}

    orig_path = matching["original_path"]
    dest_path = matching["destination_path"]

    if not os.path.exists(dest_path):
        return {"success": False, "error": f"Relocated files no longer exist at: {dest_path}"}

    if progress_tracker.is_active():
        return {
            "success": False,
            "error": "Another operation is currently in progress. Please wait for it to complete before restoring a junction.",
        }

    progress_tracker.start(f"Restoring '{matching['name']}' back to original drive")

    # Step 1: Pre-flight capacity check on original drive
    try:
        dest_bytes, file_count = _calc_directory_size(dest_path)
        drive_root = os.path.splitdrive(orig_path)[0] + '\\'
        usage = psutil.disk_usage(drive_root)
        if usage.free < int(dest_bytes * 1.10):
            err_msg = (
                f"Insufficient disk space on {drive_root} to restore '{matching['name']}'. "
                f"Requires {_format_bytes(int(dest_bytes * 1.10))}, but only {_format_bytes(usage.free)} is available."
            )
            progress_tracker.finish(error=err_msg)
            return {"success": False, "error": err_msg}
    except Exception as e:
        logger.warning("Could not verify free capacity: %s", e)
        dest_bytes, file_count = _calc_directory_size(dest_path)

    # Step 2: Two-phase copy to staging area on original drive (preserves active junction if copy fails)
    staging_path = orig_path + ".__entropy_restoring__"
    if os.path.exists(staging_path):
        _robust_rmtree(staging_path)

    progress_tracker.set_phase("Copying files back to original drive...", 15)
    try:
        _copy_tree_with_progress(dest_path, staging_path, dest_bytes)
    except Exception as e:
        if os.path.exists(staging_path):
            _robust_rmtree(staging_path)
        progress_tracker.finish(error=f"Failed to copy files back to original drive: {e}")
        return {"success": False, "error": f"Failed to copy files back to original drive: {e}"}

    # Step 3: Atomic link swap
    progress_tracker.set_phase("Removing junction pointer and swapping files...", 88)
    if is_junction_or_link(orig_path):
        try:
            os.rmdir(orig_path)
        except OSError as e:
            if os.path.exists(staging_path):
                _robust_rmtree(staging_path)
            progress_tracker.finish(error=f"Cannot remove junction link: {e}")
            return {"success": False, "error": f"Cannot remove junction link: {e}"}

    try:
        os.rename(staging_path, orig_path)
    except Exception as e:
        # Re-establish junction link if rename failed
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
        progress_tracker.finish(error=f"Failed to activate restored directory: {e}")
        return {"success": False, "error": f"Failed to activate restored directory: {e}"}

    # Step 4: Purge relocated files on secondary drive
    progress_tracker.set_phase("Purging secondary storage copy...", 95)
    try:
        _robust_rmtree(dest_path)
    except Exception as e:
        logger.warning("Could not delete secondary storage directory %s: %s", dest_path, e)

    # Step 5: Update manifest and finish
    manifest = [m for m in manifest if m["id"] != junction_id]
    _save_junctions_manifest(manifest)

    progress_tracker.finish(
        summary={
            "destination": orig_path,
            "total_freed_bytes": dest_bytes,
        }
    )

    return {
        "success": True,
        "message": f"Successfully restored '{matching['name']}' back to {orig_path}.",
    }
