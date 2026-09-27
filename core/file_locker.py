"""
File Lock Unblocker Engine for Entropy.

Uses native Windows NT Restart Manager API (rstrtmgr.dll) and Process CWD correlation
to identify and safely terminate processes holding locks on files or directories.
Zero external dependencies.
"""

from __future__ import annotations

import ctypes
import logging
import os
import psutil
from ctypes import wintypes
from typing import Any, Dict, List, Optional, Set

from core.process_control import is_process_protected, terminate_process

logger = logging.getLogger(__name__)

# Restart Manager API Constants
CCH_RM_SESSION_KEY = 32
CCH_RM_MAX_APP_NAME = 255
CCH_RM_MAX_SVC_NAME = 63
ERROR_MORE_DATA = 234
ERROR_SUCCESS = 0


class FILETIME(ctypes.Structure):
    _fields_ = [
        ("dwLowDateTime", wintypes.DWORD),
        ("dwHighDateTime", wintypes.DWORD),
    ]


class RM_UNIQUE_PROCESS(ctypes.Structure):
    _fields_ = [
        ("dwProcessId", wintypes.DWORD),
        ("ProcessStartTime", FILETIME),
    ]


class RM_PROCESS_INFO(ctypes.Structure):
    _fields_ = [
        ("Process", RM_UNIQUE_PROCESS),
        ("strAppName", wintypes.WCHAR * (CCH_RM_MAX_APP_NAME + 1)),
        ("strServiceShortName", wintypes.WCHAR * (CCH_RM_MAX_SVC_NAME + 1)),
        ("ApplicationType", wintypes.UINT),
        ("AppStatus", wintypes.ULONG),
        ("TSSessionId", wintypes.DWORD),
        ("bRestartable", wintypes.BOOL),
    ]


def _format_size(size_bytes: int) -> str:
    """Format byte size to human readable string."""
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    elif size_bytes < 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.1f} MB"
    else:
        return f"{size_bytes / (1024 * 1024 * 1024):.2f} GB"


def _query_restart_manager(paths: List[str]) -> List[Dict[str, Any]]:
    """Query Windows Restart Manager API for processes locking the given paths."""
    if os.name != "nt" or not paths:
        return []

    try:
        rstrtmgr = ctypes.WinDLL("rstrtmgr.dll")
    except Exception as e:
        logger.debug("Failed to load rstrtmgr.dll: %s", e)
        return []

    RmStartSession = rstrtmgr.RmStartSession
    RmStartSession.argtypes = [ctypes.POINTER(wintypes.DWORD), wintypes.DWORD, wintypes.LPWSTR]
    RmStartSession.restype = wintypes.DWORD

    RmRegisterResources = rstrtmgr.RmRegisterResources
    RmRegisterResources.argtypes = [
        wintypes.DWORD,
        wintypes.UINT,
        ctypes.POINTER(wintypes.LPCWSTR),
        wintypes.UINT,
        ctypes.c_void_p,
        wintypes.UINT,
        ctypes.c_void_p,
    ]
    RmRegisterResources.restype = wintypes.DWORD

    RmGetList = rstrtmgr.RmGetList
    RmGetList.argtypes = [
        wintypes.DWORD,
        ctypes.POINTER(wintypes.UINT),
        ctypes.POINTER(wintypes.UINT),
        ctypes.POINTER(RM_PROCESS_INFO),
        ctypes.POINTER(wintypes.DWORD),
    ]
    RmGetList.restype = wintypes.DWORD

    RmEndSession = rstrtmgr.RmEndSession
    RmEndSession.argtypes = [wintypes.DWORD]
    RmEndSession.restype = wintypes.DWORD

    dwSession = wintypes.DWORD()
    sessionKey = ctypes.create_unicode_buffer(CCH_RM_SESSION_KEY + 1)

    ret = RmStartSession(ctypes.byref(dwSession), 0, sessionKey)
    if ret != ERROR_SUCCESS:
        return []

    try:
        abs_paths = [os.path.abspath(p) for p in paths if os.path.exists(p)]
        if not abs_paths:
            return []

        path_array_type = wintypes.LPCWSTR * len(abs_paths)
        file_array = path_array_type(*abs_paths)

        ret = RmRegisterResources(dwSession, len(abs_paths), file_array, 0, None, 0, None)
        if ret != ERROR_SUCCESS:
            return []

        nProcInfoNeeded = wintypes.UINT(0)
        nProcInfo = wintypes.UINT(0)
        dwRebootReasons = wintypes.DWORD(0)

        # Initial call to get count
        ret = RmGetList(
            dwSession,
            ctypes.byref(nProcInfoNeeded),
            ctypes.byref(nProcInfo),
            None,
            ctypes.byref(dwRebootReasons),
        )

        if nProcInfoNeeded.value == 0:
            return []

        rgAffectedApps = (RM_PROCESS_INFO * nProcInfoNeeded.value)()
        nProcInfo.value = nProcInfoNeeded.value

        ret = RmGetList(
            dwSession,
            ctypes.byref(nProcInfoNeeded),
            ctypes.byref(nProcInfo),
            rgAffectedApps,
            ctypes.byref(dwRebootReasons),
        )

        if ret != ERROR_SUCCESS:
            return []

        results = []
        for i in range(nProcInfo.value):
            item = rgAffectedApps[i]
            pid = item.Process.dwProcessId
            app_name = item.strAppName or "Unknown Process"
            svc_name = item.strServiceShortName or None

            results.append({
                "pid": pid,
                "name": app_name,
                "service": svc_name,
                "source": "restart_manager",
            })
        return results
    finally:
        RmEndSession(dwSession)


def find_locking_processes(target_path: str) -> Dict[str, Any]:
    """
    Diagnose which processes are locking a file or directory.
    Uses Restart Manager API handles + CWD process tracking.
    """
    abs_p = os.path.abspath(target_path)
    if not os.path.exists(abs_p):
        return {
            "path": abs_p,
            "exists": False,
            "is_locked": False,
            "locking_processes": [],
            "message": f"Target path '{abs_p}' does not exist on disk.",
        }

    is_dir = os.path.isdir(abs_p)
    files_to_query = [abs_p]

    # If it's a directory, gather sample child files that frequently get locked
    if is_dir:
        try:
            with os.scandir(abs_p) as it:
                for entry in it:
                    if entry.is_file(follow_symlinks=False):
                        files_to_query.append(entry.path)
                        if len(files_to_query) >= 15:
                            break
        except OSError:
            pass

    # 1. Query Restart Manager API for direct handle locks
    rm_procs = _query_restart_manager(files_to_query)

    discovered_pids: Set[int] = {p["pid"] for p in rm_procs}
    locking_list: List[Dict[str, Any]] = []

    # 2. Query process table for working directory (CWD) locks
    target_norm = os.path.normcase(abs_p)
    for proc in psutil.process_iter(["pid", "name", "cwd", "cmdline"]):
        try:
            pid = proc.info["pid"]
            cwd = proc.info.get("cwd")
            if not cwd:
                continue

            cwd_norm = os.path.normcase(os.path.abspath(cwd))
            is_cwd_lock = cwd_norm == target_norm or (is_dir and cwd_norm.startswith(target_norm + os.sep))

            if is_cwd_lock and pid not in discovered_pids:
                discovered_pids.add(pid)
                rm_procs.append({
                    "pid": pid,
                    "name": proc.info.get("name") or "Process",
                    "service": None,
                    "source": "cwd_lock",
                })
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass

    # 3. Enrich each locking process with memory, exe path, and safety protection flags
    for item in rm_procs:
        pid = item["pid"]
        proc_name = item["name"]
        exe_path = ""
        memory_bytes = 0
        cmdline = ""
        ports: List[int] = []

        try:
            p = psutil.Process(pid)
            proc_name = p.name()
            exe_path = p.exe()
            memory_bytes = p.memory_info().rss
            cmdline = " ".join(p.cmdline()[:4]) if p.cmdline() else ""

            # Check listening ports
            for conn in p.connections(kind="inet"):
                if conn.status == psutil.CONN_LISTEN and conn.laddr:
                    ports.append(conn.laddr.port)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass

        # Evaluate safety boundary
        protected = is_process_protected(pid, proc_name, exe_path)

        locking_list.append({
            "pid": pid,
            "name": proc_name,
            "exe_path": exe_path,
            "cmdline": cmdline,
            "memory_bytes": memory_bytes,
            "memory_formatted": _format_size(memory_bytes),
            "ports": ports,
            "source": item.get("source", "handle"),
            "is_protected": protected,
            "can_terminate": not protected,
        })

    is_locked = len(locking_list) > 0
    msg = (
        f"Found {len(locking_list)} process(es) holding locks on '{os.path.basename(abs_p)}'."
        if is_locked
        else f"No process locks detected on '{os.path.basename(abs_p)}'."
    )

    return {
        "path": abs_p,
        "name": os.path.basename(abs_p),
        "is_dir": is_dir,
        "exists": True,
        "is_locked": is_locked,
        "locking_processes": locking_list,
        "message": msg,
    }


def unlock_path(target_path: str, pids: Optional[List[int]] = None) -> Dict[str, Any]:
    """
    Terminate locking processes to free the target file or directory.
    Enforces strict process protection guardrails.
    """
    diag = find_locking_processes(target_path)
    if not diag["is_locked"]:
        return {
            "success": True,
            "path": target_path,
            "message": f"Target '{target_path}' is not locked.",
            "terminated_pids": [],
            "failed_pids": [],
        }

    target_procs = diag["locking_processes"]
    if pids:
        pid_set = set(pids)
        target_procs = [p for p in target_procs if p["pid"] in pid_set]

    terminated = []
    failed = []

    for p in target_procs:
        pid = p["pid"]
        name = p["name"]

        # Safety Check: Never kill protected system or IDE processes
        if p["is_protected"]:
            failed.append({
                "pid": pid,
                "name": name,
                "error": "Process is protected (system or editor parent process).",
            })
            continue

        res = terminate_process(pid, force=True)
        if res.get("success"):
            terminated.append({"pid": pid, "name": name})
        else:
            failed.append({"pid": pid, "name": name, "error": res.get("error", "Failed to terminate.")})

    # Re-evaluate lock status
    recheck = find_locking_processes(target_path)
    now_unlocked = not recheck["is_locked"]

    return {
        "success": now_unlocked or (len(terminated) > 0),
        "path": target_path,
        "is_now_unlocked": now_unlocked,
        "terminated": terminated,
        "failed": failed,
        "message": (
            f"Successfully freed file lock. Terminated {len(terminated)} process(es)."
            if now_unlocked
            else f"Attempted termination of {len(terminated)} process(es). Some handles may still be held."
        ),
    }
