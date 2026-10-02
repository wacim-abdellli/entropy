"""
Entropy Partition Shrink & Secondary Drive Advisory Engine.

Provides 100% safe, non-destructive guidance and calculations for users wanting to
shrink C: to create a dedicated secondary drive (D:, E:, etc.) for developer offloading.

Key Safety Principles:
1. Always preserves a strict minimum safety buffer on C: (at least 25 GB free)
   so Windows updates, pagefile, and system operations never choke.
2. Directs users through native Windows Virtual Disk Service (VDS) and Disk Management
   (diskmgmt.msc), which physically refuses to touch unmovable system files or boot partitions.
3. Automatically computes exact MB values to input into Windows Disk Management.
4. Auto-detects the next free drive letter (D:, E:, F:, etc.).
"""

from __future__ import annotations

import logging
import os
import platform
import string
import subprocess
from typing import Any, Dict, List, Optional

import psutil

logger = logging.getLogger(__name__)

# Minimum free space that MUST remain on C: after any shrink (25 GB)
MIN_SYSTEM_BUFFER_BYTES = 25 * 1024 * 1024 * 1024

# Minimum sensible size for a new developer storage partition (15 GB)
MIN_NEW_PARTITION_BYTES = 15 * 1024 * 1024 * 1024


def _get_unused_drive_letters() -> List[str]:
    """Find all available drive letters not currently mounted on Windows."""
    used_letters = set()
    try:
        for part in psutil.disk_partitions(all=True):
            letter = part.mountpoint[:1].upper()
            if letter in string.ascii_uppercase:
                used_letters.add(letter)
    except Exception:
        used_letters = {"C"}

    # Exclude A and B (legacy floppy) and return remaining letters starting from D
    preferred = [c for c in string.ascii_uppercase if c not in ("A", "B", "C") and c not in used_letters]
    return preferred


def get_shrink_advisory(drive_letter: str = "C") -> Dict[str, Any]:
    """
    Calculates 100% safe shrink parameters for the specified drive (default: C:).
    """
    clean_letter = drive_letter.rstrip("\\/").rstrip(":").upper()
    mountpoint = f"{clean_letter}:\\"

    try:
        usage = psutil.disk_usage(mountpoint)
        total_bytes = usage.total
        used_bytes = usage.used
        free_bytes = usage.free
    except Exception as e:
        logger.error("Failed to query disk usage for %s: %s", mountpoint, e)
        return {
            "can_shrink": False,
            "error": f"Cannot query storage for {mountpoint}: {e}",
            "drive": clean_letter,
        }

    # Available drive letters for new partition
    available_letters = _get_unused_drive_letters()
    target_letter = available_letters[0] if available_letters else "D"

    # Max safe shrinkable bytes while preserving at least 25 GB on C:
    max_safe_shrink_bytes = max(0, free_bytes - MIN_SYSTEM_BUFFER_BYTES)
    can_shrink = max_safe_shrink_bytes >= MIN_NEW_PARTITION_BYTES

    # Recommended shrink size: ~40-50% of available safe space or 35 GB
    if can_shrink:
        ideal_shrink = 35 * 1024 * 1024 * 1024  # 35 GB
        if max_safe_shrink_bytes >= ideal_shrink:
            recommended_shrink_bytes = ideal_shrink
        else:
            recommended_shrink_bytes = int(max_safe_shrink_bytes * 0.8)
    else:
        recommended_shrink_bytes = 0

    recommended_shrink_mb = int(recommended_shrink_bytes / (1024 * 1024))
    max_safe_shrink_mb = int(max_safe_shrink_bytes / (1024 * 1024))
    c_remaining_free_bytes = free_bytes - recommended_shrink_bytes

    def format_gb(b: int) -> str:
        return f"{b / (1024 * 1024 * 1024):.1f} GB"

    return {
        "drive": clean_letter,
        "mountpoint": mountpoint,
        "total_bytes": total_bytes,
        "total_formatted": format_gb(total_bytes),
        "used_bytes": used_bytes,
        "used_formatted": format_gb(used_bytes),
        "free_bytes": free_bytes,
        "free_formatted": format_gb(free_bytes),
        "can_shrink": can_shrink,
        "min_system_buffer_gb": int(MIN_SYSTEM_BUFFER_BYTES / (1024 * 1024 * 1024)),
        "max_safe_shrink_mb": max_safe_shrink_mb,
        "max_safe_shrink_formatted": format_gb(max_safe_shrink_bytes),
        "recommended_shrink_mb": recommended_shrink_mb,
        "recommended_shrink_formatted": format_gb(recommended_shrink_bytes),
        "c_remaining_free_formatted": format_gb(c_remaining_free_bytes),
        "suggested_letter": target_letter,
        "available_letters": available_letters[:5],
        "safety_notes": [
            "Windows Disk Management natively prevents shrinking past unmovable files.",
            f"Entropy enforces a {int(MIN_SYSTEM_BUFFER_BYTES / (1024**3))} GB safety margin on C: for Windows updates and daily tasks.",
            "All personal documents, Desktop, code repositories, and installed applications remain completely intact.",
        ],
        "steps": [
            {
                "step": 1,
                "title": "Open Windows Disk Management",
                "instruction": "Click the button below to launch the official Windows Disk Management tool (diskmgmt.msc).",
                "action": "launch_diskmgmt",
            },
            {
                "step": 2,
                "title": f"Shrink ({clean_letter}:) Volume",
                "instruction": f"In Disk Management, right-click your ({clean_letter}:) partition and select 'Shrink Volume...'.",
            },
            {
                "step": 3,
                "title": "Enter the Shrink Amount",
                "instruction": f"In the dialog field 'Enter the amount of space to shrink in MB', paste the recommended value: {recommended_shrink_mb} MB ({format_gb(recommended_shrink_bytes)}).",
                "copy_value": str(recommended_shrink_mb),
            },
            {
                "step": 4,
                "title": f"Create Simple Volume ({target_letter}:)",
                "instruction": f"Right-click the newly created black 'Unallocated' space, select 'New Simple Volume', assign letter {target_letter}:, and set label to 'DevStorage'.",
            },
        ],
    }


def launch_windows_disk_management() -> Dict[str, Any]:
    """
    Safely launches the native Windows Disk Management console (diskmgmt.msc).
    """
    if platform.system() != "Windows":
        return {"success": False, "error": "Disk Management is only available on Windows."}

    try:
        subprocess.Popen(
            ["powershell.exe", "-NoProfile", "-WindowStyle", "Hidden", "-Command", "Start-Process diskmgmt.msc"],
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        return {"success": True, "message": "Launched Windows Disk Management (diskmgmt.msc)."}
    except Exception as e:
        logger.error("Failed to launch diskmgmt.msc: %s", e)
        return {"success": False, "error": str(e)}
