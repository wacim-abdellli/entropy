"""
Native Windows RAM Working-Set Trimmer / Memory Booster for Developer Workstations.

Leverages Win32 psapi.EmptyWorkingSet to safely release inactive physical RAM pages
back to the Windows standby/available pool without terminating background apps.
Ideal for dormant IDEs (VS Code, Cursor), compilers, Docker, dev servers, and browser tabs.
"""

from __future__ import annotations

import ctypes
import logging
import os
import sys
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Standard target process names common to developer workflows
DEV_PROCESS_TARGETS = {
    "node.exe",
    "code.exe",
    "cursor.exe",
    "chrome.exe",
    "msedge.exe",
    "brave.exe",
    "firefox.exe",
    "python.exe",
    "pythonw.exe",
    "docker.exe",
    "com.docker.backend.exe",
    "com.docker.service.exe",
    "wsl.exe",
    "wslhost.exe",
    "cargo.exe",
    "rustc.exe",
    "git.exe",
    "idea64.exe",
    "pycharm64.exe",
    "webstorm64.exe",
    "devenv.exe",
    "msbuild.exe",
    "dotnet.exe",
    "java.exe",
    "electron.exe",
    "slack.exe",
    "discord.exe",
    "postman.exe",
    "datagrip64.exe",
    "goland64.exe",
    "clion64.exe",
}

# Win32 Process Access Rights
PROCESS_QUERY_INFORMATION = 0x0400
PROCESS_SET_QUOTA = 0x0100
PROCESS_VM_READ = 0x0010
DESIRED_ACCESS = PROCESS_QUERY_INFORMATION | PROCESS_SET_QUOTA | PROCESS_VM_READ


def _format_size(size_bytes: int) -> str:
    """Format byte count to human-readable string."""
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    elif size_bytes < 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.1f} MB"
    else:
        return f"{size_bytes / (1024 * 1024 * 1024):.2f} GB"


def trim_process_working_set(pid: int) -> Dict[str, Any]:
    """
    Trim physical RAM working set of a single process by PID using native Win32 EmptyWorkingSet.
    Safe and non-destructive: only flushes paged pool back to disk or standby list.
    """
    if sys.platform != "win32":
        return {"success": False, "pid": pid, "error": "RAM trimming requires Windows OS."}

    if pid == os.getpid():
        return {"success": False, "pid": pid, "error": "Cannot trim own process while running."}

    import psutil

    try:
        proc = psutil.Process(pid)
        name = proc.name()
        before_bytes = proc.memory_info().rss
    except (psutil.NoSuchProcess, psutil.AccessDenied) as e:
        return {"success": False, "pid": pid, "error": f"Cannot access process {pid}: {e}"}

    try:
        kernel32 = ctypes.windll.kernel32
        psapi = ctypes.windll.psapi

        h_process = kernel32.OpenProcess(DESIRED_ACCESS, False, pid)
        if not h_process:
            # Fallback to PROCESS_SET_QUOTA | PROCESS_QUERY_INFORMATION
            h_process = kernel32.OpenProcess(PROCESS_SET_QUOTA | PROCESS_QUERY_INFORMATION, False, pid)

        if not h_process:
            return {
                "success": False,
                "pid": pid,
                "name": name,
                "error": f"Access denied (OpenProcess failed with code {kernel32.GetLastError()}).",
            }

        try:
            res = psapi.EmptyWorkingSet(h_process)
            if not res:
                err = kernel32.GetLastError()
                return {"success": False, "pid": pid, "name": name, "error": f"EmptyWorkingSet failed ({err})"}
        finally:
            kernel32.CloseHandle(h_process)

        # Measure working set post-trim
        try:
            after_bytes = proc.memory_info().rss
        except Exception:
            after_bytes = before_bytes

        freed_bytes = max(0, before_bytes - after_bytes)

        return {
            "success": True,
            "pid": pid,
            "name": name,
            "before_bytes": before_bytes,
            "after_bytes": after_bytes,
            "freed_bytes": freed_bytes,
            "freed_formatted": _format_size(freed_bytes),
        }
    except Exception as e:
        logger.debug("Failed to trim process %d: %s", pid, e)
        return {"success": False, "pid": pid, "name": name, "error": str(e)}


def trim_developer_working_sets(pids: Optional[List[int]] = None) -> Dict[str, Any]:
    """
    Safely trim the working sets of targeted or all running developer and browser processes.
    Reclaims unused physical RAM instantly without quitting apps or losing state.
    """
    if sys.platform != "win32":
        return {
            "success": False,
            "total_freed_bytes": 0,
            "total_freed_formatted": "0 B",
            "target_count": 0,
            "trimmed_count": 0,
            "results": [],
            "error": "Memory boosting is only supported on Windows.",
        }

    import psutil

    current_pid = os.getpid()
    results: List[Dict[str, Any]] = []
    total_freed = 0
    target_procs: List[int] = []

    if pids is not None:
        target_procs = [p for p in pids if p != current_pid]
    else:
        for p in psutil.process_iter(["pid", "name"]):
            try:
                pid = p.info["pid"]
                name = (p.info["name"] or "").lower()
                if pid == current_pid or pid <= 4:
                    continue
                if name in DEV_PROCESS_TARGETS or any(k in name for k in ("electron", "code", "cursor", "node")):
                    target_procs.append(pid)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue

    for pid in target_procs:
        res = trim_process_working_set(pid)
        if res.get("success"):
            freed = res.get("freed_bytes", 0)
            total_freed += freed
            results.append(res)
        elif res.get("name"):
            results.append(res)

    # Sort results by most freed bytes descending
    results.sort(key=lambda r: r.get("freed_bytes", 0), reverse=True)

    trimmed_count = sum(1 for r in results if r.get("success") and r.get("freed_bytes", 0) > 0)

    return {
        "success": True,
        "total_freed_bytes": total_freed,
        "total_freed_formatted": _format_size(total_freed),
        "target_count": len(target_procs),
        "trimmed_count": trimmed_count,
        "results": results[:50],  # Return top 50
        "message": f"Successfully trimmed memory across {trimmed_count} processes, reclaiming {_format_size(total_freed)} of physical RAM.",
    }
