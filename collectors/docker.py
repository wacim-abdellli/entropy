"""
Docker collector module.

Gathers Docker containers, images, volumes, and host bind mounts.
Enables linking containers and volumes to project directories.
"""

from __future__ import annotations

import json
import logging
import os
import subprocess
from datetime import datetime
from typing import List, Optional, Tuple

from core.entities import (
    DockerContainer,
    DockerContainerState,
    DockerImage,
    DockerVolume,
)

logger = logging.getLogger(__name__)


def _parse_size(size_str: str) -> Optional[int]:
    """Parse Docker size string (e.g. '1.23GB', '500MB') to bytes."""
    if not size_str:
        return None
    s = size_str.upper().strip()
    try:
        if s.endswith("GB"):
            return int(float(s[:-2]) * 1024**3)
        if s.endswith("MB"):
            return int(float(s[:-2]) * 1024**2)
        if s.endswith("KB"):
            return int(float(s[:-2]) * 1024)
        if s.endswith("B"):
            return int(float(s[:-1]))
        return int(float(s))
    except (ValueError, IndexError):
        return None


def _parse_docker_timestamp(time_str: str) -> Optional[float]:
    """Parse Docker timestamp into Unix epoch float."""
    if not time_str:
        return None
    try:
        # e.g., '2024-01-15 12:30:00 +0000 UTC'
        parts = time_str.split()
        if len(parts) >= 2:
            clean_str = f"{parts[0]}T{parts[1]}"
            # Truncate nanoseconds if present
            if "." in clean_str:
                base, nano = clean_str.split(".", 1)
                clean_str = f"{base}.{nano[:6]}"
            dt = datetime.fromisoformat(clean_str)
            return dt.timestamp()
    except Exception:
        pass
    return None


def _run_docker_cmd(cmd: List[str], timeout: int = 8) -> subprocess.CompletedProcess:
    """Execute a docker CLI command safely with CREATE_NO_WINDOW on Windows."""
    creationflags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    return subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
        shell=True if os.name == "nt" else False,
        creationflags=creationflags,
    )


def collect_docker() -> Tuple[bool, Optional[str], List[DockerContainer], List[DockerImage], List[DockerVolume]]:
    """
    Collects Docker container, image, and volume states via read-only docker CLI commands.
    Gracefully degrades if Docker daemon is not running or CLI is absent.
    Returns (available, error_message, containers, images, volumes).
    """
    containers: List[DockerContainer] = []
    images: List[DockerImage] = []
    volumes: List[DockerVolume] = []

    # 1. Quick availability check
    try:
        # Probe CLI presence (50ms)
        probe = _run_docker_cmd(["docker", "--version"], timeout=2)
        if probe.returncode != 0:
            return False, "Docker CLI not functional", containers, images, volumes

        # On Windows, if named pipe doesn't exist, daemon is offline (0ms vs 4000ms timeout)
        if os.name == "nt" and "DOCKER_HOST" not in os.environ and not os.path.exists(r"\\.\pipe\docker_engine"):
            return False, "Docker daemon not running", containers, images, volumes

        res = _run_docker_cmd(["docker", "info"], timeout=4)
        if res.returncode != 0:
            err = res.stderr.strip()
            if "daemon is not running" in err.lower() or "connect" in err.lower():
                return False, "Docker daemon not running", containers, images, volumes
            return False, f"Docker error: {err[:120]}", containers, images, volumes
    except FileNotFoundError:
        return False, "Docker CLI not installed", containers, images, volumes
    except subprocess.TimeoutExpired:
        return False, "Docker command timed out", containers, images, volumes
    except Exception as e:
        return False, str(e), containers, images, volumes

    # 2. Containers
    try:
        res = _run_docker_cmd(["docker", "ps", "-a", "--format", "{{json .}}"], timeout=8)
        if res.returncode == 0 and res.stdout:
            for line in res.stdout.splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    data = json.loads(line)
                    cid = data.get("ID", "")
                    name = data.get("Names", "")
                    img_name = data.get("Image", "")
                    state_raw = data.get("State", "").lower()
                    created_raw = data.get("CreatedAt", "")
                    status = data.get("Status", "")

                    try:
                        cstate = DockerContainerState(state_raw)
                    except ValueError:
                        cstate = DockerContainerState.UNKNOWN

                    # Inspect container mounts
                    bind_mounts: List[str] = []
                    try:
                        insp = _run_docker_cmd(
                            ["docker", "inspect", cid, "--format", "{{json .Mounts}}"],
                            timeout=4,
                        )
                        if insp.returncode == 0 and insp.stdout.strip():
                            mount_data = json.loads(insp.stdout.strip())
                            for m in mount_data:
                                if m.get("Type") == "bind" and m.get("Source"):
                                    bind_mounts.append(os.path.abspath(m["Source"]))
                    except Exception:
                        pass

                    containers.append(
                        DockerContainer(
                            entity_id=f"docker_container:{cid}",
                            container_id=cid,
                            name=name,
                            image=img_name,
                            state=cstate,
                            created=_parse_docker_timestamp(created_raw),
                            status_text=status,
                            bind_mounts=bind_mounts,
                        )
                    )
                except json.JSONDecodeError:
                    pass
    except Exception as e:
        logger.debug(f"Failed collecting containers: {e}")

    # 3. Images
    try:
        res = _run_docker_cmd(["docker", "images", "--format", "{{json .}}"], timeout=8)
        if res.returncode == 0 and res.stdout:
            for line in res.stdout.splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    data = json.loads(line)
                    iid = data.get("ID", "")
                    repo = data.get("Repository", "")
                    tag = data.get("Tag", "")
                    size_raw = data.get("Size", "")
                    created_raw = data.get("CreatedAt", "")

                    tags = [f"{repo}:{tag}"] if (repo and tag and repo != "<none>") else []
                    images.append(
                        DockerImage(
                            entity_id=f"docker_image:{iid}",
                            image_id=iid,
                            tags=tags,
                            size_bytes=_parse_size(size_raw),
                            created=_parse_docker_timestamp(created_raw),
                        )
                    )
                except json.JSONDecodeError:
                    pass
    except Exception as e:
        logger.debug(f"Failed collecting images: {e}")

    # 4. Volumes
    try:
        res = _run_docker_cmd(["docker", "volume", "ls", "--format", "{{json .}}"], timeout=8)
        if res.returncode == 0 and res.stdout:
            for line in res.stdout.splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    data = json.loads(line)
                    vname = data.get("Name", "")
                    driver = data.get("Driver", "local")
                    mountpoint = data.get("Mountpoint")
                    volumes.append(
                        DockerVolume(
                            entity_id=f"docker_volume:{vname}",
                            name=vname,
                            driver=driver,
                            mountpoint=mountpoint,
                        )
                    )
                except json.JSONDecodeError:
                    pass
    except Exception as e:
        logger.debug(f"Failed collecting volumes: {e}")

    return True, None, containers, images, volumes
