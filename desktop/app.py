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

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from core.graph import EnvironmentGraph
from report.contract import serialize_environment_overview, serialize_workspace_inspection
from scan import run_entropy_inspect, run_entropy_scan


class EntropyDesktopApi:
    """Native Python API exposed to the JavaScript frontend via WebView2."""

    def inspect_workspace(self, path: str) -> dict[str, Any]:
        """Inspect a single workspace and return the structured JSON payload."""
        abs_path = os.path.abspath(path)
        try:
            target_project, graph, findings = run_entropy_inspect(abs_path)
            if target_project:
                return serialize_workspace_inspection(target_project, graph, findings)
            else:
                return {
                    "error": f"Path '{abs_path}' is not recognized as a project.",
                    "workspace": None,
                }
        except Exception as e:
            return {"error": str(e), "workspace": None}

    def scan_environment(self, roots: Optional[List[str]] = None, depth: int = 4) -> dict[str, Any]:
        """Scan environment across specified root directories."""
        if not roots:
            roots = [os.path.abspath(os.path.expanduser("~"))]
        else:
            roots = [os.path.abspath(r) for r in roots]

        try:
            graph, findings = run_entropy_scan(roots, max_depth=depth)
            return serialize_environment_overview(graph, findings)
        except Exception as e:
            return {"error": str(e), "summary": None, "workspaces": []}

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
            result = subprocess.run(
                ["powershell.exe", "-NoProfile", "-Command", ps_script],
                capture_output=True,
                text=True,
                timeout=60,
            )
            selected = result.stdout.strip()
            return selected if selected and os.path.isdir(selected) else None
        except Exception:
            return None


def main() -> None:
    import argparse
    import webview

    parser = argparse.ArgumentParser(description="Entropy Desktop Application")
    parser.add_argument("--dev", action="store_true", help="Connect to Vite dev server at localhost:5173")
    parser.add_argument("--url", type=str, default=None, help="Custom frontend URL")
    args = parser.parse_args()

    api = EntropyDesktopApi()

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


if __name__ == "__main__":
    main()
