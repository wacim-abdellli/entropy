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

# Windows core processes and user editors that must NEVER be terminated by Entropy
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
    # IDEs, text editors and browsers (never kill user's workspace UI)
    "code.exe",
    "cursor.exe",
    "idea64.exe",
    "pycharm64.exe",
    "webstorm64.exe",
    "rider64.exe",
    "clion64.exe",
    "devenv.exe",
    "sublime_text.exe",
    "notepad++.exe",
    "notepad.exe",
    "chrome.exe",
    "msedge.exe",
    "firefox.exe",
    "brave.exe",
}

# Known developer processes and runtimes that can be cleanly terminated
DEV_PROCESS_NAMES = {
    "node.exe",
    "node",
    "python.exe",
    "python",
    "python3.exe",
    "python3",
    "uvicorn.exe",
    "uvicorn",
    "gunicorn.exe",
    "gunicorn",
    "bun.exe",
    "bun",
    "deno.exe",
    "deno",
    "ruby.exe",
    "ruby",
    "cargo.exe",
    "cargo",
    "rustc.exe",
    "rustc",
    "go.exe",
    "go",
    "java.exe",
    "javaw.exe",
    "dotnet.exe",
    "dotnet",
    "php.exe",
    "php",
    "next-server",
    "vite.exe",
    "esbuild.exe",
    "webpack.exe",
    "tsc.exe",
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


def get_clean_slate_candidates(workspace_roots: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    """
    Find background developer processes that can be safely terminated in a 'Clean Slate' action.
    
    Identifies processes that:
    1. Are NOT protected system processes or IDE main windows.
    2. Match known dev process names OR have their CWD inside a workspace root OR are listening on dev ports.
    
    Returns a list of candidate dictionaries with pid, name, cwd, memory_bytes, ports, and uptime_seconds.
    """
    candidates = []
    listening_ports_by_pid = get_listening_port_owners()
    
    normalized_roots = [
        os.path.normcase(os.path.abspath(r)) for r in (workspace_roots or []) if os.path.exists(r)
    ]
    
    for proc in psutil.process_iter(attrs=["pid", "name", "create_time", "memory_info"]):
        try:
            pid = proc.info["pid"]
            name = (proc.info.get("name") or "").lower()
            
            if is_process_protected(pid, name):
                continue
                
            ports = listening_ports_by_pid.get(pid, [])
            
            cwd = None
            try:
                raw_cwd = proc.cwd()
                if raw_cwd:
                    cwd = os.path.normpath(raw_cwd)
            except (psutil.AccessDenied, psutil.NoSuchProcess, OSError):
                cwd = None
                
            in_workspace = False
            if cwd and normalized_roots:
                norm_cwd = os.path.normcase(os.path.abspath(cwd))
                in_workspace = any(norm_cwd.startswith(r + os.sep) or norm_cwd == r for r in normalized_roots)
            
            is_dev_name = name in DEV_PROCESS_NAMES or any(name.startswith(p.split(".")[0]) for p in DEV_PROCESS_NAMES)
            has_dev_ports = bool(ports)
            
            # Must be a dev process or inside workspace or holding ports
            if not (is_dev_name or in_workspace or has_dev_ports):
                continue
                
            mem_bytes = 0
            if proc.info.get("memory_info"):
                mem_bytes = getattr(proc.info["memory_info"], "rss", 0)
                
            create_time = proc.info.get("create_time") or time.time()
            uptime_seconds = max(0.0, time.time() - create_time)
            
            candidates.append({
                "pid": pid,
                "name": proc.info.get("name") or name,
                "cwd": cwd,
                "memory_bytes": mem_bytes,
                "ports": ports,
                "uptime_seconds": uptime_seconds,
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
            
    return candidates


def clean_slate_dev_processes(
    pids: Optional[List[int]] = None,
    workspace_roots: Optional[List[str]] = None,
    force: bool = True,
) -> Dict[str, Any]:
    """
    Safely terminate background developer processes to reclaim RAM and free dev ports.
    
    Args:
        pids: Optional explicit list of PIDs to terminate. If None, targets all clean slate candidates.
        workspace_roots: Optional workspace directories to identify dev processes.
        force: Whether to force kill if graceful exit times out.
        
    Returns:
        Summary dict with terminated_count, freed_memory_bytes, terminated_processes, and errors.
    """
    if pids is not None:
        targets = []
        for p in pids:
            try:
                proc = psutil.Process(p)
                targets.append({
                    "pid": p,
                    "name": proc.name(),
                    "memory_bytes": proc.memory_info().rss if hasattr(proc, "memory_info") else 0,
                })
            except Exception:
                targets.append({"pid": p, "name": "unknown", "memory_bytes": 0})
    else:
        targets = get_clean_slate_candidates(workspace_roots)
        
    terminated = []
    errors = []
    total_freed_bytes = 0
    
    for item in targets:
        pid = item["pid"]
        res = terminate_process(pid, force=force)
        if res.get("success"):
            freed = item.get("memory_bytes", 0)
            total_freed_bytes += freed
            terminated.append({
                "pid": pid,
                "name": item.get("name", res.get("name")),
                "memory_bytes": freed,
            })
        else:
            errors.append({
                "pid": pid,
                "name": item.get("name"),
                "error": res.get("error"),
            })
            
    return {
        "success": len(terminated) > 0 or len(errors) == 0,
        "terminated_count": len(terminated),
        "freed_memory_bytes": total_freed_bytes,
        "terminated_processes": terminated,
        "errors": errors,
    }
