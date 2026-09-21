"""
Launcher module for Entropy Workstation Orchestrator.

Provides fast, safe IDE and terminal launch capabilities across detected developer tools:
- VS Code (`code`)
- Cursor (`cursor`)
- JetBrains IDEs (`pycharm`, `idea`, `webstorm`, `rider`, `rustrover`)
- Windows Terminal (`wt`)
- File Explorer (`explorer`)
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
from typing import Any, Dict

logger = logging.getLogger(__name__)


def detect_installed_launchers() -> Dict[str, bool]:
    """
    Scans the system environment for available IDEs and terminal launchers.
    
    Returns dict mapping launcher ID to availability boolean.
    """
    local_app_data = os.environ.get("LOCALAPPDATA", "")
    program_files = os.environ.get("ProgramFiles", "C:\\Program Files")
    program_files_x86 = os.environ.get("ProgramFiles(x86)", "C:\\Program Files (x86)")

    launchers = {
        "explorer": True,  # Windows Explorer is always available
        "terminal": False,
        "code": False,
        "cursor": False,
        "pycharm": False,
        "intellij": False,
        "webstorm": False,
        "rider": False,
    }

    # Check Windows Terminal / PowerShell
    if shutil.which("wt") or shutil.which("powershell"):
        launchers["terminal"] = True

    # Check VS Code
    code_path_in_appdata = os.path.join(local_app_data, "Programs", "Microsoft VS Code", "Code.exe")
    if shutil.which("code") or shutil.which("code.cmd") or os.path.exists(code_path_in_appdata):
        launchers["code"] = True

    # Check Cursor
    cursor_path_in_appdata = os.path.join(local_app_data, "Programs", "cursor", "Cursor.exe")
    if shutil.which("cursor") or os.path.exists(cursor_path_in_appdata):
        launchers["cursor"] = True

    # Check JetBrains PyCharm
    if shutil.which("pycharm") or shutil.which("pycharm64"):
        launchers["pycharm"] = True

    # Check JetBrains IntelliJ
    if shutil.which("idea") or shutil.which("idea64"):
        launchers["intellij"] = True

    return launchers


def launch_workspace_in_editor(workspace_path: str, editor_id: str) -> Dict[str, Any]:
    """
    Launches a specified workspace path in an external code editor or terminal.
    
    Parameters:
    - workspace_path: Absolute directory path to open.
    - editor_id: One of 'code' | 'cursor' | 'terminal' | 'explorer' | 'pycharm' | 'intellij'
    
    Returns result dict with success state and message.
    """
    if not workspace_path or not os.path.exists(workspace_path):
        return {"success": False, "error": f"Workspace path '{workspace_path}' does not exist."}

    abs_path = os.path.abspath(workspace_path)
    if not os.path.isdir(abs_path):
        abs_path = os.path.dirname(abs_path)

    local_app_data = os.environ.get("LOCALAPPDATA", "")
    editor_id = (editor_id or "").lower().strip()

    try:
        if editor_id == "explorer":
            os.startfile(abs_path)
            return {"success": True, "message": f"Opened '{abs_path}' in Windows Explorer."}

        elif editor_id == "terminal":
            if shutil.which("wt"):
                subprocess.Popen(["wt", "-d", abs_path], creationflags=subprocess.CREATE_NEW_CONSOLE)
            else:
                subprocess.Popen(["powershell", "-NoExit", "-Command", f"Set-Location '{abs_path}'"], creationflags=subprocess.CREATE_NEW_CONSOLE)
            return {"success": True, "message": f"Opened '{abs_path}' in Terminal."}

        elif editor_id == "code":
            code_cmd = shutil.which("code") or shutil.which("code.cmd")
            if not code_cmd:
                code_exe = os.path.join(local_app_data, "Programs", "Microsoft VS Code", "Code.exe")
                if os.path.exists(code_exe):
                    code_cmd = code_exe

            if code_cmd:
                subprocess.Popen([code_cmd, abs_path], shell=True if code_cmd.endswith(".cmd") else False)
                return {"success": True, "message": f"Opened '{abs_path}' in VS Code."}
            else:
                return {"success": False, "error": "VS Code executable ('code') was not found in PATH or standard installation paths."}

        elif editor_id == "cursor":
            cursor_cmd = shutil.which("cursor") or shutil.which("cursor.cmd")
            if not cursor_cmd:
                cursor_exe = os.path.join(local_app_data, "Programs", "cursor", "Cursor.exe")
                if os.path.exists(cursor_exe):
                    cursor_cmd = cursor_exe

            if cursor_cmd:
                subprocess.Popen([cursor_cmd, abs_path], shell=True if cursor_cmd.endswith(".cmd") else False)
                return {"success": True, "message": f"Opened '{abs_path}' in Cursor."}
            else:
                return {"success": False, "error": "Cursor executable ('cursor') was not found in PATH or standard installation paths."}

        elif editor_id in ("pycharm", "intellij", "webstorm", "rider"):
            cmd = shutil.which(editor_id) or shutil.which(f"{editor_id}64")
            if cmd:
                subprocess.Popen([cmd, abs_path])
                return {"success": True, "message": f"Opened '{abs_path}' in {editor_id.capitalize()}."}
            else:
                return {"success": False, "error": f"{editor_id.capitalize()} executable was not found in PATH."}

        else:
            return {"success": False, "error": f"Unsupported editor launcher ID '{editor_id}'."}

    except Exception as e:
        logger.error("Failed to launch %s for %s: %s", editor_id, abs_path, e)
        return {"success": False, "error": f"Failed to launch {editor_id}: {e}"}
