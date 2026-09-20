"""
Process collector module.

Uses psutil to inspect running processes, identifying executable paths,
working directories (cwd), memory usage, and lifecycle start times.
Adheres to privacy constraints by avoiding extraction of sensitive command-line secrets.
"""

from __future__ import annotations

import logging
import os
from typing import List

import psutil

from core.entities import Process

logger = logging.getLogger(__name__)


def collect_processes() -> List[Process]:
    """
    Inspects running processes accessible to the current user.
    Returns a list of Process entities.
    """
    processes: List[Process] = []

    for proc in psutil.process_iter(
        attrs=["pid", "name", "exe", "cmdline", "create_time", "ppid"]
    ):
        try:
            info = proc.info
            pid = info.get("pid") or 0
            name = info.get("name") or ""
            exe = info.get("exe")
            exe_path = None
            if exe and os.path.isabs(exe) and os.path.isfile(exe):
                exe_path = os.path.normpath(exe)

            create_time = info.get("create_time")
            ppid = info.get("ppid")

            # Obtain working directory (cwd) if accessible and valid absolute dir
            cwd = None
            try:
                raw_cwd = proc.cwd()
                if raw_cwd and os.path.isabs(raw_cwd) and os.path.isdir(raw_cwd):
                    cwd = os.path.normpath(raw_cwd)
            except (psutil.AccessDenied, psutil.NoSuchProcess, OSError):
                cwd = None

            # Memory information
            memory_bytes = None
            try:
                mem_info = proc.memory_info()
                if mem_info:
                    memory_bytes = mem_info.rss
            except (psutil.AccessDenied, psutil.NoSuchProcess, OSError):
                memory_bytes = None

            # Safe commandline preview: only executable name, NEVER full argument string with possible secrets
            cmdline_preview = None
            cmdline = info.get("cmdline")
            if cmdline and len(cmdline) > 0:
                # Store the command or script invoked without arguments
                first_arg = os.path.basename(cmdline[0])
                if len(cmdline) > 1 and not cmdline[1].startswith("-"):
                    second_arg = os.path.basename(cmdline[1])
                    cmdline_preview = f"{first_arg} {second_arg}"
                else:
                    cmdline_preview = first_arg

            entity_id = f"proc:{pid}_{int(create_time or 0)}"
            process_entity = Process(
                entity_id=entity_id,
                pid=pid,
                name=name or "",
                exe_path=exe_path,
                cwd=cwd,
                parent_pid=ppid,
                create_time=create_time,
                memory_bytes=memory_bytes,
                cpu_percent=None,
                cmdline_preview=cmdline_preview,
            )
            processes.append(process_entity)

        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue
        except Exception as e:
            logger.debug(f"Error inspecting process: {e}")
            continue

    return processes
