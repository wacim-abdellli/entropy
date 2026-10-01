"""
Entropy Startup Programs Manager.

Audits, toggles, and optimizes Windows boot startup applications without requiring
administrator privileges. Synchronizes directly with native Windows Task Manager
using the StartupApproved registry hive.
"""

from __future__ import annotations

import logging
import os
import re
import shlex
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

HKCU_RUN = r"Software\Microsoft\Windows\CurrentVersion\Run"
HKLM_RUN = r"Software\Microsoft\Windows\CurrentVersion\Run"
STARTUP_APPROVED_RUN = r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"
STARTUP_APPROVED_STARTUP = r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder"

KNOWN_HIGH_IMPACT = {
    "docker desktop", "discord", "steam", "spotify", "slack", "notion", "teams", "epicgameslauncher",
    "battle.net", "visual studio", "vscode", "cursor", "jetbrains", "chrome", "edge"
}
KNOWN_LOW_IMPACT = {
    "securityhealth", "realtek", "onedrive", "audio", "touchpad", "screenrec"
}


def _extract_executable_path(command: str) -> str:
    """Extract clean executable path from a command string that may contain flags and quotes."""
    cmd = command.strip()
    if not cmd:
        return ""
    if cmd.startswith('"'):
        match = re.match(r'^"([^"]+)"', cmd)
        if match:
            return os.path.expandvars(match.group(1))
    parts = cmd.split()
    return os.path.expandvars(parts[0]) if parts else cmd


def _estimate_boot_impact(name: str, exe_path: str) -> str:
    """Classify startup impact as High, Medium, or Low."""
    n_lower = name.lower()
    e_lower = exe_path.lower()
    if any(k in n_lower or k in e_lower for k in KNOWN_HIGH_IMPACT):
        return "high"
    if any(k in n_lower or k in e_lower for k in KNOWN_LOW_IMPACT):
        return "low"
    return "medium"


def _get_startup_approved_states() -> Dict[str, bool]:
    """Query Windows Task Manager StartupApproved states (True = enabled, False = disabled)."""
    states: Dict[str, bool] = {}
    try:
        import winreg

        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, STARTUP_APPROVED_RUN) as key:
            for i in range(winreg.QueryInfoKey(key)[1]):
                name, val, _ = winreg.EnumValue(key, i)
                # First byte is 0x02 for enabled, 0x03 or 0x01 for disabled
                if isinstance(val, (bytes, bytearray)) and len(val) > 0:
                    states[name.lower()] = val[0] % 2 == 0
                else:
                    states[name.lower()] = True
    except Exception as e:
        logger.debug("Could not read StartupApproved\\Run hive: %s", e)

    return states


def get_startup_programs() -> List[Dict[str, Any]]:
    """Retrieve all Windows auto-start programs from registry and user startup folder."""
    import winreg

    items: List[Dict[str, Any]] = []
    approved_states = _get_startup_approved_states()

    # 1. HKCU Run (User-level, fully modifiable)
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, HKCU_RUN) as key:
            for i in range(winreg.QueryInfoKey(key)[1]):
                name, cmd_val, _ = winreg.EnumValue(key, i)
                cmd_str = str(cmd_val)
                exe = _extract_executable_path(cmd_str)
                exists = os.path.exists(exe) if exe else False
                is_enabled = approved_states.get(name.lower(), True)

                items.append({
                    "id": f"hkcu:{name}",
                    "name": name,
                    "command": cmd_str,
                    "exe_path": exe,
                    "exists": exists,
                    "is_enabled": is_enabled,
                    "scope": "user_registry",
                    "source": "HKCU\\Run",
                    "can_modify": True,
                    "impact": _estimate_boot_impact(name, exe),
                })
    except Exception as e:
        logger.debug("Could not read HKCU Run: %s", e)

    # 2. HKLM Run (System-wide, read-only without admin)
    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, HKLM_RUN) as key:
            for i in range(winreg.QueryInfoKey(key)[1]):
                name, cmd_val, _ = winreg.EnumValue(key, i)
                cmd_str = str(cmd_val)
                exe = _extract_executable_path(cmd_str)
                exists = os.path.exists(exe) if exe else False
                is_enabled = approved_states.get(name.lower(), True)

                items.append({
                    "id": f"hklm:{name}",
                    "name": name,
                    "command": cmd_str,
                    "exe_path": exe,
                    "exists": exists,
                    "is_enabled": is_enabled,
                    "scope": "system_registry",
                    "source": "HKLM\\Run",
                    "can_modify": False,
                    "impact": _estimate_boot_impact(name, exe),
                })
    except Exception as e:
        logger.debug("Could not read HKLM Run: %s", e)

    # 3. User Startup Folder
    startup_dir = os.path.expandvars(r"%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup")
    if os.path.isdir(startup_dir):
        for entry in os.listdir(startup_dir):
            if entry.lower() in ("desktop.ini",):
                continue
            entry_path = os.path.join(startup_dir, entry)
            is_disabled = entry.lower().endswith(".disabled")
            clean_name = entry[:-9] if is_disabled else entry

            items.append({
                "id": f"folder:{entry}",
                "name": clean_name,
                "command": entry_path,
                "exe_path": entry_path,
                "exists": os.path.exists(entry_path),
                "is_enabled": not is_disabled,
                "scope": "startup_folder",
                "source": "Startup Folder",
                "can_modify": True,
                "impact": _estimate_boot_impact(clean_name, entry_path),
            })

    # Sort: User-modifiable first, then high impact first
    impact_order = {"high": 0, "medium": 1, "low": 2}
    items.sort(key=lambda x: (not x["can_modify"], impact_order.get(x["impact"], 1), x["name"].lower()))
    return items


def set_startup_program_state(item_id: str, enable: bool) -> Dict[str, Any]:
    """
    Toggle a startup program enabled or disabled.
    For registry items, writes to native Windows Task Manager StartupApproved hive.
    """
    import winreg

    if not item_id:
        return {"success": False, "error": "Item ID required"}

    scope, _, name = item_id.partition(":")
    if scope == "hklm":
        return {"success": False, "error": "System-wide startup entries require Administrator privileges to modify."}

    if scope == "hkcu":
        try:
            # Open or create StartupApproved\Run
            with winreg.CreateKey(winreg.HKEY_CURRENT_USER, STARTUP_APPROVED_RUN) as key:
                if enable:
                    # Enabled flag: 0x02 followed by zeros
                    val = bytes([2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
                else:
                    # Disabled flag: 0x03 followed by 8-byte timestamp
                    val = bytes([3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
                winreg.SetValueEx(key, name, 0, winreg.REG_BINARY, val)

            action_desc = "Enabled" if enable else "Disabled"
            logger.info("Startup item '%s' %s successfully.", name, action_desc)
            return {"success": True, "message": f"{action_desc} startup program '{name}'", "name": name, "is_enabled": enable}
        except Exception as e:
            logger.error("Failed to toggle startup program '%s': %s", name, e)
            return {"success": False, "error": str(e)}

    if scope == "folder":
        startup_dir = os.path.expandvars(r"%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup")
        current_path = os.path.join(startup_dir, name)
        if not os.path.exists(current_path):
            return {"success": False, "error": f"File '{name}' not found in Startup folder."}

        try:
            if enable and name.lower().endswith(".disabled"):
                new_name = name[:-9]
                new_path = os.path.join(startup_dir, new_name)
                os.rename(current_path, new_path)
            elif not enable and not name.lower().endswith(".disabled"):
                new_name = f"{name}.disabled"
                new_path = os.path.join(startup_dir, new_name)
                os.rename(current_path, new_path)
            return {"success": True, "message": f"Updated '{name}' in Startup folder", "is_enabled": enable}
        except Exception as e:
            return {"success": False, "error": str(e)}

    return {"success": False, "error": f"Unsupported startup scope: {scope}"}


def remove_startup_program(item_id: str) -> Dict[str, Any]:
    """Remove a startup program entry permanently from HKCU Run or Startup folder."""
    import winreg

    scope, _, name = item_id.partition(":")
    if scope != "hkcu" and scope != "folder":
        return {"success": False, "error": "Only user-level startup items can be removed."}

    if scope == "hkcu":
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, HKCU_RUN, 0, winreg.KEY_SET_VALUE) as key:
                winreg.DeleteValue(key, name)

            # Also clean from StartupApproved
            try:
                with winreg.OpenKey(winreg.HKEY_CURRENT_USER, STARTUP_APPROVED_RUN, 0, winreg.KEY_SET_VALUE) as app_key:
                    winreg.DeleteValue(app_key, name)
            except Exception:
                pass

            return {"success": True, "message": f"Removed '{name}' from startup"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    if scope == "folder":
        startup_dir = os.path.expandvars(r"%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup")
        file_path = os.path.join(startup_dir, name)
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
                return {"success": True, "message": f"Deleted '{name}' from Startup folder"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    return {"success": False, "error": "Failed to remove startup item"}
