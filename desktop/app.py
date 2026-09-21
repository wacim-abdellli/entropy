"""
Entropy Desktop — Native Windows Desktop Host (WebView2).

Serves the React 19 visual interface in a native Windows WebView2 container
and connects it directly to the Entropy intelligence engine.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, List, Optional

# Add project root to sys.path (support both source tree and PyInstaller frozen bundle)
if getattr(sys, "frozen", False):
    bundle_dir = Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent)).resolve()
    PROJECT_ROOT = bundle_dir
    if str(bundle_dir) not in sys.path:
        sys.path.insert(0, str(bundle_dir))
else:
    PROJECT_ROOT = Path(__file__).resolve().parent.parent
    if str(PROJECT_ROOT) not in sys.path:
        sys.path.insert(0, str(PROJECT_ROOT))

import concurrent.futures

from core.graph import EnvironmentGraph
from report.contract import serialize_environment_overview, serialize_workspace_inspection
from scan import run_entropy_inspect, run_entropy_scan


class EntropyDesktopApi:
    """Native Python API exposed to the JavaScript frontend via WebView2."""

    def __init__(self) -> None:
        self._executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
        # Pre-warm environment scan in background while native WebView2 window boots
        self._prewarm_future = self._executor.submit(self._do_scan_environment)

    def inspect_workspace(self, path: str) -> dict[str, Any]:
        """Inspect a single workspace and return the structured JSON payload."""
        abs_path = os.path.abspath(path)
        if not os.path.exists(abs_path):
            return {
                "error": f"Target path '{abs_path}' does not exist on disk.",
                "workspace": None,
            }
        if not os.path.isdir(abs_path):
            return {
                "error": f"Target path '{abs_path}' is a file, not a directory.",
                "workspace": None,
            }

        try:
            target_project, graph, findings = run_entropy_inspect(abs_path)
            if target_project:
                return serialize_workspace_inspection(target_project, graph, findings)
            else:
                return {
                    "error": f"Could not inspect workspace at '{abs_path}'.",
                    "workspace": None,
                }
        except Exception as e:
            return {"error": str(e), "workspace": None}

    def _do_scan_environment(self, roots: Optional[List[str]] = None, depth: int = 2) -> dict[str, Any]:
        """Core environment scan implementation across candidate developer roots."""
        if not roots:
            user_home = os.path.expanduser("~")
            candidate_roots = [
                os.path.join(user_home, "Desktop"),
                os.path.join(user_home, "Documents"),
                os.path.join(user_home, "source", "repos"),
                os.path.join(user_home, "projects"),
                os.path.join(user_home, "dev"),
            ]
            roots = [os.path.abspath(r) for r in candidate_roots if os.path.isdir(r)]
            if not roots:
                roots = [os.path.abspath(user_home)]
        else:
            roots = [os.path.abspath(r) for r in roots]

        try:
            graph, findings = run_entropy_scan(roots, max_depth=depth)
            return serialize_environment_overview(graph, findings)
        except Exception as e:
            return {"error": str(e), "summary": None, "workspaces": []}

    def scan_environment(self, roots: Optional[List[str]] = None, depth: int = 2) -> dict[str, Any]:
        """Scan environment across specified root directories (uses prewarmed cache if ready)."""
        if not roots and self._prewarm_future:
            try:
                res = self._prewarm_future.result(timeout=45)
                self._prewarm_future = None
                return res
            except Exception:
                self._prewarm_future = None

        return self._do_scan_environment(roots=roots, depth=depth)

    def open_in_explorer(self, path: str) -> bool:
        """Open the specified folder in native Windows Explorer."""
        abs_path = os.path.abspath(path)
        try:
            if os.path.isdir(abs_path):
                subprocess.Popen(["explorer.exe", abs_path])
            elif os.path.exists(abs_path):
                subprocess.Popen(["explorer.exe", f"/select,{abs_path}"])
            else:
                return False
            return True
        except Exception:
            return False

    def open_in_terminal(self, path: str) -> bool:
        """Open the specified folder in Windows Terminal or PowerShell."""
        abs_path = os.path.abspath(path)
        try:
            # Try Windows Terminal first (wt.exe)
            try:
                subprocess.Popen(["wt.exe", "-d", abs_path])
                return True
            except FileNotFoundError:
                pass

            # Fall back to PowerShell
            subprocess.Popen([
                "powershell.exe",
                "-NoExit",
                "-Command",
                f"Set-Location -LiteralPath '{abs_path}'"
            ])
            return True
        except Exception:
            return False

    def pick_folder(self) -> Optional[str]:
        """Open native Windows folder picker dialog."""
        try:
            ps_script = (
                "Add-Type -AssemblyName System.Windows.Forms; "
                "$f = New-Object System.Windows.Forms.FolderBrowserDialog; "
                "$f.Description = 'Select Workspace Folder to Inspect with Entropy'; "
                "if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $f.SelectedPath }"
            )
            creationflags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
            result = subprocess.run(
                ["powershell.exe", "-NoProfile", "-Command", ps_script],
                capture_output=True,
                text=True,
                timeout=60,
                creationflags=creationflags,
            )
            selected = result.stdout.strip()
            return selected if selected and os.path.isdir(selected) else None
        except Exception:
            return None

    def terminate_process(self, pid: int, force: bool = True) -> dict[str, Any]:
        """Safely terminate a developer process by PID."""
        from core.process_control import terminate_process
        return terminate_process(pid, force=force)

    def free_port(self, port: int, force: bool = True) -> dict[str, Any]:
        """Free a listening TCP port by terminating its owner process."""
        from core.process_control import free_port
        return free_port(port, force=force)

    def clean_artifact(self, path: str) -> dict[str, Any]:
        """Safely delete a single whitelisted build artifact directory."""
        from core.disk_cleaner import clean_artifact_directory
        return clean_artifact_directory(path)

    def clean_artifacts(self, paths: list[str]) -> dict[str, Any]:
        """Safely delete multiple whitelisted build artifact directories."""
        from core.disk_cleaner import clean_multiple_artifacts
        return clean_multiple_artifacts(paths)

    def detect_launchers(self) -> dict[str, bool]:
        """Detect installed IDEs and terminal launchers on Windows."""
        from core.launcher import detect_installed_launchers
        return detect_installed_launchers()

    def launch_ide(self, workspace_path: str, editor_id: str) -> dict[str, Any]:
        """Launch a workspace path in an external code editor or terminal."""
        from core.launcher import launch_workspace_in_editor
        return launch_workspace_in_editor(workspace_path, editor_id)

    def stash_workspace(self, workspace_path: str, message: Optional[str] = None) -> dict[str, Any]:
        """Safely stash uncommitted changes in a workspace."""
        from core.git_control import safe_stash_workspace
        return safe_stash_workspace(workspace_path, message)



def _run_desktop() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Entropy Desktop Application")
    parser.add_argument("--dev", action="store_true", help="Connect to Vite dev server at localhost:5173")
    parser.add_argument("--url", type=str, default=None, help="Custom frontend URL")
    parser.add_argument("--inspect", type=str, default=None, help=argparse.SUPPRESS)
    parser.add_argument("--scan", action="store_true", help=argparse.SUPPRESS)
    args, _ = parser.parse_known_args()

    api = EntropyDesktopApi()

    if args.inspect:
        if sys.platform == "win32":
            try:
                import ctypes
                ctypes.windll.kernel32.AttachConsole(-1)
                sys.stdout = open("CONOUT$", "w", encoding="utf-8")
                sys.stderr = open("CONOUT$", "w", encoding="utf-8")
            except Exception:
                pass
        res = api.inspect_workspace(args.inspect)
        print(json.dumps(res, indent=2))
        sys.exit(0 if not res.get("error") else 1)

    if args.scan:
        if sys.platform == "win32":
            try:
                import ctypes
                ctypes.windll.kernel32.AttachConsole(-1)
                sys.stdout = open("CONOUT$", "w", encoding="utf-8")
                sys.stderr = open("CONOUT$", "w", encoding="utf-8")
            except Exception:
                pass
        res = api.scan_environment()
        print(json.dumps(res, indent=2))
        sys.exit(0 if not res.get("error") else 1)

    import webview

    if getattr(sys, "frozen", False):
        bundle_dir = Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent)).resolve()
        candidate_paths = [
            bundle_dir / "desktop" / "dist" / "index.html",
            bundle_dir / "dist" / "index.html",
            Path(sys.executable).resolve().parent / "desktop" / "dist" / "index.html",
            Path(sys.executable).resolve().parent / "dist" / "index.html",
        ]
        dist_index = next((p for p in candidate_paths if p.exists()), candidate_paths[0])
    else:
        dist_index = Path(__file__).resolve().parent / "dist" / "index.html"

    if args.url:
        target_url = args.url
    elif args.dev:
        target_url = "http://localhost:5173"
    elif dist_index.exists():
        target_url = str(dist_index.resolve())
    else:
        target_url = "http://localhost:5173"

    window = webview.create_window(
        title="Entropy",
        url=target_url,
        js_api=api,
        width=1280,
        height=850,
        min_size=(960, 600),
        background_color="#090b10",
        text_select=True,
    )

    webview.start(debug=args.dev, gui="edgechromium")


def main() -> None:
    # Ensure stdio streams are valid under --noconsole / windowed execution
    if sys.stdout is None:
        try:
            sys.stdout = open(os.devnull, "w")
        except Exception:
            pass
    if sys.stderr is None:
        try:
            sys.stderr = open(os.devnull, "w")
        except Exception:
            pass

    try:
        _run_desktop()
    except Exception as e:
        import traceback
        err_msg = traceback.format_exc()
        try:
            import ctypes
            ctypes.windll.user32.MessageBoxW(
                0,
                f"Entropy Desktop encountered a startup error:\n\n{err_msg}",
                "Entropy Startup Error",
                0x10,
            )
        except Exception:
            pass
        sys.exit(1)


if __name__ == "__main__":
    main()
