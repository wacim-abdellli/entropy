"""
Process control module.

Provides safe, audited process termination and port liberation on developer workstations.
Strictly enforces safety boundaries:
- Never terminates Windows critical system processes
- Never terminates the host Entropy process
- Always attempts graceful termination before forceful termination
"""

from __future__ import annotations

import logging
import os
import time
from typing import Any, Dict, List, Optional

import psutil

logger = logging.getLogger(__name__)

# Windows core processes that must NEVER be terminated by Entropy
PROTECTED_PROCESS_NAMES = {
    "system",
    "system idle process",
    "registry",
    "smss.exe",
    "csrss.exe",
    "wininit.exe",
    "services.exe",
    "lsass.exe",
    "fontdrvhost.exe",
    "dwm.exe",
    "memory compression",
    "explorer.exe",
    "svchost.exe",
    "spoolsv.exe",
    "winlogon.exe",
    "taskmgr.exe",
}


def is_process_protected(pid: int, name: Optional[str] = None) -> bool:
    """Return True if the specified process PID or executable name is protected."""
    # Never terminate PID 0 or PID 4 (System)
    if pid in (0, 4):
        return True

    # Never terminate self (current Entropy process)
    if pid == os.getpid():
        return True

    if name and name.lower() in PROTECTED_PROCESS_NAMES:
        return True

    try:
        proc = psutil.Process(pid)
        proc_name = proc.name().lower()
        if proc_name in PROTECTED_PROCESS_NAMES:
            return True
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        pass

    return False


def get_listening_port_owners() -> Dict[int, List[int]]:
    """Return a mapping of PID to list of listening TCP ports."""
    ports_by_pid: Dict[int, List[int]] = {}
    try:
        for conn in psutil.net_connections(kind="inet"):
            if conn.status == "LISTEN" and conn.pid:
                ports_by_pid.setdefault(conn.pid, []).append(conn.laddr.port)
    except (psutil.AccessDenied, OSError, Exception) as e:
        logger.debug("Failed to query net_connections: %s", e)
    return ports_by_pid


def terminate_process(pid: int, force: bool = False) -> Dict[str, Any]:
    """
    Safely terminate a user developer process.
    
    Args:
        pid: The process ID to terminate.
        force: If True, forces immediate termination (SIGKILL) if graceful fails.
    
    Returns:
        Dict with 'success', 'pid', 'name', and 'message' or 'error'.
    """
    if not psutil.pid_exists(pid):
        return {
            "success": False,
            "pid": pid,
            "error": f"Process with PID {pid} is no longer running.",
        }

    try:
        proc = psutil.Process(pid)
        proc_name = proc.name()
    except (psutil.NoSuchProcess, psutil.AccessDenied) as e:
        return {
            "success": False,
            "pid": pid,
            "error": f"Cannot access process PID {pid}: {e}",
        }

    if is_process_protected(pid, proc_name):
        return {
            "success": False,
            "pid": pid,
            "name": proc_name,
            "error": f"Cannot terminate '{proc_name}' (PID {pid}): It is a protected system process.",
        }

    # Step 1: Attempt graceful termination
    try:
        proc.terminate()
        # Wait up to 2.0 seconds for graceful exit
        proc.wait(timeout=2.0)
        return {
            "success": True,
            "pid": pid,
            "name": proc_name,
            "message": f"Successfully stopped {proc_name} (PID {pid}).",
        }
    except psutil.TimeoutExpired:
        if force:
            try:
                proc.kill()
                proc.wait(timeout=1.5)
                return {
                    "success": True,
                    "pid": pid,
                    "name": proc_name,
                    "message": f"Forcefully terminated {proc_name} (PID {pid}).",
                }
            except Exception as e:
                return {
                    "success": False,
                    "pid": pid,
                    "name": proc_name,
                    "error": f"Failed to force-terminate {proc_name} (PID {pid}): {e}",
                }
        else:
            return {
                "success": False,
                "pid": pid,
                "name": proc_name,
                "error": f"{proc_name} (PID {pid}) did not exit gracefully. Force terminate required.",
                "needs_force": True,
            }
    except (psutil.NoSuchProcess, psutil.AccessDenied) as e:
        return {
            "success": False,
            "pid": pid,
            "name": proc_name,
            "error": f"Error terminating {proc_name} (PID {pid}): {e}",
        }


def free_port(port: int, force: bool = True) -> Dict[str, Any]:
    """
    Find and terminate the process holding a specific listening TCP port.
    
    Args:
        port: The TCP port number (e.g. 3000, 8080).
        force: Whether to force kill if graceful exit times out.
    """
    target_pid: Optional[int] = None
    try:
        for conn in psutil.net_connections(kind="inet"):
            if conn.status == "LISTEN" and conn.laddr and conn.laddr.port == port:
                target_pid = conn.pid
                break
    except Exception as e:
        return {
            "success": False,
            "port": port,
            "error": f"Failed to scan network connections for port {port}: {e}",
        }

    if not target_pid:
        return {
            "success": False,
            "port": port,
            "error": f"No active process found listening on port {port}.",
        }

    result = terminate_process(target_pid, force=force)
    if result.get("success"):
        return {
            "success": True,
            "port": port,
            "pid": target_pid,
            "name": result.get("name"),
            "message": f"Freed Port {port} by terminating {result.get('name')} (PID {target_pid}).",
        }
    else:
        return {
            "success": False,
            "port": port,
            "pid": target_pid,
            "name": result.get("name"),
            "error": result.get("error"),
        }
