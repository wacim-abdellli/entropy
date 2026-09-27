"""
Dev Drive (ReFS) and High-Throughput Storage Booster for Entropy.

Windows 11 (Build 22621+) introduced Dev Drive — a high-performance storage volume
formatted with ReFS (Resilient File System) providing Copy-on-Write (CoW) block cloning
and Antivirus Performance Mode for up to 30-40% faster compile times.

On Windows 10 (or older builds), this module provides developer storage telemetry,
package cache redirection to fast volumes, and alternative drive acceleration.
"""

from __future__ import annotations

import ctypes
import logging
import os
import platform
import shutil
import string
import subprocess
import sys
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

MIN_DEV_DRIVE_BUILD = 22621


@dataclass
class DevDriveVolume:
    drive_letter: str
    label: str
    file_system: str
    is_dev_drive: bool
    total_bytes: int
    free_bytes: int


@dataclass
class PackageCacheConfig:
    tool: str  # "npm" | "pip" | "cargo" | "nuget"
    current_path: str
    is_on_dev_drive: bool
    is_on_system_drive: bool
    recommended_path: Optional[str] = None


@dataclass
class DevDriveStatusReport:
    is_supported: bool
    os_build: int
    os_version: str
    min_required_build: int
    support_message: str
    mounted_dev_drives: List[DevDriveVolume] = field(default_factory=list)
    mounted_volumes: List[DevDriveVolume] = field(default_factory=list)
    package_caches: List[PackageCacheConfig] = field(default_factory=list)
    has_active_dev_drive: bool = False
    recommendations: List[Dict[str, Any]] = field(default_factory=list)


def _get_os_build() -> int:
    """Get Windows NT kernel build number."""
    try:
        return sys.getwindowsversion().build
    except Exception:
        return 0


def _query_volumes() -> List[DevDriveVolume]:
    """Inspect all mounted drive letters using native Win32 GetVolumeInformationW and GetDiskFreeSpaceExW."""
    volumes: List[DevDriveVolume] = []
    if os.name != "nt":
        return volumes

    kernel32 = ctypes.windll.kernel32

    # Query logical drives bitmask
    bitmask = kernel32.GetLogicalDrives()
    for letter in string.ascii_uppercase:
        if bitmask & 1:
            root = f"{letter}:\\"
            vol_name = ctypes.create_unicode_buffer(1024)
            fs_name = ctypes.create_unicode_buffer(1024)
            res = kernel32.GetVolumeInformationW(
                root,
                vol_name,
                1024,
                None,
                None,
                None,
                fs_name,
                1024,
            )
            if res:
                fs = fs_name.value
                label = vol_name.value
                free_bytes = ctypes.c_ulonglong(0)
                total_bytes = ctypes.c_ulonglong(0)
                kernel32.GetDiskFreeSpaceExW(
                    root,
                    None,
                    ctypes.byref(total_bytes),
                    ctypes.byref(free_bytes),
                )

                # Check if ReFS or DevDrive
                is_refs = "refs" in fs.lower()
                is_devdrv = is_refs

                # On Windows 11, we can also check fsutil devdrv if available
                if is_refs:
                    is_devdrv = True

                volumes.append(
                    DevDriveVolume(
                        drive_letter=f"{letter}:",
                        label=label,
                        file_system=fs,
                        is_dev_drive=is_devdrv,
                        total_bytes=total_bytes.value,
                        free_bytes=free_bytes.value,
                    )
                )
        bitmask >>= 1

    return volumes


def _get_package_cache_locations(dev_drives: List[DevDriveVolume]) -> List[PackageCacheConfig]:
    """Inspect current package manager cache directories for npm, pip, cargo, nuget."""
    dev_drive_letters = {v.drive_letter.upper() for v in dev_drives}
    user_home = os.path.expanduser("~")
    local_app_data = os.environ.get("LOCALAPPDATA", os.path.join(user_home, "AppData", "Local"))

    caches = []

    # 1. npm cache
    npm_path = os.environ.get("npm_config_cache") or os.path.join(local_app_data, "npm-cache")
    npm_drive = os.path.splitdrive(npm_path)[0].upper()
    caches.append(
        PackageCacheConfig(
            tool="npm",
            current_path=npm_path,
            is_on_dev_drive=npm_drive in dev_drive_letters,
            is_on_system_drive=npm_drive == "C:",
        )
    )

    # 2. pip cache
    pip_path = os.environ.get("PIP_CACHE_DIR") or os.path.join(local_app_data, "pip", "cache")
    pip_drive = os.path.splitdrive(pip_path)[0].upper()
    caches.append(
        PackageCacheConfig(
            tool="pip",
            current_path=pip_path,
            is_on_dev_drive=pip_drive in dev_drive_letters,
            is_on_system_drive=pip_drive == "C:",
        )
    )

    # 3. Cargo cache
    cargo_path = os.environ.get("CARGO_HOME") or os.path.join(user_home, ".cargo")
    cargo_drive = os.path.splitdrive(cargo_path)[0].upper()
    caches.append(
        PackageCacheConfig(
            tool="cargo",
            current_path=cargo_path,
            is_on_dev_drive=cargo_drive in dev_drive_letters,
            is_on_system_drive=cargo_drive == "C:",
        )
    )

    # 4. NuGet packages
    nuget_path = os.environ.get("NUGET_PACKAGES") or os.path.join(user_home, ".nuget", "packages")
    nuget_drive = os.path.splitdrive(nuget_path)[0].upper()
    caches.append(
        PackageCacheConfig(
            tool="nuget",
            current_path=nuget_path,
            is_on_dev_drive=nuget_drive in dev_drive_letters,
            is_on_system_drive=nuget_drive == "C:",
        )
    )

    return caches


def get_dev_drive_status() -> DevDriveStatusReport:
    """Query machine capability, existing volumes, and package cache alignment for Dev Drive."""
    build = _get_os_build()
    is_supported = build >= MIN_DEV_DRIVE_BUILD
    os_ver_str = f"Windows {platform.release()} (Build {build})"

    if is_supported:
        support_msg = "Dev Drive (ReFS) is natively supported on your Windows 11 installation."
    else:
        support_msg = f"Dev Drive requires Windows 11 Build {MIN_DEV_DRIVE_BUILD}+. Current system is {os_ver_str}."

    all_volumes = _query_volumes()
    dev_drives = [v for v in all_volumes if v.is_dev_drive]
    has_dev = len(dev_drives) > 0

    pkg_caches = _get_package_cache_locations(dev_drives)

    recommendations = []
    if is_supported and not has_dev:
        recommendations.append({
            "id": "create_dev_drive",
            "title": "Create a Dev Drive (ReFS)",
            "impact": "High",
            "description": "Format a dedicated VHDX or partition with ReFS to unlock Copy-on-Write and faster npm/cargo compile times.",
            "action_label": "Create Dev Drive",
        })
    elif has_dev:
        # Check if caches are on Dev Drive
        unaligned = [c for c in pkg_caches if not c.is_on_dev_drive]
        if unaligned:
            primary_dev = dev_drives[0].drive_letter
            recommendations.append({
                "id": "relocate_caches",
                "title": f"Move Package Caches to {primary_dev} Dev Drive",
                "impact": "High",
                "description": f"Redirect npm, pip, and cargo package caches to {primary_dev} to leverage block cloning and Defender performance mode.",
                "action_label": "Redirect Caches",
                "target_drive": primary_dev,
            })
    else:
        recommendations.append({
            "id": "windows_10_note",
            "title": "Developer Storage Optimization (Windows 10)",
            "impact": "Medium",
            "description": "On Windows 10, accelerate builds by enabling Win32 Long Paths and adding your workspace folders to Windows Defender exclusions.",
            "action_label": "Optimize Environment",
        })

    return DevDriveStatusReport(
        is_supported=is_supported,
        os_build=build,
        os_version=os_ver_str,
        min_required_build=MIN_DEV_DRIVE_BUILD,
        support_message=support_msg,
        mounted_dev_drives=dev_drives,
        mounted_volumes=all_volumes,
        package_caches=pkg_caches,
        has_active_dev_drive=has_dev,
        recommendations=recommendations,
    )


def relocate_package_caches(target_drive: str) -> Dict[str, Any]:
    """
    Relocate npm, pip, cargo, and nuget package caches to a target drive letter.
    Uses 'setx' for persistent environment variables and npm config set.
    """
    clean_drive = target_drive.rstrip("\\/").upper()
    if not clean_drive.endswith(":"):
        clean_drive += ":"

    target_dir = os.path.join(clean_drive + "\\", "DevPackages")
    os.makedirs(os.path.join(target_dir, "npm-cache"), exist_ok=True)
    os.makedirs(os.path.join(target_dir, "pip-cache"), exist_ok=True)
    os.makedirs(os.path.join(target_dir, "cargo-home"), exist_ok=True)
    os.makedirs(os.path.join(target_dir, "nuget-packages"), exist_ok=True)

    creationflags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    updated = []

    try:
        # 1. npm
        subprocess.run(
            ["cmd.exe", "/c", "npm", "config", "set", "cache", os.path.join(target_dir, "npm-cache")],
            capture_output=True,
            timeout=10,
            creationflags=creationflags,
        )
        updated.append("npm")

        # 2. pip
        subprocess.run(
            ["setx.exe", "PIP_CACHE_DIR", os.path.join(target_dir, "pip-cache")],
            capture_output=True,
            timeout=10,
            creationflags=creationflags,
        )
        updated.append("pip")

        # 3. cargo
        subprocess.run(
            ["setx.exe", "CARGO_HOME", os.path.join(target_dir, "cargo-home")],
            capture_output=True,
            timeout=10,
            creationflags=creationflags,
        )
        updated.append("cargo")

        # 4. nuget
        subprocess.run(
            ["setx.exe", "NUGET_PACKAGES", os.path.join(target_dir, "nuget-packages")],
            capture_output=True,
            timeout=10,
            creationflags=creationflags,
        )
        updated.append("nuget")

        return {
            "success": True,
            "message": f"Successfully relocated {len(updated)} package caches to {target_dir}.",
            "target_dir": target_dir,
            "updated_tools": updated,
        }
    except Exception as e:
        logger.error(f"Failed to relocate package caches: {e}")
        return {"success": False, "error": str(e)}
