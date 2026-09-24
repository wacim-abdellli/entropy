"""
Docker Control & Purge engine for Entropy.

Provides safe inspection and pruning of Docker resources:
- Docker Build Cache (docker builder prune -f)
- Dangling / Unused Images (docker image prune -f)
- Docker System Prune (docker system prune -f)

Enforces strict safety:
- Never removes running containers
- Never force deletes named volumes by default
- Detects whether Docker daemon is active before dispatching commands
"""

from __future__ import annotations

import json
import logging
import os
import subprocess
from typing import Any, Dict, List

logger = logging.getLogger(__name__)


def _parse_size(size_str: str) -> int:
    """Parse Docker size string (e.g. '1.23GB', '500MB', '800B') to bytes."""
    if not size_str:
        return 0
    # Clean string: e.g. "800MB (53%)" -> "800MB"
    s = size_str.split("(")[0].strip().upper()
    try:
        if s.endswith("GB"):
            return int(float(s[:-2].strip()) * 1024**3)
        if s.endswith("MB"):
            return int(float(s[:-2].strip()) * 1024**2)
        if s.endswith("KB"):
            return int(float(s[:-2].strip()) * 1024)
        if s.endswith("B"):
            return int(float(s[:-1].strip()))
        return int(float(s))
    except (ValueError, IndexError):
        return 0


def _run_docker_cmd(cmd: List[str], timeout: int = 15) -> subprocess.CompletedProcess:
    creationflags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    return subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
        creationflags=creationflags,
    )


def is_docker_available() -> tuple[bool, str]:
    """Check if Docker CLI is installed and Docker daemon is running."""
    try:
        # Fast probe on Windows: check named pipe
        if os.name == "nt" and "DOCKER_HOST" not in os.environ:
            has_pipe = os.path.exists(r"\\.\pipe\docker_engine") or os.path.exists(r"\\.\pipe\dockerDesktopLinuxEngine")
            if not has_pipe:
                return False, "Docker daemon is not running."

        res = _run_docker_cmd(["docker", "info"], timeout=5)
        if res.returncode == 0:
            return True, "Docker is online and responsive."
        err = res.stderr.strip()
        return False, f"Docker daemon not available: {err[:120]}"
    except FileNotFoundError:
        return False, "Docker CLI is not installed."
    except Exception as e:
        return False, f"Docker check failed: {e}"


def get_docker_disk_usage() -> Dict[str, Any]:
    """
    Get detailed breakdown of Docker disk usage (images, containers, volumes, build cache).
    """
    available, msg = is_docker_available()
    if not available:
        return {
            "available": False,
            "message": msg,
            "items": [],
            "total_size_bytes": 0,
            "reclaimable_bytes": 0,
        }

    try:
        res = _run_docker_cmd(["docker", "system", "df", "--format", "{{json .}}"], timeout=10)
        if res.returncode != 0:
            return {
                "available": False,
                "message": res.stderr.strip() or "Failed to query docker system df.",
                "items": [],
                "total_size_bytes": 0,
                "reclaimable_bytes": 0,
            }

        items: List[Dict[str, Any]] = []
        total_size = 0
        total_reclaimable = 0

        for line in res.stdout.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
                item_type = data.get("Type", "Unknown")
                total_count = int(data.get("TotalCount", 0)) if str(data.get("TotalCount", 0)).isdigit() else 0
                active_count = int(data.get("Active", 0)) if str(data.get("Active", 0)).isdigit() else 0
                raw_size = data.get("Size", "0B")
                raw_reclaimable = data.get("Reclaimable", "0B")

                size_bytes = _parse_size(raw_size)
                reclaim_bytes = _parse_size(raw_reclaimable)

                total_size += size_bytes
                total_reclaimable += reclaim_bytes

                items.append({
                    "type": item_type,
                    "total_count": total_count,
                    "active_count": active_count,
                    "size_raw": raw_size,
                    "size_bytes": size_bytes,
                    "reclaimable_raw": raw_reclaimable,
                    "reclaimable_bytes": reclaim_bytes,
                })
            except Exception:
                pass

        return {
            "available": True,
            "message": "Docker disk usage retrieved successfully.",
            "items": items,
            "total_size_bytes": total_size,
            "reclaimable_bytes": total_reclaimable,
        }
    except Exception as e:
        logger.error(f"Failed to query Docker disk usage: {e}")
        return {
            "available": False,
            "message": str(e),
            "items": [],
            "total_size_bytes": 0,
            "reclaimable_bytes": 0,
        }


def prune_docker_resources(target: str = "builder") -> Dict[str, Any]:
    """
    Safely prune Docker resources.
    Target options:
    - 'builder': Prunes build cache only ('docker builder prune -f')
    - 'dangling_images': Prunes unused/dangling images ('docker image prune -f')
    - 'system': Prunes stopped containers, dangling images, and build cache ('docker system prune -f')
    """
    valid_targets = {"builder", "dangling_images", "system"}
    if target not in valid_targets:
        return {"success": False, "target": target, "error": f"Invalid prune target '{target}'."}

    available, msg = is_docker_available()
    if not available:
        return {"success": False, "target": target, "error": msg}

    cmd = ["docker"]
    if target == "builder":
        cmd.extend(["builder", "prune", "-f"])
    elif target == "dangling_images":
        cmd.extend(["image", "prune", "-f"])
    elif target == "system":
        cmd.extend(["system", "prune", "-f"])
    else:
        return {"success": False, "target": target, "error": f"Invalid prune target '{target}'."}

    try:
        res = _run_docker_cmd(cmd, timeout=60)
        if res.returncode == 0:
            output = res.stdout.strip()
            freed_str = ""
            for line in output.splitlines():
                if "reclaimed space:" in line.lower():
                    freed_str = line.split(":", 1)[-1].strip()
                    break
            return {
                "success": True,
                "target": target,
                "freed_space": freed_str,
                "message": f"Successfully pruned Docker {target}." + (f" Reclaimed: {freed_str}" if freed_str else ""),
                "output": output,
            }
        else:
            return {
                "success": False,
                "target": target,
                "error": res.stderr.strip() or "Docker prune command failed.",
            }
    except Exception as e:
        logger.error(f"Error running Docker prune ({target}): {e}")
        return {"success": False, "target": target, "error": str(e)}
