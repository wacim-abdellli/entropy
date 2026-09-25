"""
Launcher module for Entropy Workstation Orchestrator.

Provides fast, safe, and silent IDE and terminal launch capabilities across detected developer tools:
- VS Code (`code`, `vscode`)
- Cursor (`cursor`)
- Windows Terminal (`terminal`, `wt`)
- PowerShell (`powershell`)
- Command Prompt (`cmd`)
- File Explorer (`explorer`)
- JetBrains IDEs (`pycharm`, `idea`, `intellij`, `webstorm`, `rider`, `rustrover`, `clion`, `goland`)
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
    user_profile = os.environ.get("USERPROFILE", "")

    candidates = [
        os.path.join(local_app_data, "Programs", "Microsoft VS Code", "Code.exe"),
        os.path.join(user_profile, "AppData", "Local", "Programs", "Microsoft VS Code", "Code.exe"),
        os.path.join(program_files, "Microsoft VS Code", "Code.exe"),
        os.path.join(program_files_x86, "Microsoft VS Code", "Code.exe"),
    ]
    for c in candidates:
        if c and os.path.isfile(c):
            return c

    code_which = shutil.which("code") or shutil.which("code.cmd")
    if code_which:
        parent_dir = os.path.dirname(code_which)
        for up in ["..", os.path.join("..", "..")]:
            cand = os.path.abspath(os.path.join(parent_dir, up, "Code.exe"))
            if os.path.isfile(cand):
                return cand
        return code_which
    return None


def _find_cursor_executable() -> str | None:
    """Finds the actual Cursor.exe GUI executable directly."""
    local_app_data = os.environ.get("LOCALAPPDATA", "")
    program_files = os.environ.get("ProgramFiles", "C:\\Program Files")
    program_files_x86 = os.environ.get("ProgramFiles(x86)", "C:\\Program Files (x86)")
    user_profile = os.environ.get("USERPROFILE", "")

    candidates = [
        os.path.join(local_app_data, "Programs", "cursor", "Cursor.exe"),
        os.path.join(user_profile, "AppData", "Local", "Programs", "cursor", "Cursor.exe"),
        os.path.join(local_app_data, "cursor", "Cursor.exe"),
        os.path.join(program_files, "cursor", "Cursor.exe"),
        os.path.join(program_files_x86, "cursor", "Cursor.exe"),
    ]
    for c in candidates:
        if c and os.path.isfile(c):
            return c

    cursor_which = shutil.which("cursor") or shutil.which("cursor.cmd")
    if cursor_which:
        parent_dir = os.path.dirname(cursor_which)
        for up in [
            "..",
            os.path.join("..", ".."),
            os.path.join("..", "..", ".."),
            os.path.join("..", "..", "..", ".."),
        ]:
            cand = os.path.abspath(os.path.join(parent_dir, up, "Cursor.exe"))
            if os.path.isfile(cand):
                return cand
        return cursor_which
    return None


def _find_windows_terminal_executable() -> str | None:
    """Finds the Windows Terminal (wt.exe) executable if installed."""
    wt_which = shutil.which("wt") or shutil.which("wt.exe")
    if wt_which:
        return wt_which

    local_app_data = os.environ.get("LOCALAPPDATA", "")
    if local_app_data:
        cand = os.path.join(local_app_data, "Microsoft", "WindowsApps", "wt.exe")
        if os.path.isfile(cand):
            return cand

    return None


def _launch_silent_gui(exe_or_bin: str, target_path: str) -> None:
    """
    Launches an external GUI application silently without flashing console/terminal windows.
    Prioritizes native ShellExecute (os.startfile) on Windows for instant, detached launch.
    """
    if os.name == "nt":
        is_batch = exe_or_bin.lower().endswith((".cmd", ".bat"))
        if not is_batch and hasattr(os, "startfile"):
            try:
                os.startfile(exe_or_bin, arguments=f'"{target_path}"')
                return
            except Exception as e:
                logger.warning("os.startfile failed for %s, falling back to Popen: %s", exe_or_bin, e)

        # Fallback using subprocess with SW_HIDE and detached process
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startupinfo.wShowWindow = 0  # SW_HIDE
        creationflags = subprocess.CREATE_NO_WINDOW
        if hasattr(subprocess, "DETACHED_PROCESS") and not is_batch:
            creationflags |= subprocess.DETACHED_PROCESS

        if is_batch:
            cmd = ["cmd.exe", "/c", exe_or_bin, target_path]
        else:
            cmd = [exe_or_bin, target_path]

        subprocess.Popen(
            cmd,
            creationflags=creationflags,
            startupinfo=startupinfo,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    else:
        subprocess.Popen([exe_or_bin, target_path])


def _launch_interactive_console(shell_type: str, target_path: str) -> str:
    """
    Launches an interactive, permanent Windows console or terminal in target_path.
    Guarantees that stdin/stdout/stderr are valid interactive handles.
    """
    abs_path = os.path.abspath(target_path)

    if shell_type == "cmd":
        cmd_exe = shutil.which("cmd.exe") or r"C:\Windows\System32\cmd.exe"
        if os.name == "nt" and hasattr(os, "startfile"):
            try:
                os.startfile(cmd_exe, arguments=f'/K "cd /d "{abs_path}""', cwd=abs_path)
                return "Opened Command Prompt."
            except Exception as e:
                logger.warning("os.startfile failed for cmd.exe, trying start fallback: %s", e)

        if os.name == "nt":
            subprocess.Popen(f'start "" cmd.exe /K "cd /d "{abs_path}""', shell=True, cwd=abs_path)
        else:
            subprocess.Popen(["sh"], cwd=abs_path)
        return "Opened Command Prompt."

    elif shell_type == "powershell":
        ps_exe = shutil.which("powershell.exe") or r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"
        ps_args = f'-NoExit -Command "Set-Location -LiteralPath \'{abs_path}\'"'
        if os.name == "nt" and hasattr(os, "startfile"):
            try:
                os.startfile(ps_exe, arguments=ps_args, cwd=abs_path)
                return "Opened PowerShell."
            except Exception as e:
                logger.warning("os.startfile failed for powershell.exe, trying start fallback: %s", e)

        if os.name == "nt":
            subprocess.Popen(f'start "" powershell.exe {ps_args}', shell=True, cwd=abs_path)
        else:
            subprocess.Popen(["pwsh"], cwd=abs_path)
        return "Opened PowerShell."

    elif shell_type == "terminal":
        wt_bin = _find_windows_terminal_executable()
        if wt_bin and os.name == "nt":
            try:
                if hasattr(os, "startfile"):
                    os.startfile(wt_bin, arguments=f'-d "{abs_path}"', cwd=abs_path)
                else:
                    subprocess.Popen([wt_bin, "-d", abs_path], cwd=abs_path)
                return "Opened Windows Terminal."
            except Exception as e:
                logger.warning("Failed to launch wt.exe, falling back to PowerShell: %s", e)

        # Fall back gracefully to PowerShell if Windows Terminal is not installed
        return _launch_interactive_console("powershell", abs_path)

    elif shell_type == "explorer":
        if os.name == "nt" and hasattr(os, "startfile"):
            try:
                os.startfile(abs_path)
                return "Opened File Explorer."
            except Exception as e:
                logger.warning("os.startfile failed for explorer, falling back to explorer.exe: %s", e)

        if os.name == "nt":
            subprocess.Popen(["explorer.exe", abs_path])
        else:
            subprocess.Popen(["xdg-open", abs_path])
        return "Opened File Explorer."

    raise ValueError(f"Unknown shell type: {shell_type}")


def detect_installed_launchers() -> Dict[str, bool]:
    """
    Scans the system environment for available IDEs and terminal launchers.
    Returns dict mapping launcher ID to availability boolean.
    """
    launchers = {
        "explorer": True,  # Windows Explorer is always available
        "terminal": False,
        "powershell": False,
        "cmd": True,  # Command Prompt is always available on Windows
        "code": False,
        "cursor": False,
        "pycharm": False,
        "intellij": False,
        "webstorm": False,
        "rider": False,
    }

    if _find_windows_terminal_executable() or shutil.which("powershell"):
        launchers["terminal"] = True

    if shutil.which("powershell") or os.path.exists(r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"):
        launchers["powershell"] = True

    if shutil.which("cmd") or os.path.exists(r"C:\Windows\System32\cmd.exe"):
        launchers["cmd"] = True

    if _find_vscode_executable():
        launchers["code"] = True

    if _find_cursor_executable():
        launchers["cursor"] = True

    if shutil.which("pycharm") or shutil.which("pycharm64"):
        launchers["pycharm"] = True

    if shutil.which("idea") or shutil.which("idea64"):
        launchers["intellij"] = True

    return launchers


def launch_workspace_in_editor(workspace_path: str, editor_id: str) -> Dict[str, Any]:
    """
    Launches a specified workspace path in an external code editor or terminal.

    Parameters:
    - workspace_path: Absolute directory path to open.
    - editor_id: One of 'code' | 'vscode' | 'cursor' | 'terminal' | 'powershell' | 'cmd' | 'explorer' | 'pycharm' | 'intellij'

    Returns result dict with success state and message.
    """
    if not workspace_path or not os.path.exists(workspace_path):
        return {"success": False, "error": f"Workspace path '{workspace_path}' does not exist."}

    abs_path = os.path.abspath(workspace_path)
    if not os.path.isdir(abs_path):
        abs_path = os.path.dirname(abs_path)

    editor_id = (editor_id or "").lower().strip()

    try:
        if editor_id in ("explorer", "folder"):
            msg = _launch_interactive_console("explorer", abs_path)
            return {"success": True, "message": msg}

        elif editor_id in ("terminal", "wt"):
            msg = _launch_interactive_console("terminal", abs_path)
            return {"success": True, "message": msg}

        elif editor_id in ("powershell", "ps", "pwsh"):
            msg = _launch_interactive_console("powershell", abs_path)
            return {"success": True, "message": msg}

        elif editor_id in ("cmd", "command"):
            msg = _launch_interactive_console("cmd", abs_path)
            return {"success": True, "message": msg}

        elif editor_id in ("code", "vscode"):
            code_bin = _find_vscode_executable()
            if code_bin:
                _launch_silent_gui(code_bin, abs_path)
                return {"success": True, "message": f"Opened '{abs_path}' in VS Code."}
            else:
                return {
                    "success": False,
                    "error": "VS Code executable ('Code.exe' / 'code') was not found in PATH or standard installation paths.",
                }

        elif editor_id in ("cursor", "cur"):
            cursor_bin = _find_cursor_executable()
            if cursor_bin:
                _launch_silent_gui(cursor_bin, abs_path)
                return {"success": True, "message": f"Opened '{abs_path}' in Cursor."}
            else:
                return {
                    "success": False,
                    "error": "Cursor executable ('Cursor.exe' / 'cursor') was not found in PATH or standard installation paths.",
                }

        elif editor_id in ("pycharm", "intellij", "idea", "webstorm", "rider", "rustrover", "clion", "goland"):
            cmd = shutil.which(editor_id) or shutil.which(f"{editor_id}64")
            if cmd:
                _launch_silent_gui(cmd, abs_path)
                return {"success": True, "message": f"Opened '{abs_path}' in {editor_id.capitalize()}."}
            else:
                return {"success": False, "error": f"{editor_id.capitalize()} executable was not found in PATH."}

        else:
            return {"success": False, "error": f"Unsupported editor launcher ID '{editor_id}'."}

    except Exception as e:
        logger.error("Failed to launch %s for %s: %s", editor_id, abs_path, e)
        return {"success": False, "error": f"Failed to launch {editor_id}: {e}"}
