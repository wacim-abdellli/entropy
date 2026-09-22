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


def _find_vscode_executable() -> str | None:
    """Finds the actual Code.exe GUI executable directly."""
    local_app_data = os.environ.get("LOCALAPPDATA", "")
    program_files = os.environ.get("ProgramFiles", "C:\\Program Files")
    program_files_x86 = os.environ.get("ProgramFiles(x86)", "C:\\Program Files (x86)")

    candidates = [
        os.path.join(local_app_data, "Programs", "Microsoft VS Code", "Code.exe"),
        os.path.join(program_files, "Microsoft VS Code", "Code.exe"),
        os.path.join(program_files_x86, "Microsoft VS Code", "Code.exe"),
    ]
    for c in candidates:
        if os.path.isfile(c):
            return c

    code_which = shutil.which("code") or shutil.which("code.cmd")
    if code_which:
        parent_dir = os.path.dirname(code_which)
        cand = os.path.abspath(os.path.join(parent_dir, "..", "Code.exe"))
        if os.path.isfile(cand):
            return cand
        return code_which
    return None


def _find_cursor_executable() -> str | None:
    """Finds the actual Cursor.exe GUI executable directly."""
    local_app_data = os.environ.get("LOCALAPPDATA", "")
    program_files = os.environ.get("ProgramFiles", "C:\\Program Files")
    program_files_x86 = os.environ.get("ProgramFiles(x86)", "C:\\Program Files (x86)")

    candidates = [
        os.path.join(local_app_data, "Programs", "cursor", "Cursor.exe"),
        os.path.join(program_files, "cursor", "Cursor.exe"),
        os.path.join(program_files_x86, "cursor", "Cursor.exe"),
    ]
    for c in candidates:
        if os.path.isfile(c):
            return c

    cursor_which = shutil.which("cursor") or shutil.which("cursor.cmd")
    if cursor_which:
        parent_dir = os.path.dirname(cursor_which)
        for up in ["..", os.path.join("..", ".."), os.path.join("..", "..", ".."), os.path.join("..", "..", "..", "..")]:
            cand = os.path.abspath(os.path.join(parent_dir, up, "Cursor.exe"))
            if os.path.isfile(cand):
                return cand
        return cursor_which
    return None


def detect_installed_launchers() -> Dict[str, bool]:
    """
    Scans the system environment for available IDEs and terminal launchers.
    
    Returns dict mapping launcher ID to availability boolean.
    """
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
    if _find_vscode_executable():
        launchers["code"] = True

    # Check Cursor
    if _find_cursor_executable():
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
            code_bin = _find_vscode_executable()
            if code_bin:
                is_batch = code_bin.lower().endswith((".cmd", ".bat"))
                creationflags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
                subprocess.Popen(
                    [code_bin, abs_path],
                    shell=is_batch,
                    creationflags=creationflags,
                )
                return {"success": True, "message": f"Opened '{abs_path}' in VS Code."}
            else:
                return {"success": False, "error": "VS Code executable ('Code.exe' / 'code') was not found in PATH or standard installation paths."}

        elif editor_id == "cursor":
            cursor_bin = _find_cursor_executable()
            if cursor_bin:
                is_batch = cursor_bin.lower().endswith((".cmd", ".bat"))
                creationflags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
                subprocess.Popen(
                    [cursor_bin, abs_path],
                    shell=is_batch,
                    creationflags=creationflags,
                )
                return {"success": True, "message": f"Opened '{abs_path}' in Cursor."}
            else:
                return {"success": False, "error": "Cursor executable ('Cursor.exe' / 'cursor') was not found in PATH or standard installation paths."}

        elif editor_id in ("pycharm", "intellij", "webstorm", "rider"):
            cmd = shutil.which(editor_id) or shutil.which(f"{editor_id}64")
            if cmd:
                creationflags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
                subprocess.Popen([cmd, abs_path], creationflags=creationflags)
                return {"success": True, "message": f"Opened '{abs_path}' in {editor_id.capitalize()}."}
            else:
                return {"success": False, "error": f"{editor_id.capitalize()} executable was not found in PATH."}

        else:
            return {"success": False, "error": f"Unsupported editor launcher ID '{editor_id}'."}

    except Exception as e:
        logger.error("Failed to launch %s for %s: %s", editor_id, abs_path, e)
        return {"success": False, "error": f"Failed to launch {editor_id}: {e}"}
