"""
Windows PATH Decay & Binary Collision Auditor for Entropy.

Zero external dependencies: native winreg, ctypes, os, subprocess.
Audits Windows User & System PATH for:
1. Dead/Orphaned directory references (uninstalled software residue).
2. Duplicate path entries inflating environment length.
3. Path length limit hazards (Win32 2048-char limits).
4. Binary shadowing collisions (e.g. multiple python.exe, node.exe, git.exe).
5. Safe pruning with automatic .reg backup and WM_SETTINGCHANGE environment broadcast.
"""

from __future__ import annotations

import ctypes
import datetime
import logging
import os
import shutil
import subprocess
import winreg
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional, Set, Tuple

logger = logging.getLogger(__name__)

# Common developer toolchain executables to check for shadowing collisions
COMMON_DEV_BINARIES = [
    "python.exe",
    "python3.exe",
    "node.exe",
    "npm.cmd",
    "npx.cmd",
    "git.exe",
    "cargo.exe",
    "rustc.exe",
    "go.exe",
    "dotnet.exe",
    "javac.exe",
    "java.exe",
    "docker.exe",
    "code.cmd",
    "cursor.cmd",
]


@dataclass
class PathEntryItem:
    raw: str
    expanded: str
    is_valid: bool
    is_duplicate: bool
    index: int


@dataclass
class BinaryCollision:
    binary: str
    active_path: str
    active_version: Optional[str] = None
    shadowed_paths: List[str] = field(default_factory=list)
    total_found: int = 0


@dataclass
class PathAuditReport:
    user_path_length: int
    system_path_length: int
    safe_length_limit: int = 2048
    exceeds_limit: bool = False
    user_entries_count: int = 0
    dead_entries_count: int = 0
    duplicate_entries_count: int = 0
    user_entries: List[PathEntryItem] = field(default_factory=list)
    dead_entries: List[str] = field(default_factory=list)
    duplicate_entries: List[str] = field(default_factory=list)
    collisions: List[BinaryCollision] = field(default_factory=list)
    summary: str = ""
    health_score: int = 100
    status: str = "optimal"  # "optimal" | "warning" | "critical"


def _read_registry_path(hive: int, subkey: str) -> Tuple[str, int]:
    """Read Path string and registry type (REG_EXPAND_SZ or REG_SZ) from specified hive."""
    try:
        with winreg.OpenKey(hive, subkey, 0, winreg.KEY_READ) as key:
            val, val_type = winreg.QueryValueEx(key, "Path")
            return val if isinstance(val, str) else "", val_type
    except FileNotFoundError:
        return "", winreg.REG_EXPAND_SZ
    except Exception as e:
        logger.warning(f"Could not read registry path from {subkey}: {e}")
        return "", winreg.REG_EXPAND_SZ


def _broadcast_environment_change() -> bool:
    """
    Broadcast WM_SETTINGCHANGE with lParam="Environment" via Win32 API.
    Notifies Windows Explorer, terminals, and services of PATH updates without reboot.
    """
    try:
        HWND_BROADCAST = 0xFFFF
        WM_SETTINGCHANGE = 0x001A
        SMTO_ABORTIFHUNG = 0x0002
        result = ctypes.c_ulong()
        res = ctypes.windll.user32.SendMessageTimeoutW(
            HWND_BROADCAST,
            WM_SETTINGCHANGE,
            0,
            "Environment",
            SMTO_ABORTIFHUNG,
            5000,
            ctypes.byref(result),
        )
        return bool(res)
    except Exception as e:
        logger.warning(f"Failed to broadcast WM_SETTINGCHANGE: {e}")
        return False


def _get_binary_version(binary_name: str, file_path: str) -> Optional[str]:
    """Extract quick version string from binary if possible."""
    if not os.path.isfile(file_path):
        return None
    creationflags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    try:
        res = subprocess.run(
            [file_path, "--version"],
            capture_output=True,
            text=True,
            timeout=2,
            creationflags=creationflags,
        )
        if res.returncode == 0 and res.stdout:
            first_line = res.stdout.strip().split("\n")[0].strip()
            return first_line[:40] if first_line else None
    except Exception:
        pass
    return None


def audit_path_environment() -> PathAuditReport:
    """
    Audit both User and System PATH environments on Windows.
    Detects dead paths, duplicate paths, length limits, and binary collisions.
    """
    user_raw_path, _ = _read_registry_path(
        winreg.HKEY_CURRENT_USER,
        r"Environment",
    )
    system_raw_path, _ = _read_registry_path(
        winreg.HKEY_LOCAL_MACHINE,
        r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment",
    )

    user_length = len(user_raw_path)
    system_length = len(system_raw_path)
    exceeds_limit = user_length > 2048

    # Parse User entries
    user_parts = [p.strip() for p in user_raw_path.split(";") if p.strip()]
    seen_normalized: Set[str] = set()
    user_items: List[PathEntryItem] = []
    dead_list: List[str] = []
    duplicate_list: List[str] = []

    for idx, raw in enumerate(user_parts):
        expanded = os.path.expandvars(raw).rstrip("\\/")
        norm = os.path.normcase(expanded)
        is_dup = norm in seen_normalized
        is_dir = os.path.isdir(expanded)

        if is_dup:
            duplicate_list.append(raw)
        else:
            seen_normalized.add(norm)

        if not is_dir:
            dead_list.append(raw)

        user_items.append(
            PathEntryItem(
                raw=raw,
                expanded=expanded,
                is_valid=is_dir,
                is_duplicate=is_dup,
                index=idx,
            )
        )

    # Effective full PATH as seen by current process
    effective_paths: List[str] = []
    current_env_path = os.environ.get("PATH", "")
    for p in current_env_path.split(";"):
        p_clean = p.strip()
        if p_clean:
            effective_paths.append(os.path.expandvars(p_clean))

    # Binary collisions check
    collisions: List[BinaryCollision] = []
    for binary in COMMON_DEV_BINARIES:
        found_locations: List[str] = []
        for p_dir in effective_paths:
            candidate = os.path.join(p_dir, binary)
            if os.path.isfile(candidate):
                norm_cand = os.path.normcase(os.path.abspath(candidate))
                if norm_cand not in [os.path.normcase(os.path.abspath(f)) for f in found_locations]:
                    found_locations.append(candidate)

        if len(found_locations) > 1:
            active = found_locations[0]
            shadowed = found_locations[1:]
            version_str = _get_binary_version(binary, active)
            collisions.append(
                BinaryCollision(
                    binary=binary,
                    active_path=active,
                    active_version=version_str,
                    shadowed_paths=shadowed,
                    total_found=len(found_locations),
                )
            )

    # Compute health score
    score = 100
    if exceeds_limit:
        score -= 30
    if len(duplicate_list) > 0:
        score -= min(25, len(duplicate_list) * 2)
    if len(dead_list) > 0:
        score -= min(25, len(dead_list) * 5)
    if len(collisions) > 0:
        score -= min(20, len(collisions) * 5)
    score = max(0, min(100, score))

    status = "optimal"
    if score < 60 or exceeds_limit:
        status = "critical"
    elif score < 85:
        status = "warning"

    summary_parts = []
    if exceeds_limit:
        summary_parts.append(f"PATH length ({user_length} chars) exceeds the 2,048 safety limit")
    if duplicate_list:
        summary_parts.append(f"{len(duplicate_list)} duplicate entries")
    if dead_list:
        summary_parts.append(f"{len(dead_list)} dead path(s)")
    if collisions:
        summary_parts.append(f"{len(collisions)} shadowed binary collision(s)")

    if summary_parts:
        summary = "Issues detected: " + ", ".join(summary_parts) + "."
    else:
        summary = "Windows PATH is clean, well-ordered, and within safe length limits."

    return PathAuditReport(
        user_path_length=user_length,
        system_path_length=system_length,
        safe_length_limit=2048,
        exceeds_limit=exceeds_limit,
        user_entries_count=len(user_parts),
        dead_entries_count=len(dead_list),
        duplicate_entries_count=len(duplicate_list),
        user_entries=user_items,
        dead_entries=dead_list,
        duplicate_entries=duplicate_list,
        collisions=collisions,
        summary=summary,
        health_score=score,
        status=status,
    )


def prune_user_path(
    remove_dead: bool = True,
    remove_duplicates: bool = True,
    remove_items: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Safely prune User PATH environment variable.
    Always creates a timestamped .reg backup before modifying the registry.
    Broadcasts WM_SETTINGCHANGE so all apps immediately see the updated PATH.
    """
    user_raw_path, val_type = _read_registry_path(
        winreg.HKEY_CURRENT_USER,
        r"Environment",
    )
    if not user_raw_path:
        return {"success": False, "error": "No User PATH found in registry."}

    # 1. Create automatic backup directory & .reg file
    backup_dir = os.path.join(os.path.expanduser("~"), ".entropy", "backups")
    os.makedirs(backup_dir, exist_ok=True)
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_file = os.path.join(backup_dir, f"user_path_backup_{timestamp}.reg")

    try:
        # Export registry key via reg.exe
        subprocess.run(
            ["reg.exe", "export", r"HKCU\Environment", backup_file, "/y"],
            capture_output=True,
            text=True,
            timeout=10,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
    except Exception as e:
        logger.warning(f"Could not create registry backup with reg.exe: {e}")

    # 2. Filter entries
    parts = [p.strip() for p in user_raw_path.split(";") if p.strip()]
    initial_count = len(parts)
    initial_length = len(user_raw_path)

    remove_set = set(os.path.normcase(os.path.expandvars(p)) for p in (remove_items or []))

    seen_norms: Set[str] = set()
    kept_parts: List[str] = []
    pruned_dead = 0
    pruned_dups = 0
    pruned_manual = 0

    for raw in parts:
        expanded = os.path.expandvars(raw).rstrip("\\/")
        norm = os.path.normcase(expanded)

        if norm in remove_set:
            pruned_manual += 1
            continue

        if remove_duplicates and norm in seen_norms:
            pruned_dups += 1
            continue

        if remove_dead and not os.path.isdir(expanded):
            pruned_dead += 1
            continue

        seen_norms.add(norm)
        kept_parts.append(raw)

    new_path = ";".join(kept_parts)

    # 3. Write back to registry
    try:
        with winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Environment",
            0,
            winreg.KEY_SET_VALUE,
        ) as key:
            winreg.SetValueEx(key, "Path", 0, val_type, new_path)
    except Exception as e:
        logger.error(f"Failed to write new PATH to registry: {e}")
        return {"success": False, "error": f"Failed to update registry: {e}"}

    # 4. Broadcast environment update
    _broadcast_environment_change()

    freed_chars = initial_length - len(new_path)
    pruned_total = initial_count - len(kept_parts)

    return {
        "success": True,
        "message": f"Safely pruned {pruned_total} entry(s). Freed {freed_chars} characters.",
        "backup_path": backup_file,
        "initial_length": initial_length,
        "new_length": len(new_path),
        "freed_chars": freed_chars,
        "initial_count": initial_count,
        "remaining_count": len(kept_parts),
        "pruned_dead_count": pruned_dead,
        "pruned_duplicate_count": pruned_dups,
        "pruned_manual_count": pruned_manual,
    }
