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
import logging

logger = logging.getLogger("entropy.desktop")

from core.graph import EnvironmentGraph
from report.contract import serialize_environment_overview, serialize_workspace_inspection
from scan import run_entropy_inspect, run_entropy_scan


class EntropyDesktopApi:
    """Native Python API exposed to the JavaScript frontend via WebView2."""

    def __init__(self) -> None:
        self._executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
        # Pre-warm environment scan in background while native WebView2 window boots
        self._prewarm_future = self._executor.submit(self._do_scan_environment)
        self._window: Optional[Any] = None

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
        if roots is not None and len(roots) == 0:
            # User explicitly configured 0 directories to scan
            return serialize_environment_overview(EnvironmentGraph(), [])

        if roots is None:
            # First boot / unconfigured: auto-detect standard dev roots
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
            roots = [os.path.abspath(r) for r in roots if os.path.isdir(r)]
            if not roots:
                return serialize_environment_overview(EnvironmentGraph(), [])

        try:
            graph, findings = run_entropy_scan(roots, max_depth=depth)
            return serialize_environment_overview(graph, findings)
        except Exception as e:
            return {"error": str(e), "summary": None, "workspaces": []}

    def scan_environment(self, roots: Optional[List[str]] = None, depth: int = 2) -> dict[str, Any]:
        """Scan environment across specified root directories (uses prewarmed cache only if unconfigured)."""
        if roots is None and self._prewarm_future:
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
        if not os.path.isdir(abs_path):
            abs_path = os.path.dirname(abs_path)
        if not os.path.exists(abs_path):
            return False

        flags = subprocess.CREATE_NEW_CONSOLE if os.name == "nt" else 0
        try:
            # Try Windows Terminal first (wt.exe)
            if shutil.which("wt"):
                subprocess.Popen(["wt.exe", "-d", abs_path], cwd=abs_path, creationflags=flags)
                return True

            # Fall back to PowerShell
            ps_bin = shutil.which("powershell") or "powershell.exe"
            subprocess.Popen([ps_bin, "-NoExit"], cwd=abs_path, creationflags=flags)
            return True
        except Exception as e:
            logger.error(f"Failed to open in Terminal: {e}")
            return False

    def open_in_powershell(self, path: str) -> bool:
        """Open the specified folder in native Windows PowerShell."""
        abs_path = os.path.abspath(path)
        if not os.path.isdir(abs_path):
            abs_path = os.path.dirname(abs_path)
        if not os.path.exists(abs_path):
            return False

        flags = subprocess.CREATE_NEW_CONSOLE if os.name == "nt" else 0
        try:
            ps_bin = shutil.which("powershell") or "powershell.exe"
            subprocess.Popen([ps_bin, "-NoExit"], cwd=abs_path, creationflags=flags)
            return True
        except Exception as e:
            logger.error(f"Failed to open in PowerShell: {e}")
            return False

    def open_in_cmd(self, path: str) -> bool:
        """Open the specified folder in native Windows Command Prompt."""
        abs_path = os.path.abspath(path)
        if not os.path.isdir(abs_path):
            abs_path = os.path.dirname(abs_path)
        if not os.path.exists(abs_path):
            return False

        flags = subprocess.CREATE_NEW_CONSOLE if os.name == "nt" else 0
        try:
            cmd_bin = shutil.which("cmd") or "cmd.exe"
            subprocess.Popen([cmd_bin], cwd=abs_path, creationflags=flags)
            return True
        except Exception as e:
            logger.error(f"Failed to open in CMD: {e}")
            return False

    def open_url(self, url: str) -> bool:
        """Open a URL (e.g. http://localhost:3000) in the user's default browser."""
        import webbrowser
        try:
            clean_url = (url or "").strip()
            if not clean_url:
                return False
            if not (clean_url.startswith("http://") or clean_url.startswith("https://")):
                clean_url = f"http://{clean_url}"
            webbrowser.open(clean_url)
            return True
        except Exception as e:
            logger.error(f"Failed to open URL {url}: {e}")
            return False

    def pick_folder(self) -> Optional[str]:
        """Open native Windows folder picker dialog."""
        # 1. Native in-process STA Thread with modern Windows FolderBrowserDialog
        try:
            import clr
            clr.AddReference("System.Windows.Forms")
            clr.AddReference("System.Threading")
            from System.Threading import Thread, ThreadStart, ApartmentState
            from System.Windows.Forms import FolderBrowserDialog, DialogResult, NativeWindow
            import System
            import ctypes

            selected_path = [None]

            def _show_native():
                try:
                    f = FolderBrowserDialog()
                    f.Description = "Select Workspace Folder to Inspect with Entropy"
                    f.AutoUpgradeEnabled = True
                    f.ShowNewFolderButton = True

                    hwnd = ctypes.windll.user32.GetForegroundWindow()
                    if hwnd:
                        nw = NativeWindow()
                        nw.AssignHandle(System.IntPtr(hwnd))
                        try:
                            res = f.ShowDialog(nw)
                        finally:
                            nw.ReleaseHandle()
                    else:
                        res = f.ShowDialog()

                    if res == DialogResult.OK and f.SelectedPath and os.path.isdir(f.SelectedPath):
                        selected_path[0] = os.path.abspath(f.SelectedPath)
                except Exception as ex:
                    logger.error(f"Native STA folder dialog error: {ex}")

            t = Thread(ThreadStart(_show_native))
            t.SetApartmentState(ApartmentState.STA)
            t.Start()
            t.Join(120000)
            if selected_path[0]:
                return selected_path[0]
        except Exception as e:
            logger.error(f"In-process STA folder picker error: {e}")

        # 2. Robust fallback to PowerShell with parent window handle
        try:
            ps_script = (
                "Add-Type -AssemblyName System.Windows.Forms; "
                "$f = New-Object System.Windows.Forms.FolderBrowserDialog; "
                "$f.AutoUpgradeEnabled = $true; "
                "$f.Description = 'Select Workspace Folder to Inspect with Entropy'; "
                "$hwnd = [System.Diagnostics.Process]::GetCurrentProcess().MainWindowHandle; "
                "if ($hwnd -ne 0) { "
                "  $nw = New-Object System.Windows.Forms.NativeWindow; "
                "  $nw.AssignHandle([System.IntPtr]$hwnd); "
                "  $res = $f.ShowDialog($nw); "
                "  $nw.ReleaseHandle(); "
                "} else { "
                "  $res = $f.ShowDialog(); "
                "} "
                "if ($res -eq [System.Windows.Forms.DialogResult]::OK) { $f.SelectedPath }"
            )
            creationflags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
            result = subprocess.run(
                ["powershell.exe", "-NoProfile", "-WindowStyle", "Hidden", "-Command", ps_script],
                capture_output=True,
                text=True,
                timeout=60,
                creationflags=creationflags,
            )
            selected = result.stdout.strip()
            return os.path.abspath(selected) if selected and os.path.isdir(selected) else None
        except Exception as e:
            logger.error(f"PowerShell folder picker error: {e}")
            return None

    def terminate_process(self, pid: int, force: bool = True) -> dict[str, Any]:
        """Safely terminate a developer process by PID."""
        from core.process_control import terminate_process
        return terminate_process(pid, force=force)

    def free_port(self, port: int, force: bool = True) -> dict[str, Any]:
        """Free a listening TCP port by terminating its owner process."""
        from core.process_control import free_port
        return free_port(port, force=force)

    def get_clean_slate_candidates(self, workspace_roots: Optional[list[str]] = None) -> list[dict[str, Any]]:
        """Get list of background developer processes eligible for Clean Slate RAM recovery."""
        from core.process_control import get_clean_slate_candidates
        return get_clean_slate_candidates(workspace_roots)

    def clean_slate_dev_processes(self, pids: Optional[list[int]] = None, force: bool = True) -> dict[str, Any]:
        """Safely terminate orphaned background developer servers to reclaim RAM and ports."""
        from core.process_control import clean_slate_dev_processes
        return clean_slate_dev_processes(pids=pids, force=force)

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

    def add_to_gitignore(self, workspace_path: str, pattern: str = ".env*") -> dict[str, Any]:
        """Safely append a secret file or pattern to the repository's .gitignore file."""
        from core.git_control import add_to_gitignore
        return add_to_gitignore(workspace_path, pattern)

    def prune_merged_branches(self, workspace_path: str, branches: Optional[list[str]] = None) -> dict[str, Any]:
        """Safely prune local branches already merged into HEAD."""
        from core.git_control import prune_merged_branches
        return prune_merged_branches(workspace_path, branches)

    def get_docker_system_df(self) -> dict[str, Any]:
        """Inspect Docker disk space usage breakdown (images, containers, build cache)."""
        from core.docker_control import get_docker_disk_usage
        return get_docker_disk_usage()

    def prune_docker_resources(self, target: str = "builder") -> dict[str, Any]:
        """Safely prune Docker resources ('builder', 'dangling_images', 'system')."""
        from core.docker_control import prune_docker_resources
        return prune_docker_resources(target=target)

    def get_purgeable_caches(self) -> list[dict[str, Any]]:
        """Get discovered global developer package caches (pip, npm, yarn, cargo, gradle, nuget)."""
        from core.cache_cleaner import get_known_cache_targets
        return get_known_cache_targets()

    def purge_caches(self, targets: list[str]) -> dict[str, Any]:
        """Safely purge selected global package manager caches."""
        from core.cache_cleaner import purge_multiple_caches
        return purge_multiple_caches(targets)



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

    # Pre-configure WinForms BrowserForm to enforce dark title bar from frame 0 (no white flash)
    if sys.platform == "win32":
        try:
            import webview.platforms.winforms as wf
            import ctypes

            icon_candidates = [
                PROJECT_ROOT / "desktop" / "src-tauri" / "icons" / "icon.ico",
                Path(__file__).resolve().parent / "src-tauri" / "icons" / "icon.ico",
            ]
            icon_path = next((p for p in icon_candidates if p.exists()), None)

            def _force_dark_title_bar(form_self):
                try:
                    hwnd = form_self.Handle.ToInt32()
                    val = ctypes.c_int(1)
                    # DWMWA_USE_IMMERSIVE_DARK_MODE (20 on Win 10 20H1+, 19 on older)
                    ctypes.windll.dwmapi.DwmSetWindowAttribute(hwnd, 20, ctypes.byref(val), ctypes.sizeof(val))
                    ctypes.windll.dwmapi.DwmSetWindowAttribute(hwnd, 19, ctypes.byref(val), ctypes.sizeof(val))
                    # DWMWA_CAPTION_COLOR = 35 -> #0b0f17 (0x00170F0B COLORREF)
                    color = ctypes.c_int(0x00170F0B)
                    ctypes.windll.dwmapi.DwmSetWindowAttribute(hwnd, 35, ctypes.byref(color), ctypes.sizeof(color))
                    # DWMWA_TEXT_COLOR = 36 -> white text (0x00FFFFFF COLORREF)
                    text_color = ctypes.c_int(0x00FFFFFF)
                    ctypes.windll.dwmapi.DwmSetWindowAttribute(hwnd, 36, ctypes.byref(text_color), ctypes.sizeof(text_color))

                    if icon_path:
                        try:
                            from System.Drawing import Icon
                            form_self.Icon = Icon(str(icon_path))
                        except Exception:
                            pass
                except Exception as e:
                    logger.debug(f"Error in instant dark title bar hook: {e}")

            wf.BrowserView.BrowserForm.update_title_bar_theme = _force_dark_title_bar
        except Exception as ex:
            logger.debug(f"Could not hook BrowserForm: {ex}")

    window = webview.create_window(
        title="Entropy",
        url=target_url,
        js_api=api,
        width=1400,
        height=900,
        min_size=(960, 600),
        maximized=True,
        background_color="#090b10",
        text_select=True,
    )
    api._window = window

    def _on_loaded():
        if sys.platform == "win32":
            try:
                import ctypes

                hwnd = ctypes.windll.user32.FindWindowW(None, "Entropy")
                if hwnd:
                    val = ctypes.c_int(1)
                    ctypes.windll.dwmapi.DwmSetWindowAttribute(hwnd, 20, ctypes.byref(val), ctypes.sizeof(val))
                    ctypes.windll.dwmapi.DwmSetWindowAttribute(hwnd, 19, ctypes.byref(val), ctypes.sizeof(val))
                    color = ctypes.c_int(0x00170F0B)
                    ctypes.windll.dwmapi.DwmSetWindowAttribute(hwnd, 35, ctypes.byref(color), ctypes.sizeof(color))

                    # Set custom window titlebar & taskbar icon
                    icon_candidates = [
                        PROJECT_ROOT / "desktop" / "src-tauri" / "icons" / "icon.ico",
                        Path(__file__).resolve().parent / "src-tauri" / "icons" / "icon.ico",
                    ]
                    icon_path = next((p for p in icon_candidates if p.exists()), None)
                    if icon_path:
                        IMAGE_ICON = 1
                        LR_LOADFROMFILE = 0x00000010
                        WM_SETICON = 0x0080
                        ICON_SMALL = 0
                        ICON_BIG = 1
                        hicon_small = ctypes.windll.user32.LoadImageW(
                            0, str(icon_path), IMAGE_ICON, 16, 16, LR_LOADFROMFILE
                        )
                        hicon_big = ctypes.windll.user32.LoadImageW(
                            0, str(icon_path), IMAGE_ICON, 32, 32, LR_LOADFROMFILE
                        )
                        if hicon_small:
                            ctypes.windll.user32.SendMessageW(hwnd, WM_SETICON, ICON_SMALL, hicon_small)
                        if hicon_big:
                            ctypes.windll.user32.SendMessageW(hwnd, WM_SETICON, ICON_BIG, hicon_big)
            except Exception:
                pass

    window.events.loaded += _on_loaded
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
