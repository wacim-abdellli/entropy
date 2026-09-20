"""
Runtime collector module.

Detects installed runtimes and SDKs on Windows:
- Node.js (system, nvm-windows, fnm, volta)
- Python (system, py launcher, pyenv-win)
- .NET SDKs and runtimes (dotnet CLI)
- Java / JDK
- Rust (rustc, rustup toolchains)
- Go
- PHP
- Ruby
"""

from __future__ import annotations

import logging
import os
import re
import subprocess
from pathlib import Path
from typing import List, Optional, Set, Tuple

from core.entities import RuntimeInstallation

logger = logging.getLogger(__name__)
CMD_TIMEOUT = 3.0


def _run_cmd(cmd: List[str]) -> Tuple[bool, str]:
    """Execute command safely and return (success, stdout)."""
    try:
        res = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=CMD_TIMEOUT,
            check=False,
            shell=True if os.name == "nt" else False,
        )
        if res.returncode == 0:
            return True, res.stdout.strip()
        return False, res.stderr.strip()
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError) as e:
        logger.debug(f"Command {' '.join(cmd)} failed: {e}")
        return False, str(e)


def _extract_version(text: str, pattern: str) -> Optional[str]:
    match = re.search(pattern, text)
    return match.group(1) if match else None


def collect_node_runtimes() -> List[RuntimeInstallation]:
    runtimes: List[RuntimeInstallation] = []
    active_version: Optional[str] = None

    # 1. System / active node
    ok, out = _run_cmd(["node", "--version"])
    if ok:
        v = _extract_version(out, r"v(\d+\.\d+\.\d+)") or out.lstrip("v").strip()
        active_version = v
        # Locate path via 'where node'
        ok_where, where_out = _run_cmd(["where", "node"])
        node_path = where_out.splitlines()[0].strip() if ok_where and where_out else None

        runtimes.append(
            RuntimeInstallation(
                entity_id=f"runtime:node_{v}",
                runtime="node",
                version=v,
                path=node_path,
                manager="system",
                is_active=True,
            )
        )

    # 2. nvm-windows: %APPDATA%\nvm or %NVM_HOME%
    appdata = os.environ.get("APPDATA")
    if appdata:
        nvm_dir = Path(appdata) / "nvm"
        if nvm_dir.is_dir():
            try:
                for entry in nvm_dir.iterdir():
                    if entry.is_dir() and entry.name.startswith("v"):
                        ver = entry.name.lstrip("v")
                        runtimes.append(
                            RuntimeInstallation(
                                entity_id=f"runtime:node_{ver}",
                                runtime="node",
                                version=ver,
                                path=str(entry),
                                manager="nvm-windows",
                                is_active=(ver == active_version),
                            )
                        )
            except OSError:
                pass

    # 3. fnm node versions: %LOCALAPPDATA%\fnm_multishells or %USERPROFILE%\.fnm
    localappdata = os.environ.get("LOCALAPPDATA")
    if localappdata:
        fnm_dir = Path(localappdata) / "fnm_multishells"
        if fnm_dir.is_dir():
            try:
                for entry in fnm_dir.iterdir():
                    if entry.is_dir():
                        ver = entry.name.lstrip("v")
                        runtimes.append(
                            RuntimeInstallation(
                                entity_id=f"runtime:node_{ver}",
                                runtime="node",
                                version=ver,
                                path=str(entry),
                                manager="fnm",
                                is_active=(ver == active_version),
                            )
                        )
            except OSError:
                pass

    return runtimes


def collect_python_runtimes() -> List[RuntimeInstallation]:
    runtimes: List[RuntimeInstallation] = []
    active_version: Optional[str] = None

    # 1. Active python
    ok, out = _run_cmd(["python", "--version"])
    if ok:
        v = _extract_version(out, r"Python (\d+\.\d+\.\d+)") or out.replace("Python", "").strip()
        active_version = v
        ok_where, where_out = _run_cmd(["where", "python"])
        py_path = where_out.splitlines()[0].strip() if ok_where and where_out else None

        runtimes.append(
            RuntimeInstallation(
                entity_id=f"runtime:python_{v}",
                runtime="python",
                version=v,
                path=py_path,
                manager="system",
                is_active=True,
            )
        )

    # 2. Windows Python Launcher `py --list-paths` (rich Windows-specific inventory)
    ok_py, py_out = _run_cmd(["py", "--list-paths"])
    if ok_py and py_out:
        for line in py_out.splitlines():
            line = line.strip()
            # Format: -V:3.12 * C:\Python312\python.exe OR -V:3.11 C:\...
            m = re.search(r"-V:(\S+)\s+(\*?)\s*(.+)$", line)
            if m:
                ver_tag = m.group(1)
                is_def = bool(m.group(2))
                bin_path = m.group(3).strip()
                runtimes.append(
                    RuntimeInstallation(
                        entity_id=f"runtime:python_{ver_tag}",
                        runtime="python",
                        version=ver_tag,
                        path=bin_path,
                        manager="py-launcher",
                        is_active=is_def or (ver_tag in (active_version or "")),
                    )
                )

    return runtimes


def collect_dotnet_runtimes() -> List[RuntimeInstallation]:
    runtimes: List[RuntimeInstallation] = []

    # Windows .NET SDKs
    ok, out = _run_cmd(["dotnet", "--list-sdks"])
    if ok and out:
        for line in out.splitlines():
            # Example: 8.0.204 [C:\Program Files\dotnet\sdk]
            m = re.match(r"^(\d+\.\d+\.\d+)\s+\[(.+)\]", line.strip())
            if m:
                ver = m.group(1)
                path = m.group(2)
                runtimes.append(
                    RuntimeInstallation(
                        entity_id=f"runtime:dotnet_sdk_{ver}",
                        runtime="dotnet-sdk",
                        version=ver,
                        path=path,
                        manager="dotnet",
                        is_active=True,
                    )
                )

    return runtimes


def collect_rust_runtimes() -> List[RuntimeInstallation]:
    runtimes: List[RuntimeInstallation] = []
    active_version: Optional[str] = None

    ok, out = _run_cmd(["rustc", "--version"])
    if ok:
        v = _extract_version(out, r"rustc (\S+)") or out.strip()
        active_version = v
        runtimes.append(
            RuntimeInstallation(
                entity_id=f"runtime:rust_{v}",
                runtime="rust",
                version=v,
                manager="system",
                is_active=True,
            )
        )

    # rustup toolchains
    user_home = Path.home()
    toolchains_dir = user_home / ".rustup" / "toolchains"
    if toolchains_dir.is_dir():
        try:
            for entry in toolchains_dir.iterdir():
                if entry.is_dir():
                    runtimes.append(
                        RuntimeInstallation(
                            entity_id=f"runtime:rustup_{entry.name}",
                            runtime="rust",
                            version=entry.name,
                            path=str(entry),
                            manager="rustup",
                            is_active=(entry.name == active_version),
                        )
                    )
        except OSError:
            pass

    return runtimes


def collect_java_runtimes() -> List[RuntimeInstallation]:
    runtimes: List[RuntimeInstallation] = []
    ok, out = _run_cmd(["java", "--version"])
    if not ok:
        ok, out = _run_cmd(["java", "-version"])

    if ok and out:
        v = (
            _extract_version(out, r'version "([^"]+)"')
            or _extract_version(out, r'(?:openjdk|java) (\d+\.\d+\.[^\s]+)')
            or _extract_version(out, r'(?:openjdk|java) (\d+)')
        )
        if v:
            runtimes.append(
                RuntimeInstallation(
                    entity_id=f"runtime:java_{v}",
                    runtime="java",
                    version=v,
                    manager="system",
                    is_active=True,
                )
            )

    return runtimes


def collect_go_runtimes() -> List[RuntimeInstallation]:
    runtimes: List[RuntimeInstallation] = []
    ok, out = _run_cmd(["go", "version"])
    if ok and out:
        v = _extract_version(out, r"go version go([^\s]+)")
        if v:
            runtimes.append(
                RuntimeInstallation(
                    entity_id=f"runtime:go_{v}",
                    runtime="go",
                    version=v,
                    manager="system",
                    is_active=True,
                )
            )
    return runtimes


def collect_php_runtimes() -> List[RuntimeInstallation]:
    runtimes: List[RuntimeInstallation] = []
    ok, out = _run_cmd(["php", "--version"])
    if ok and out:
        v = _extract_version(out, r"PHP ([^\s]+)")
        if v:
            runtimes.append(
                RuntimeInstallation(
                    entity_id=f"runtime:php_{v}",
                    runtime="php",
                    version=v,
                    manager="system",
                    is_active=True,
                )
            )
    return runtimes


def collect_ruby_runtimes() -> List[RuntimeInstallation]:
    runtimes: List[RuntimeInstallation] = []
    ok, out = _run_cmd(["ruby", "--version"])
    if ok and out:
        v = _extract_version(out, r"ruby ([^\s]+)")
        if v:
            runtimes.append(
                RuntimeInstallation(
                    entity_id=f"runtime:ruby_{v}",
                    runtime="ruby",
                    version=v,
                    manager="system",
                    is_active=True,
                )
            )
    return runtimes


def collect_runtimes() -> List[RuntimeInstallation]:
    """Collect all installed and active runtimes across languages."""
    all_runtimes: List[RuntimeInstallation] = []

    collectors = [
        collect_node_runtimes,
        collect_python_runtimes,
        collect_dotnet_runtimes,
        collect_rust_runtimes,
        collect_java_runtimes,
        collect_go_runtimes,
        collect_php_runtimes,
        collect_ruby_runtimes,
    ]

    for col in collectors:
        try:
            all_runtimes.extend(col())
        except Exception as e:
            logger.debug(f"Collector {col.__name__} failed: {e}")

    # Deduplicate by (runtime, version, path)
    seen: Set[Tuple[str, str, Optional[str]]] = set()
    deduped: List[RuntimeInstallation] = []
    for rt in all_runtimes:
        key = (rt.runtime, rt.version, rt.path)
        if key not in seen:
            seen.add(key)
            deduped.append(rt)

    return deduped
