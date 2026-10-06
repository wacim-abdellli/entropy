"""
Developer Machine Performance & Configuration Tuner for Entropy.

Inspects and tunes Windows developer settings for optimal speed:
1. Long Paths Support (removes MAX_PATH 260-character limit for deep node_modules)
2. Windows Developer Mode (enables unprivileged NTFS symlinks for pnpm & cargo)
3. Windows Defender Exclusions (excludes workspace directories to boost build speeds by 30-50%)
"""

from __future__ import annotations

import logging
import os
import subprocess
import winreg
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


def is_dev_mode_enabled() -> bool:
    """Check if Windows Developer Mode is enabled."""
    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock") as key:
            val, _ = winreg.QueryValueEx(key, "AllowDevelopmentWithoutDevLicense")
            return val == 1
    except Exception:
        return False


def is_long_paths_enabled() -> bool:
    """Check if Windows 260-character MAX_PATH limit removal is enabled."""
    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SYSTEM\CurrentControlSet\Control\FileSystem") as key:
            val, _ = winreg.QueryValueEx(key, "LongPathsEnabled")
            return val == 1
    except Exception:
        return False


def get_defender_exclusions() -> List[str]:
    """Retrieve list of currently configured Windows Defender exclusion paths."""
    try:
        ps_cmd = "Get-MpPreference | Select-Object -ExpandProperty ExclusionPath"
        creationflags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        res = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps_cmd],
            capture_output=True,
            text=True,
            timeout=8,
            creationflags=creationflags,
        )
        if res.returncode == 0:
            lines = [l.strip() for l in res.stdout.splitlines() if l.strip()]
            return [l for l in lines if os.path.exists(l) or "\\" in l]
    except Exception as e:
        logger.debug("Failed to query Defender exclusions: %s", e)
    return []


def get_performance_tuning_report(workspace_paths: Optional[List[str]] = None) -> Dict[str, Any]:
    """
    Generate an actionable performance and tuning diagnosis for this developer PC.
    """
    dev_mode = is_dev_mode_enabled()
    long_paths = is_long_paths_enabled()
    exclusions = get_defender_exclusions()
    norm_exclusions = {os.path.normcase(os.path.abspath(p)) for p in exclusions}

    recommendations: List[Dict[str, Any]] = []

    # 1. Long Paths Recommendation
    if not long_paths:
        recommendations.append({
            "id": "enable_long_paths",
            "title": "Enable Win32 Long Paths (MAX_PATH Removal)",
            "impact": "High",
            "category": "stability",
            "description": "Windows restricts file paths to 260 characters by default. Deep node_modules, Python virtualenvs, and CMake build trees frequently crash builds without LongPathsEnabled.",
            "action_label": "Enable Long Paths",
            "action_id": "apply_long_paths",
        })

    # 2. Developer Mode Recommendation
    if not dev_mode:
        recommendations.append({
            "id": "enable_dev_mode",
            "title": "Enable Windows Developer Mode",
            "impact": "High",
            "category": "performance",
            "description": "Allows pnpm, npm, cargo, and git to create NTFS symbolic links without administrator elevation, dramatically accelerating package installs.",
            "action_label": "Enable Dev Mode",
            "action_id": "apply_dev_mode",
        })

    # 3. Defender Antivirus Exclusions for active workspaces
    if workspace_paths:
        unexcluded = []
        for wp in workspace_paths:
            abs_wp = os.path.abspath(wp)
            if os.path.isdir(abs_wp):
                norm_wp = os.path.normcase(abs_wp)
                if not any(norm_wp == e or norm_wp.startswith(e + os.sep) for e in norm_exclusions):
                    unexcluded.append(abs_wp)

        if unexcluded:
            count = len(unexcluded)
            recommendations.append({
                "id": "defender_exclusions",
                "title": f"Exclude {count} Developer Workspace(s) from Defender Scan",
                "impact": "Very High",
                "category": "performance",
                "description": f"Real-time Windows Defender scanning intercepts file read/writes during npm install and compiler passes. Excluding your workspace folder(s) can accelerate builds by 30% to 50%.",
                "action_label": "Boost Build Speed",
                "action_id": "apply_defender_exclusion",
                "payload": {"paths": unexcluded},
            })

    return {
        "dev_mode_enabled": dev_mode,
        "long_paths_enabled": long_paths,
        "defender_exclusions_count": len(exclusions),
        "defender_exclusions": exclusions,
        "recommendations": recommendations,
    }


def _is_elevation_cancelled(stderr_or_error: str) -> bool:
    """Detect if elevated process failed because user declined the UAC prompt (Win32 1223)."""
    if not stderr_or_error:
        return False
    lowered = stderr_or_error.lower()
    return (
        "1223" in lowered
        or "canceled by the user" in lowered
        or "cancelled by the user" in lowered
        or "operation was canceled" in lowered
        or "operation was cancelled" in lowered
    )


def enable_long_paths() -> Dict[str, Any]:
    """Enable Win32 Long Paths via elevated registry update."""
    cmd = (
        'Start-Process powershell.exe -ArgumentList "-NoProfile -Command '
        'Set-ItemProperty -Path \'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\FileSystem\' -Name \'LongPathsEnabled\' -Value 1" '
        '-Verb RunAs -Wait -WindowStyle Hidden'
    )
    try:
        creationflags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        res = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", cmd],
            capture_output=True,
            text=True,
            timeout=30,
            creationflags=creationflags,
        )
        if is_long_paths_enabled():
            return {
                "success": True,
                "message": "Long Paths enabled successfully.",
            }

        combined_err = f"{res.stderr or ''} {res.stdout or ''}".strip()
        if _is_elevation_cancelled(combined_err):
            return {
                "success": False,
                "cancelled": True,
                "error": "Administrator permission was declined.",
                "message": "Administrator permission was declined.",
                "resolution": "Windows requires administrative permissions to enable Win32 Long Paths in the system registry.",
            }

        return {
            "success": False,
            "cancelled": False,
            "error": combined_err or "Failed to enable Long Paths.",
            "message": "Failed to enable Long Paths.",
        }
    except Exception as e:
        err_str = str(e)
        if _is_elevation_cancelled(err_str):
            return {
                "success": False,
                "cancelled": True,
                "error": "Administrator permission was declined.",
                "message": "Administrator permission was declined.",
                "resolution": "Windows requires administrative permissions to enable Win32 Long Paths in the system registry.",
            }
        return {"success": False, "cancelled": False, "error": err_str}


def enable_developer_mode() -> Dict[str, Any]:
    """Enable Windows Developer Mode via elevated registry update."""
    cmd = (
        'Start-Process powershell.exe -ArgumentList "-NoProfile -Command '
        'Set-ItemProperty -Path \'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AppModelUnlock\' -Name \'AllowDevelopmentWithoutDevLicense\' -Value 1" '
        '-Verb RunAs -Wait -WindowStyle Hidden'
    )
    try:
        creationflags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        res = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", cmd],
            capture_output=True,
            text=True,
            timeout=30,
            creationflags=creationflags,
        )
        if is_dev_mode_enabled():
            return {
                "success": True,
                "message": "Developer Mode enabled successfully.",
            }

        combined_err = f"{res.stderr or ''} {res.stdout or ''}".strip()
        if _is_elevation_cancelled(combined_err):
            return {
                "success": False,
                "cancelled": True,
                "error": "Administrator permission was declined.",
                "message": "Administrator permission was declined.",
                "resolution": "Windows requires administrative permissions to enable Developer Mode.",
            }

        return {
            "success": False,
            "cancelled": False,
            "error": combined_err or "Failed to enable Developer Mode.",
            "message": "Failed to enable Developer Mode.",
        }
    except Exception as e:
        err_str = str(e)
        if _is_elevation_cancelled(err_str):
            return {
                "success": False,
                "cancelled": True,
                "error": "Administrator permission was declined.",
                "message": "Administrator permission was declined.",
                "resolution": "Windows requires administrative permissions to enable Developer Mode.",
            }
        return {"success": False, "cancelled": False, "error": err_str}


def add_defender_exclusion(folder_path: str) -> Dict[str, Any]:
    """Add a directory path to Windows Defender antivirus exclusion list with elevation."""
    return add_defender_exclusions_batch([folder_path])


def add_defender_exclusions_batch(folder_paths: List[str]) -> Dict[str, Any]:
    """Add multiple directory paths to Windows Defender antivirus exclusions in a single elevated prompt."""
    valid_paths: List[str] = []
    for p in folder_paths:
        if not p or not isinstance(p, str):
            continue
        # Reject control characters and dangerous metacharacters
        if any(c in p for c in ("\n", "\r", "\0", "`", '"')):
            logger.warning("Rejected suspicious path for Defender exclusion: %s", p)
            continue
        abs_p = os.path.abspath(p)
        if os.path.isdir(abs_p):
            valid_paths.append(abs_p)

    if not valid_paths:
        return {"success": False, "error": "No valid directories provided to exclude."}

    # Format PowerShell array literal with safe single-quote doubling: @('C:\path1', 'C:\path2')
    formatted_literals = [f"'{p.replace(chr(39), chr(39) * 2)}'" for p in valid_paths]
    escaped_paths = ", ".join(formatted_literals)
    cmd = (
        f'Start-Process powershell.exe -ArgumentList "-NoProfile -Command '
        f'Add-MpPreference -ExclusionPath @({escaped_paths})" -Verb RunAs -Wait -WindowStyle Hidden'
    )
    try:
        creationflags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        res = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", cmd],
            capture_output=True,
            text=True,
            timeout=45,
            creationflags=creationflags,
        )

        combined_err = f"{res.stderr or ''} {res.stdout or ''}".strip()
        if _is_elevation_cancelled(combined_err):
            return {
                "success": False,
                "cancelled": True,
                "error": "Administrator permission was declined.",
                "message": "Administrator permission was declined.",
                "resolution": "Windows Defender requires administrator permissions to configure folder exclusions.",
            }

        # If command exited cleanly with no errors, return success immediately
        if res.returncode == 0 and not combined_err:
            return {
                "success": True,
                "paths": valid_paths,
                "count": len(valid_paths),
                "message": f"Successfully excluded {len(valid_paths)} workspace(s) from Windows Defender real-time scanning.",
            }

        # Otherwise, verify if exclusions were registered
        existing = {os.path.normcase(os.path.abspath(e)) for e in get_defender_exclusions()}
        added = [p for p in valid_paths if os.path.normcase(p) in existing]
        if added:
            return {
                "success": True,
                "paths": added,
                "count": len(added),
                "message": f"Successfully excluded {len(added)} workspace(s) from Windows Defender real-time scanning.",
            }

        return {
            "success": False,
            "cancelled": False,
            "error": combined_err or "Failed to add Defender exclusions.",
            "message": "Failed to add Defender exclusions.",
        }
    except Exception as e:
        err_str = str(e)
        if _is_elevation_cancelled(err_str):
            return {
                "success": False,
                "cancelled": True,
                "error": "Administrator permission was declined.",
                "message": "Administrator permission was declined.",
                "resolution": "Windows Defender requires administrator permissions to configure folder exclusions.",
            }
        return {"success": False, "cancelled": False, "error": err_str}

