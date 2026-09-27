"""
WSL 2 and Docker Desktop VHDX Virtual Disk Compactor.

Discovers expandable ext4.vhdx virtual disk files used by WSL 2 and Docker Desktop,
and compacts them to recover space freed by deleted files and containers.
"""

from __future__ import annotations

import logging
import os
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, List

logger = logging.getLogger(__name__)


def _format_size(size_bytes: int) -> str:
    """Format byte count to human-readable string."""
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    elif size_bytes < 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.1f} MB"
    else:
        return f"{size_bytes / (1024 * 1024 * 1024):.2f} GB"


def find_virtual_disks() -> List[Dict[str, Any]]:
    """
    Search for all Docker Desktop and WSL 2 ext4.vhdx virtual hard disks.
    Returns metadata list containing path, name, category, and size_bytes.
    """
    home = Path.home()
    local_appdata = Path(os.environ.get("LOCALAPPDATA", str(home / "AppData" / "Local")))

    disks: List[Dict[str, Any]] = []
    seen_paths = set()

    # 1. Docker Desktop Virtual Disks
    docker_candidates = [
        (local_appdata / "Docker" / "wsl" / "data" / "ext4.vhdx", "Docker Desktop Data VHDX", "docker"),
        (local_appdata / "Docker" / "wsl" / "distro" / "ext4.vhdx", "Docker Desktop Distro VHDX", "docker"),
    ]

    for p, name, cat in docker_candidates:
        abs_p = os.path.abspath(str(p))
        if os.path.isfile(abs_p) and abs_p not in seen_paths:
            seen_paths.add(abs_p)
            try:
                size = os.path.getsize(abs_p)
                disks.append({
                    "id": f"vhdx_{len(disks)}",
                    "path": abs_p,
                    "name": name,
                    "category": cat,
                    "size_bytes": size,
                    "size_formatted": _format_size(size),
                    "description": "Docker container storage layer and volumes disk",
                })
            except OSError:
                pass

    # 2. WSL 2 Distros in Packages
    packages_dir = local_appdata / "Packages"
    if packages_dir.is_dir():
        try:
            for pkg in packages_dir.iterdir():
                if not pkg.is_dir():
                    continue
                pkg_name = pkg.name.lower()
                # Known Linux distro package keywords
                is_distro = any(k in pkg_name for k in ("canonical", "ubuntu", "debian", "kali", "suse", "wsl", "alma", "rocky"))
                if is_distro:
                    vhdx = pkg / "LocalState" / "ext4.vhdx"
                    if vhdx.is_file():
                        abs_p = os.path.abspath(str(vhdx))
                        if abs_p not in seen_paths:
                            seen_paths.add(abs_p)
                            try:
                                size = os.path.getsize(abs_p)
                                friendly_name = pkg.name.split("_")[0]
                                disks.append({
                                    "id": f"vhdx_{len(disks)}",
                                    "path": abs_p,
                                    "name": f"WSL 2 ({friendly_name})",
                                    "category": "wsl",
                                    "size_bytes": size,
                                    "size_formatted": _format_size(size),
                                    "description": f"WSL 2 Linux virtual hard disk for {friendly_name}",
                                })
                            except OSError:
                                pass
        except OSError:
            pass

    return disks


def compact_virtual_disk(vhdx_path: str) -> Dict[str, Any]:
    """
    Compact a specific ext4.vhdx virtual disk using diskpart with elevation.
    Shuts down WSL first to guarantee clean unmount.
    """
    abs_p = os.path.abspath(vhdx_path)
    if not os.path.isfile(abs_p):
        return {
            "success": False,
            "path": abs_p,
            "error": f"VHDX file '{abs_p}' does not exist on disk.",
        }

    try:
        size_before = os.path.getsize(abs_p)
    except OSError as e:
        return {"success": False, "path": abs_p, "error": f"Cannot read disk size: {e}"}

    # Step 1: Shut down WSL cleanly
    try:
        creationflags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        subprocess.run(["wsl", "--shutdown"], capture_output=True, timeout=15, creationflags=creationflags)
        time.sleep(2.0)  # Brief wait for file handles to release
    except Exception as e:
        logger.debug("WSL shutdown notice: %s", e)

    # Step 2: Create diskpart script
    script_content = f"""select vdisk file="{abs_p}"
attach vdisk readonly
compact vdisk
detach vdisk
exit
"""
    tmp_file = tempfile.NamedTemporaryFile(mode="w", delete=False, suffix=".txt")
    try:
        tmp_file.write(script_content)
        tmp_file.close()
        script_path = os.path.abspath(tmp_file.name)

        # Step 3: Run diskpart via PowerShell Start-Process -Verb RunAs (elevated)
        ps_cmd = f"Start-Process diskpart.exe -ArgumentList '/s \"{script_path}\"' -Verb RunAs -Wait -WindowStyle Hidden"
        res = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps_cmd],
            capture_output=True,
            text=True,
            timeout=180,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )

        time.sleep(1.0)
        size_after = os.path.getsize(abs_p)
        freed = max(0, size_before - size_after)

        return {
            "success": True,
            "path": abs_p,
            "size_before": size_before,
            "size_after": size_after,
            "freed_bytes": freed,
            "freed_formatted": _format_size(freed),
            "message": f"Successfully compacted virtual disk. Freed {_format_size(freed)}.",
        }
    except Exception as e:
        logger.error(f"Error compacting VHDX {abs_p}: {e}")
        return {"success": False, "path": abs_p, "error": str(e)}
    finally:
        if os.path.exists(tmp_file.name):
            try:
                os.remove(tmp_file.name)
            except OSError:
                pass
