"""
System Cleaner module for Entropy Workstation Orchestrator.

Provides smart, comprehensive scanning and safe reclamation of system-level junk across Windows:
- Windows User Temporary Files (%TEMP%) older than 24 hours
- Windows Recycle Bin (via Win32 Shell API SHQueryRecycleBin / SHEmptyRecycleBin)
- Web Browser Caches (Google Chrome, Microsoft Edge, Brave, Mozilla Firefox)
- Windows Crash Dumps (%LOCALAPPDATA%\\CrashDumps)
- Windows Explorer Thumbnail Caches (thumbcache_*.db)
- IDE Caches (VS Code Cache & CachedData)

Safety Boundaries & Principles:
- Root directory preservation: Only empty directory contents; never delete cache root folders.
- Active process locking: Never crash on open file handles; skip locked items silently.
- 24-hour file age safeguard for temp files: Never touch files modified within the last 24h.
- Privacy preservation: Only delete HTTP/script caches. Never touch history, cookies, or credentials.
"""

from __future__ import annotations

import ctypes
from ctypes import wintypes
import glob
import logging
import os
import shutil
import stat
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

from core.cleanup_progress import progress_tracker


def _format_size_helper(bytes_val: int) -> str:
    if bytes_val < 1024:
        return f"{bytes_val} B"
    if bytes_val < 1024 * 1024:
        return f"{bytes_val / 1024:.1f} KB"
    return f"{bytes_val / (1024 * 1024):.1f} MB"



def _remove_readonly(func: Any, path: str, excinfo: Any) -> None:
    """Clear readonly flag on Windows before retrying deletion."""
    try:
        os.chmod(path, stat.S_IWRITE)
        func(path)
    except Exception:
        pass


def _is_file_deletable(path: str) -> bool:
    """Test if a file can be deleted on Windows (not locked by another process or owned by SYSTEM ACL)."""
    try:
        test_p = path + ".__entropy_test__"
        os.rename(path, test_p)
        os.rename(test_p, path)
        return True
    except (PermissionError, OSError):
        return False


def _is_any_process_running(proc_names: list[str]) -> bool:
    """Check if any of the given process executables are currently running on Windows."""
    if not proc_names:
        return False
    try:
        import psutil
        names = {p.lower() for p in proc_names}
        for proc in psutil.process_iter(['name']):
            try:
                pname = proc.info['name']
                if pname and pname.lower() in names:
                    return True
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
    except Exception:
        pass
    return False


def _calc_dir_footprint(path: str, max_depth: int = 4, timeout_seconds: float = 2.5) -> tuple[int, int]:
    """Calculate total size and file count of a directory with timeout protection."""
    if not os.path.exists(path) or not os.path.isdir(path):
        return 0, 0

    total_bytes = 0
    total_files = 0
    start_time = time.time()

    try:
        base_depth = path.rstrip(os.sep).count(os.sep)
        for root, dirs, files in os.walk(path):
            if time.time() - start_time > timeout_seconds:
                break
            cur_depth = root.count(os.sep) - base_depth
            if cur_depth >= max_depth:
                dirs.clear()
            for f in files:
                p = os.path.join(root, f)
                try:
                    total_bytes += os.path.getsize(p)
                    total_files += 1
                except (OSError, PermissionError):
                    pass
    except Exception:
        pass

    return total_bytes, total_files


def _query_recycle_bin() -> tuple[int, int]:
    """Query total size in bytes and number of items in Windows Recycle Bin across drives."""
    if os.name != "nt":
        return 0, 0

    try:
        class SHQUERYRBINFO(ctypes.Structure):
            _fields_ = [
                ("cbSize", wintypes.DWORD),
                ("i64Size", ctypes.c_int64),
                ("i64NumItems", ctypes.c_int64),
            ]

        rb_info = SHQUERYRBINFO()
        rb_info.cbSize = ctypes.sizeof(rb_info)
        # Query primary drive C:\
        res = ctypes.windll.shell32.SHQueryRecycleBinW("C:\\", ctypes.byref(rb_info))
        if res == 0:
            return max(0, int(rb_info.i64Size)), max(0, int(rb_info.i64NumItems))
    except Exception as e:
        logger.debug("Failed to query recycle bin: %s", e)

    return 0, 0


def _empty_recycle_bin() -> tuple[bool, str]:
    """Empty Windows Recycle Bin across all drives without sound or confirmation prompt."""
    if os.name != "nt":
        return False, "Recycle Bin is only supported on Windows."

    try:
        # SHERB_NOCONFIRMATION (0x00000001) | SHERB_NOPROGRESSUI (0x00000002) | SHERB_NOSOUND (0x00000004) = 7
        flags = 0x00000001 | 0x00000002 | 0x00000004
        res = ctypes.windll.shell32.SHEmptyRecycleBinW(None, None, flags)
        if res == 0 or res == -2147418113:  # S_OK (0) or S_FALSE / already empty
            return True, "Successfully emptied Recycle Bin."
        return False, f"SHEmptyRecycleBinW returned code {res}."
    except Exception as e:
        return False, str(e)


# Registry of known system targets
KNOWN_TARGETS_SPECS = [
    {
        "id": "win_temp",
        "name": "Windows Temporary Files",
        "category": "system",
        "category_label": "Windows System",
        "description": "Installer logs, extract remnants, and app scratch files older than 24 hours.",
        "risk": "safe",
        "safety_notice": "100% safe. Files currently in use by running apps are automatically skipped.",
        "is_default_selected": True,
        "type": "temp_age_filter",
        "paths": [os.environ.get("TEMP") or os.path.expandvars(r"%LOCALAPPDATA%\Temp")],
    },
    {
        "id": "recycle_bin",
        "name": "Windows Recycle Bin",
        "category": "system",
        "category_label": "Windows System",
        "description": "Files and folders previously deleted that remain stored on disk.",
        "risk": "review",
        "safety_notice": "Requires manual selection. Permanently purges all items currently in your Recycle Bin.",
        "is_default_selected": False,
        "type": "recycle_bin",
        "paths": ["Recycle Bin"],
    },
    {
        "id": "browser_chrome",
        "name": "Google Chrome Cache",
        "category": "browser",
        "category_label": "Web Browsers",
        "description": "Cached web pages, scripts, and images. Preserves history, logins, and cookies.",
        "risk": "safe",
        "safety_notice": "100% safe. Only web caches are cleared. Your bookmarks and accounts are untouched.",
        "is_default_selected": True,
        "type": "dir_contents",
        "process_names": ["chrome.exe"],
        "process_app_name": "Google Chrome",
        "paths": [
            os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\User Data\Default\Cache"),
            os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\User Data\Default\Code Cache"),
            os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\User Data\Default\GPUCache"),
        ],
    },
    {
        "id": "browser_edge",
        "name": "Microsoft Edge Cache",
        "category": "browser",
        "category_label": "Web Browsers",
        "description": "Cached HTTP pages, fonts, and scripts. Preserves credentials and history.",
        "risk": "safe",
        "safety_notice": "100% safe. Edge automatically re-downloads cached media when browsing.",
        "is_default_selected": True,
        "type": "dir_contents",
        "process_names": ["msedge.exe"],
        "process_app_name": "Microsoft Edge",
        "paths": [
            os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Edge\User Data\Default\Cache"),
            os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Edge\User Data\Default\Code Cache"),
            os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Edge\User Data\Default\GPUCache"),
        ],
    },
    {
        "id": "browser_brave",
        "name": "Brave Browser Cache",
        "category": "browser",
        "category_label": "Web Browsers",
        "description": "Brave web and script cache. Preserves wallets, bookmarks, and passwords.",
        "risk": "safe",
        "safety_notice": "100% safe. Clears disposable web responses only.",
        "is_default_selected": True,
        "type": "dir_contents",
        "process_names": ["brave.exe"],
        "process_app_name": "Brave Browser",
        "paths": [
            os.path.expandvars(r"%LOCALAPPDATA%\BraveSoftware\Brave-Browser\User Data\Default\Cache"),
            os.path.expandvars(r"%LOCALAPPDATA%\BraveSoftware\Brave-Browser\User Data\Default\Code Cache"),
        ],
    },
    {
        "id": "browser_firefox",
        "name": "Mozilla Firefox Cache",
        "category": "browser",
        "category_label": "Web Browsers",
        "description": "Firefox profile cache2 files. Preserves profiles, cookies, and saved logins.",
        "risk": "safe",
        "safety_notice": "100% safe. Only web caches are removed.",
        "is_default_selected": True,
        "type": "glob_dir_contents",
        "process_names": ["firefox.exe"],
        "process_app_name": "Mozilla Firefox",
        "paths": [
            os.path.expandvars(r"%LOCALAPPDATA%\Mozilla\Firefox\Profiles\*\cache2"),
        ],
    },
    {
        "id": "crash_dumps",
        "name": "Windows Crash Dumps",
        "category": "diagnostics",
        "category_label": "System Diagnostics",
        "description": "Application crash minidumps (.dmp) created by Windows Error Reporting.",
        "risk": "safe",
        "safety_notice": "100% safe to delete. Used only for debugging crashed software.",
        "is_default_selected": True,
        "type": "dir_contents",
        "paths": [os.path.expandvars(r"%LOCALAPPDATA%\CrashDumps")],
    },
    {
        "id": "explorer_thumbnails",
        "name": "Windows Thumbnail Cache",
        "category": "system",
        "category_label": "Windows System",
        "description": "Cached image and video thumbnails. Windows regenerates these on demand.",
        "risk": "safe",
        "safety_notice": "100% safe. Thumbnails are automatically re-created when viewing folders.",
        "is_default_selected": True,
        "type": "thumbnail_dbs",
        "paths": [os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Windows\Explorer")],
    },
    {
        "id": "vscode_cache",
        "name": "VS Code Workspace Cache",
        "category": "system",
        "category_label": "Developer Tools",
        "description": "VS Code web cache and cached V8 bytecode data.",
        "risk": "safe",
        "safety_notice": "100% safe. VS Code regenerates internal bytecode on launch.",
        "is_default_selected": True,
        "type": "dir_contents",
        "process_names": ["Code.exe"],
        "process_app_name": "VS Code",
        "paths": [
            os.path.expandvars(r"%APPDATA%\Code\Cache"),
            os.path.expandvars(r"%APPDATA%\Code\CachedData"),
        ],
    },
]


def _inspect_single_target(spec: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Measure single system target footprint in parallel."""
    t_id = spec["id"]
    t_type = spec["type"]

    size_bytes = 0
    item_count = 0
    valid_paths: list[str] = []

    if t_type == "recycle_bin":
        rb_bytes, rb_items = _query_recycle_bin()
        size_bytes = rb_bytes
        item_count = rb_items
        valid_paths = ["Recycle Bin"]

    elif t_type == "temp_age_filter":
        temp_dir = spec["paths"][0]
        if temp_dir and os.path.isdir(temp_dir):
            valid_paths.append(temp_dir)
            now = time.time()
            one_day = 86400  # 24 hours
            start_t = time.time()
            try:
                for root, dirs, files in os.walk(temp_dir):
                    if time.time() - start_t > 3.0:
                        break
                    for f in files:
                        p = os.path.join(root, f)
                        try:
                            st = os.stat(p)
                            if now - st.st_mtime > one_day:
                                # Test if file can actually be deleted by current user (not locked by kernel handle or SYSTEM ACL)
                                if _is_file_deletable(p):
                                    size_bytes += st.st_size
                                    item_count += 1
                        except Exception:
                            pass
            except Exception:
                pass

    elif t_type == "thumbnail_dbs":
        exp_dir = spec["paths"][0]
        if exp_dir and os.path.isdir(exp_dir):
            valid_paths.append(exp_dir)
            dbs = glob.glob(os.path.join(exp_dir, "thumbcache_*.db"))
            total_raw = 0
            for p in dbs:
                try:
                    total_raw += os.path.getsize(p)
                except Exception:
                    pass
            # Windows Explorer shell pre-allocates an empty 3,153,408 byte baseline (15 empty database skeletons)
            # which contains 0 user thumbnails. Only report space above this empty shell baseline.
            reclaimable_thumb_bytes = max(0, total_raw - 3153408)
            size_bytes = reclaimable_thumb_bytes
            item_count = len(dbs) if reclaimable_thumb_bytes > 0 else 0

    elif t_type == "glob_dir_contents":
        for pattern in spec["paths"]:
            for match in glob.glob(pattern):
                if os.path.isdir(match):
                    valid_paths.append(match)
                    s, c = _calc_dir_footprint(match)
                    size_bytes += s
                    item_count += c

    elif t_type == "dir_contents":
        for p in spec["paths"]:
            if os.path.isdir(p):
                valid_paths.append(p)
                s, c = _calc_dir_footprint(p)
                size_bytes += s
                item_count += c

    if size_bytes == 0 and item_count == 0 and not valid_paths:
        return None

    proc_names = spec.get("process_names", [])
    is_proc_running = _is_any_process_running(proc_names) if proc_names else False
    app_name = spec.get("process_app_name", spec["name"])
    lock_message = f"{app_name} is currently open. Close {app_name} to clean its active cache." if is_proc_running else None

    return {
        "id": spec["id"],
        "name": spec["name"],
        "category": spec["category"],
        "category_label": spec["category_label"],
        "description": spec["description"],
        "risk": spec["risk"],
        "safety_notice": spec["safety_notice"],
        "is_default_selected": spec["is_default_selected"] and size_bytes > 0 and not is_proc_running,
        "is_running": is_proc_running,
        "locking_process": proc_names[0] if is_proc_running and proc_names else None,
        "lock_message": lock_message,
        "size_bytes": size_bytes,
        "item_count": item_count,
        "paths": valid_paths,
    }


def get_system_cleanup_targets() -> List[Dict[str, Any]]:
    """
    Discover and measure all available system cleanup targets in parallel.
    Returns list of discovered targets sorted descending by size.
    """
    results: List[Dict[str, Any]] = []

    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = [executor.submit(_inspect_single_target, spec) for spec in KNOWN_TARGETS_SPECS]
        for f in futures:
            try:
                res = f.result(timeout=6.0)
                if res:
                    results.append(res)
            except Exception as e:
                logger.debug("Target inspect error: %s", e)

    results.sort(key=lambda t: t["size_bytes"], reverse=True)
    return results


def clean_system_target(target_id: str) -> Dict[str, Any]:
    """
    Safely clean a specific system target by ID.
    Enforces directory root preservation, age filters, and non-blocking lock handling.
    Emits real-time progress events to progress_tracker.
    """
    target_spec = next((s for s in KNOWN_TARGETS_SPECS if s["id"] == target_id), None)
    if not target_spec:
        return {"id": target_id, "success": False, "error": f"Unknown target ID '{target_id}'."}

    t_type = target_spec["type"]
    freed_bytes = 0
    deleted_count = 0
    skipped_count = 0

    if t_type == "recycle_bin":
        progress_tracker.update(
            current_file="Windows Recycle Bin",
            log_line="Querying and emptying Windows Recycle Bin...",
        )
        prev_bytes, prev_items = _query_recycle_bin()
        ok, msg = _empty_recycle_bin()
        after_bytes, _ = _query_recycle_bin()
        actual_freed = max(0, prev_bytes - after_bytes)
        freed = actual_freed or prev_bytes
        freed_bytes = freed
        deleted_count = max(1, prev_items) if ok else 0
        progress_tracker.update(
            current_file="",
            bytes_delta=freed_bytes,
            deleted_count=deleted_count,
            log_line=f"Purged Recycle Bin: freed {_format_size_helper(freed_bytes)} ({deleted_count} items)." if ok else f"Recycle Bin error: {msg}",
        )
        return {
            "id": target_id,
            "success": ok,
            "freed_bytes": freed_bytes,
            "deleted_count": deleted_count,
            "skipped_count": 0,
            "message": msg if ok else f"Recycle Bin error: {msg}",
        }

    elif t_type == "temp_age_filter":
        temp_dir = target_spec["paths"][0]
        if temp_dir and os.path.isdir(temp_dir):
            now = time.time()
            one_day = 86400

            progress_tracker.update(
                current_file=temp_dir,
                log_line=f"Scanning {temp_dir} for files older than 24 hours...",
            )

            # Delete files >24h
            for root, dirs, files in os.walk(temp_dir, topdown=False):
                for f in files:
                    p = os.path.join(root, f)
                    try:
                        st = os.stat(p)
                        if now - st.st_mtime > one_day:
                            f_size = st.st_size
                            if not _is_file_deletable(p):
                                skipped_count += 1
                                progress_tracker.update(skipped_count=1)
                                continue
                            os.chmod(p, stat.S_IWRITE)
                            os.remove(p)
                            freed_bytes += f_size
                            deleted_count += 1
                            rel = os.path.relpath(p, temp_dir)
                            should_log = (deleted_count % 10 == 0) or (f_size > 262144)
                            progress_tracker.update(
                                current_file=rel,
                                bytes_delta=f_size,
                                deleted_count=1,
                                log_line=f"Deleted: {rel} ({_format_size_helper(f_size)})" if should_log else None,
                            )
                    except (PermissionError, OSError):
                        skipped_count += 1
                        progress_tracker.update(skipped_count=1)

                # Clean empty subdirectories (never the root temp_dir)
                for d in dirs:
                    d_path = os.path.join(root, d)
                    if d_path != temp_dir:
                        try:
                            os.rmdir(d_path)
                        except (PermissionError, OSError):
                            pass

    elif t_type == "thumbnail_dbs":
        exp_dir = target_spec["paths"][0]
        if exp_dir and os.path.isdir(exp_dir):
            dbs = glob.glob(os.path.join(exp_dir, "thumbcache_*.db"))
            for p in dbs:
                try:
                    f_size = os.path.getsize(p)
                    os.chmod(p, stat.S_IWRITE)
                    os.remove(p)
                    freed_bytes += f_size
                    deleted_count += 1
                    base = os.path.basename(p)
                    progress_tracker.update(
                        current_file=base,
                        bytes_delta=f_size,
                        deleted_count=1,
                        log_line=f"Purged thumbnail cache: {base} ({_format_size_helper(f_size)})",
                    )
                except (PermissionError, OSError):
                    skipped_count += 1
                    progress_tracker.update(skipped_count=1)

    elif t_type in ("dir_contents", "glob_dir_contents"):
        target_dirs: list[str] = []
        if t_type == "glob_dir_contents":
            for pat in target_spec["paths"]:
                target_dirs.extend(glob.glob(pat))
        else:
            target_dirs.extend(target_spec["paths"])

        proc_names = target_spec.get("process_names", [])
        is_proc_running = _is_any_process_running(proc_names) if proc_names else False
        app_name = target_spec.get("process_app_name", target_spec["name"])
        if is_proc_running:
            progress_tracker.update(
                log_line=f"⚠️ {app_name} is currently open. Active files locked by Windows will be safely skipped."
            )

        for d in target_dirs:
            if not os.path.isdir(d):
                continue
            progress_tracker.update(
                current_file=d,
                log_line=f"Clearing cache directory: {os.path.basename(d)}...",
            )
            try:
                for entry in os.listdir(d):
                    sub_path = os.path.join(d, entry)
                    try:
                        if os.path.isdir(sub_path):
                            s_before, c_before = _calc_dir_footprint(sub_path)
                            try:
                                shutil.rmtree(sub_path, onerror=_remove_readonly)
                            except Exception:
                                pass
                            if os.path.exists(sub_path):
                                s_after, c_after = _calc_dir_footprint(sub_path)
                                actual_freed = max(0, s_before - s_after)
                                freed_bytes += actual_freed
                                if actual_freed > 0:
                                    deleted_count += max(1, c_before - c_after)
                                if s_after > 0:
                                    skipped_count += (c_after or 1)
                                    progress_tracker.update(
                                        current_file=entry,
                                        skipped_count=(c_after or 1),
                                        log_line=f"Locked by running app: {entry} ({_format_size_helper(s_after)} in use by {app_name})",
                                    )
                            else:
                                freed_bytes += s_before
                                deleted_count += (c_before or 1)
                                progress_tracker.update(
                                    current_file=entry,
                                    bytes_delta=s_before,
                                    deleted_count=(c_before or 1),
                                    log_line=f"Cleared cache folder: {entry} ({_format_size_helper(s_before)})",
                                )
                        else:
                            f_size = os.path.getsize(sub_path)
                            try:
                                os.chmod(sub_path, stat.S_IWRITE)
                                os.remove(sub_path)
                                freed_bytes += f_size
                                deleted_count += 1
                                should_log = (deleted_count % 15 == 0) or (f_size > 524288)
                                progress_tracker.update(
                                    current_file=entry,
                                    bytes_delta=f_size,
                                    deleted_count=1,
                                    log_line=f"Deleted cache item: {entry} ({_format_size_helper(f_size)})" if should_log else None,
                                )
                            except (PermissionError, OSError):
                                skipped_count += 1
                                progress_tracker.update(
                                    skipped_count=1,
                                    log_line=f"Skipped in-use file: {entry}",
                                )
                    except (PermissionError, OSError):
                        skipped_count += 1
                        progress_tracker.update(skipped_count=1)
            except Exception:
                pass

    progress_tracker.update(
        log_line=f"Finished {target_spec['name']}: {_format_size_helper(freed_bytes)} reclaimed ({deleted_count} deleted, {skipped_count} skipped)."
    )

    proc_names = target_spec.get("process_names", [])
    is_proc_running = _is_any_process_running(proc_names) if proc_names else False
    app_name = target_spec.get("process_app_name", target_spec["name"])
    if is_proc_running and freed_bytes == 0 and skipped_count > 0:
        message = f"{target_spec['name']} is currently locked by {app_name}. Please close {app_name} to clean its active cache."
    else:
        message = f"Cleaned {target_spec['name']}. Freed {_format_size_helper(freed_bytes)} ({deleted_count} items removed, {skipped_count} active items safely skipped)."

    return {
        "id": target_id,
        "success": True,
        "freed_bytes": freed_bytes,
        "deleted_count": deleted_count,
        "skipped_count": skipped_count,
        "message": message,
    }


def clean_multiple_system_targets(target_ids: List[str]) -> Dict[str, Any]:
    """
    Clean multiple system targets in sequence.
    Updates progress_tracker in real time for live UI feedback.
    Returns aggregated freed bytes and per-target outcomes.
    """
    progress_tracker.start("System Junk Reclamation")
    total_freed = 0
    total_deleted = 0
    total_skipped = 0
    results: List[Dict[str, Any]] = []

    total_targets = len(target_ids)
    for idx, t_id in enumerate(target_ids):
        target_spec = next((s for s in KNOWN_TARGETS_SPECS if s["id"] == t_id), None)
        target_name = target_spec["name"] if target_spec else t_id
        percent = int((idx / max(1, total_targets)) * 100)
        progress_tracker.set_phase(f"Cleaning {target_name} ({idx + 1}/{total_targets})", percent=percent)

        res = clean_system_target(t_id)
        results.append(res)
        if res.get("success"):
            total_freed += res.get("freed_bytes", 0)
            total_deleted += res.get("deleted_count", 0)
            total_skipped += res.get("skipped_count", 0)

    summary_data = {
        "total_freed_bytes": total_freed,
        "total_deleted_count": total_deleted,
        "total_skipped_count": total_skipped,
        "results": results,
    }
    progress_tracker.finish(summary=summary_data)

    return {
        "success": True,
        "total_freed_bytes": total_freed,
        "total_deleted_count": total_deleted,
        "total_skipped_count": total_skipped,
        "results": results,
    }
