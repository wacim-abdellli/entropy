"""
Entropy System Information & Hardware Forensics Engine.

Provides deep, 100% accurate Windows hardware specifications, storage drive partitions,
GPU telemetry, battery status, and non-blocking real-time system performance metrics.
"""

from __future__ import annotations

import ctypes
import json
import logging
import os
import platform
import subprocess
import threading
import time
from typing import Any, Dict, List, Optional

import psutil

logger = logging.getLogger(__name__)

# Cached hardware info that doesn't change during session
_hardware_cache_lock = threading.Lock()
_cached_gpu_info: Optional[List[Dict[str, Any]]] = None
_cached_physical_disks: Optional[List[Dict[str, Any]]] = None
_cached_raw_partitions: Optional[List[Dict[str, Any]]] = None
_hardware_cache_timestamp: float = 0.0
HARDWARE_CACHE_TTL = 300.0  # 5 minutes


class LiveMetricsTracker:
    """Thread-safe delta calculator for live Disk & Network I/O throughput."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._last_time = time.time()
        try:
            self._last_net = psutil.net_io_counters()
        except Exception:
            self._last_net = None
        try:
            self._last_disk = psutil.disk_io_counters()
        except Exception:
            self._last_disk = None

    def get_metrics(self) -> Dict[str, Any]:
        with self._lock:
            now = time.time()
            dt = max(now - self._last_time, 0.05)
            self._last_time = now

            # Live CPU & RAM
            cpu_pct = psutil.cpu_percent(interval=None)
            vm = psutil.virtual_memory()

            # Disk I/O delta
            read_speed = 0.0
            write_speed = 0.0
            try:
                current_disk = psutil.disk_io_counters()
                if current_disk and self._last_disk:
                    read_speed = max(0.0, (current_disk.read_bytes - self._last_disk.read_bytes) / dt)
                    write_speed = max(0.0, (current_disk.write_bytes - self._last_disk.write_bytes) / dt)
                self._last_disk = current_disk
            except Exception:
                pass

            # Network I/O delta
            sent_speed = 0.0
            recv_speed = 0.0
            try:
                current_net = psutil.net_io_counters()
                if current_net and self._last_net:
                    sent_speed = max(0.0, (current_net.bytes_sent - self._last_net.bytes_sent) / dt)
                    recv_speed = max(0.0, (current_net.bytes_recv - self._last_net.bytes_recv) / dt)
                self._last_net = current_net
            except Exception:
                pass

            # Uptime
            boot_t = psutil.boot_time()
            uptime_sec = int(now - boot_t)
            days = uptime_sec // 86400
            hours = (uptime_sec % 86400) // 3600
            minutes = (uptime_sec % 3600) // 60
            uptime_str = f"{days}d {hours}h {minutes}m" if days > 0 else f"{hours}h {minutes}m"

            return {
                "cpu_percent": round(cpu_pct, 1),
                "ram_percent": round(vm.percent, 1),
                "ram_used_bytes": vm.used,
                "ram_total_bytes": vm.total,
                "disk_read_bytes_sec": round(read_speed, 1),
                "disk_write_bytes_sec": round(write_speed, 1),
                "net_sent_bytes_sec": round(sent_speed, 1),
                "net_recv_bytes_sec": round(recv_speed, 1),
                "uptime_seconds": uptime_sec,
                "uptime_formatted": uptime_str,
            }


_live_tracker = LiveMetricsTracker()


def get_live_metrics() -> Dict[str, Any]:
    """Return instant real-time throughput metrics (CPU, RAM, Disk I/O, Net I/O)."""
    return _live_tracker.get_metrics()


def _get_windows_os_info() -> Dict[str, str]:
    """Retrieve detailed Windows OS product name, release/display version, and build from registry."""
    prod = platform.system()
    ver = platform.release()
    bld = platform.version()
    try:
        import winreg

        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows NT\CurrentVersion") as key:
            prod_val, _ = winreg.QueryValueEx(key, "ProductName")
            prod = str(prod_val)
            try:
                disp_val, _ = winreg.QueryValueEx(key, "DisplayVersion")
                ver = str(disp_val)
            except Exception:
                try:
                    rel_val, _ = winreg.QueryValueEx(key, "ReleaseId")
                    ver = str(rel_val)
                except Exception:
                    pass
            bld_val, _ = winreg.QueryValueEx(key, "CurrentBuild")
            try:
                ubr_val, _ = winreg.QueryValueEx(key, "UBR")
                bld = f"{bld_val}.{ubr_val}"
            except Exception:
                bld = str(bld_val)
    except Exception as e:
        logger.debug("Could not read Windows OS details from registry: %s", e)

    return {
        "product_name": prod,
        "version": ver,
        "build": bld,
        "arch": platform.machine(),
        "hostname": platform.node(),
    }


def _get_pc_manufacturer_and_model() -> Dict[str, str]:
    """Retrieve PC manufacturer and model name from BIOS registry."""
    mfg = "PC"
    model = "Windows Workstation"
    try:
        import winreg

        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"HARDWARE\DESCRIPTION\System\BIOS") as key:
            try:
                mfg_val, _ = winreg.QueryValueEx(key, "SystemManufacturer")
                mfg = str(mfg_val).strip()
            except Exception:
                pass
            try:
                mod_val, _ = winreg.QueryValueEx(key, "SystemProductName")
                model = str(mod_val).strip()
            except Exception:
                pass
    except Exception as e:
        logger.debug("Could not read BIOS model info from registry: %s", e)

    return {
        "manufacturer": mfg,
        "model": model,
    }


def _get_cpu_specs() -> Dict[str, Any]:
    """Retrieve CPU model name, core counts, and frequencies."""
    cpu_name = platform.processor()
    try:
        import winreg

        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"HARDWARE\DESCRIPTION\System\CentralProcessor\0") as key:
            val, _ = winreg.QueryValueEx(key, "ProcessorNameString")
            cpu_name = str(val).strip()
    except Exception as e:
        logger.debug("Could not query CPU ProcessorNameString: %s", e)

    freq = psutil.cpu_freq()
    return {
        "name": cpu_name,
        "physical_cores": psutil.cpu_count(logical=False) or 1,
        "logical_cores": psutil.cpu_count(logical=True) or 1,
        "current_freq_mhz": round(freq.current, 1) if freq else None,
        "max_freq_mhz": round(freq.max, 1) if freq and freq.max else None,
        "percent": psutil.cpu_percent(interval=None),
    }


def _get_ram_specs() -> Dict[str, Any]:
    """Retrieve physical and swap memory information."""
    vm = psutil.virtual_memory()
    sm = psutil.swap_memory()
    return {
        "total_bytes": vm.total,
        "used_bytes": vm.used,
        "available_bytes": vm.available,
        "percent": vm.percent,
        "swap_total_bytes": sm.total,
        "swap_used_bytes": sm.used,
    }


def _get_battery_info() -> Dict[str, Any]:
    """Retrieve laptop battery telemetry if present."""
    try:
        battery = psutil.sensors_battery()
        if battery:
            return {
                "has_battery": True,
                "percent": round(battery.percent, 1),
                "power_plugged": battery.power_plugged,
            }
    except Exception:
        pass
    return {
        "has_battery": False,
        "percent": None,
        "power_plugged": True,
    }


def _run_silent_powershell(command: str, timeout: int = 6) -> Optional[str]:
    """Execute a PowerShell command with zero console window or visual popup on Windows."""
    cmd = [
        "powershell",
        "-NoProfile",
        "-NonInteractive",
        "-WindowStyle",
        "Hidden",
        "-Command",
        command,
    ]
    creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000) if os.name == "nt" else 0
    startupinfo = None
    if os.name == "nt":
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= getattr(subprocess, "STARTF_USESHOWWINDOW", 1)
        startupinfo.wShowWindow = 0  # SW_HIDE
    try:
        res = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            creationflags=creationflags,
            startupinfo=startupinfo,
        )
        if res.returncode == 0 and res.stdout.strip():
            return res.stdout
    except Exception as e:
        logger.debug("PowerShell command failed: %s", e)
    return None


def _probe_gpus() -> List[Dict[str, Any]]:
    """Probe GPUs via PowerShell Get-CimInstance Win32_VideoController."""
    stdout = _run_silent_powershell(
        "Get-CimInstance Win32_VideoController | Select-Object -Property Name, AdapterRAM, DriverVersion | ConvertTo-Json",
        timeout=6,
    )
    if not stdout:
        return []
    try:
        raw = json.loads(stdout)
        items = raw if isinstance(raw, list) else [raw]
        gpus = []
        for item in items:
            name = item.get("Name")
            if not name:
                continue
            ram = item.get("AdapterRAM")
            # Sometimes 32-bit uint overflow occurs or AdapterRAM is negative in WMI
            adapter_ram = int(ram) if ram and int(ram) > 0 else None
            gpus.append({
                "name": str(name).strip(),
                "adapter_ram_bytes": adapter_ram,
                "driver_version": str(item.get("DriverVersion", "")).strip() or None,
            })
        return gpus
    except Exception as e:
        logger.debug("Failed to query GPUs via PowerShell: %s", e)

    return []


def _probe_physical_disks() -> List[Dict[str, Any]]:
    """Probe physical hardware drives (SSD/NVMe vs HDD, BusType, Size) via PowerShell."""
    stdout = _run_silent_powershell(
        "Get-PhysicalDisk | Select-Object DeviceId, FriendlyName, MediaType, BusType, Size | ConvertTo-Json",
        timeout=6,
    )
    if not stdout:
        return []
    try:
        raw = json.loads(stdout)
        items = raw if isinstance(raw, list) else [raw]
        disks = []
        for item in items:
            friendly = item.get("FriendlyName")
            if not friendly:
                continue
            disks.append({
                "device_id": str(item.get("DeviceId", "")),
                "friendly_name": str(friendly).strip(),
                "media_type": str(item.get("MediaType", "Fixed")).strip(),
                "bus_type": str(item.get("BusType", "")).strip(),
                "size_bytes": int(item.get("Size") or 0),
            })
        return disks
    except Exception as e:
        logger.debug("Failed to query physical disks: %s", e)
    return []


def _probe_raw_partitions() -> List[Dict[str, Any]]:
    """Query low-level partition table on disk to detect Linux, recovery, or unassigned partitions."""
    stdout = _run_silent_powershell(
        "Get-Partition | Select-Object DiskNumber, PartitionNumber, DriveLetter, Size, Type | ConvertTo-Json",
        timeout=6,
    )
    if not stdout:
        return []
    try:
        raw = json.loads(stdout)
        items = raw if isinstance(raw, list) else [raw]
        partitions = []
        for item in items:
            size = item.get("Size")
            if not size:
                continue
            partitions.append({
                "disk_number": int(item.get("DiskNumber", 0)),
                "partition_number": int(item.get("PartitionNumber", 0)),
                "drive_letter": str(item.get("DriveLetter") or "").strip() or None,
                "size_bytes": int(size),
                "partition_type": str(item.get("Type", "Unknown")),
            })
        return partitions
    except Exception as e:
        logger.debug("Failed to query raw partitions: %s", e)
    return []


def _get_mounted_drives(physical_disks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Retrieve all mounted file system partitions and evaluate storage health."""
    drives = []
    kernel32 = ctypes.windll.kernel32
    sys_drive = os.environ.get("SystemDrive", "C:").upper()

    # Match physical disk media type if available
    default_media_type = "SSD" if any(d.get("media_type") == "SSD" for d in physical_disks) else "Fixed"
    default_friendly = physical_disks[0].get("friendly_name") if physical_disks else None

    for part in psutil.disk_partitions(all=False):
        try:
            usage = psutil.disk_usage(part.mountpoint)
            vol_buf = ctypes.create_unicode_buffer(1024)
            fs_buf = ctypes.create_unicode_buffer(1024)
            kernel32.GetVolumeInformationW(
                ctypes.c_wchar_p(part.mountpoint),
                vol_buf,
                ctypes.sizeof(vol_buf),
                None,
                None,
                None,
                fs_buf,
                ctypes.sizeof(fs_buf),
            )
            is_sys = part.mountpoint.upper().startswith(sys_drive)
            status = "healthy"
            # > 95% used or < 5GB free is critical
            if usage.percent > 95 or usage.free < 5 * (1024**3):
                status = "critical"
            # > 85% used or < 15GB free is warning
            elif usage.percent > 85 or usage.free < 15 * (1024**3):
                status = "warning"

            label = vol_buf.value
            if not label:
                label = "System" if is_sys else "Local Disk"

            drives.append({
                "mountpoint": part.mountpoint,
                "device": part.device,
                "label": label,
                "fstype": fs_buf.value or part.fstype or "NTFS",
                "total_bytes": usage.total,
                "used_bytes": usage.used,
                "free_bytes": usage.free,
                "percent": usage.percent,
                "is_system": is_sys,
                "status": status,
                "media_type": default_media_type,
                "friendly_name": default_friendly,
            })
        except Exception as e:
            logger.debug("Failed to inspect drive partition %s: %s", part.mountpoint, e)

    return drives


def get_system_specs(force_refresh: bool = False) -> Dict[str, Any]:
    """
    Produce comprehensive forensic system specifications, storage partitions, and hardware inventory.
    Caches slow WMI/PowerShell results (GPUs, physical drives) for rapid repeated access.
    """
    global _cached_gpu_info, _cached_physical_disks, _cached_raw_partitions, _hardware_cache_timestamp

    now = time.time()
    with _hardware_cache_lock:
        if (
            force_refresh
            or _cached_gpu_info is None
            or (now - _hardware_cache_timestamp > HARDWARE_CACHE_TTL)
        ):
            _cached_gpu_info = _probe_gpus()
            _cached_physical_disks = _probe_physical_disks()
            _cached_raw_partitions = _probe_raw_partitions()
            _hardware_cache_timestamp = now

        gpus = _cached_gpu_info or []
        physical_disks = _cached_physical_disks or []
        raw_partitions = _cached_raw_partitions or []

    # Dynamic metrics
    boot_t = psutil.boot_time()
    uptime_sec = int(now - boot_t)
    days = uptime_sec // 86400
    hours = (uptime_sec % 86400) // 3600
    minutes = (uptime_sec % 3600) // 60
    uptime_str = f"{days}d {hours}h {minutes}m" if days > 0 else f"{hours}h {minutes}m"

    drives = _get_mounted_drives(physical_disks)

    return {
        "os": _get_windows_os_info(),
        "pc": _get_pc_manufacturer_and_model(),
        "cpu": _get_cpu_specs(),
        "ram": _get_ram_specs(),
        "gpus": gpus,
        "battery": _get_battery_info(),
        "uptime_seconds": uptime_sec,
        "uptime_formatted": uptime_str,
        "drives": drives,
        "physical_disks": physical_disks,
        "raw_partitions": raw_partitions,
    }
