"""
Network Connections and Listening Ports Monitor Engine for Entropy.

Provides forensic discovery of active TCP/UDP network connections, listening ports,
and socket states with process-to-port correlation and port-releasing actions.
"""

from __future__ import annotations

import logging
import os
from dataclasses import asdict, dataclass
from typing import Any, Dict, List, Optional, Set

import psutil

from core.process_control import is_process_protected

logger = logging.getLogger(__name__)

DEV_PROCESS_NAMES = {
    'node', 'python', 'py', 'cargo', 'rustc', 'go', 'flutter', 'dart',
    'java', 'javaw', 'dotnet', 'ruby', 'mongod', 'postgres', 'mysqld',
    'redis-server', 'nginx', 'caddy', 'uvicorn', 'gunicorn', 'daphne',
    'vite', 'next', 'webpack', 'esbuild', 'docker', 'dockerd', 'wsl',
}


@dataclass
class NetworkConnectionItem:
    id: str
    fd: int
    family: str                    # 'IPv4' or 'IPv6'
    protocol: str                  # 'TCP' or 'UDP'
    local_ip: str
    local_port: int
    remote_ip: Optional[str]
    remote_port: Optional[int]
    status: str                    # 'LISTEN', 'ESTABLISHED', 'TIME_WAIT', etc.
    pid: Optional[int]
    process_name: str
    exe_path: Optional[str]
    cmdline_preview: Optional[str]
    is_listening: bool
    is_dev: bool
    is_protected: bool

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def get_network_connections(only_listening: bool = False) -> List[Dict[str, Any]]:
    """
    Forensically enumerate active network connections and listening ports.
    Correlates each connection with its owning PID, process name, and protection status.
    """
    results: List[NetworkConnectionItem] = []
    seen_keys: Set[str] = set()

    # Cache PID -> (name, exe, cmdline, is_protected, is_dev)
    proc_cache: Dict[int, Dict[str, Any]] = {}

    try:
        raw_conns = psutil.net_connections(kind='inet')
    except (psutil.AccessDenied, OSError) as e:
        logger.warning("Failed to query psutil net_connections: %s", e)
        return []

    for conn in raw_conns:
        if not conn.laddr:
            continue

        l_ip = conn.laddr.ip
        l_port = conn.laddr.port
        status = conn.status or 'NONE'
        is_listen = (status == 'LISTEN')

        if only_listening and not is_listen:
            continue

        r_ip = conn.raddr.ip if conn.raddr else None
        r_port = conn.raddr.port if conn.raddr else None
        proto = 'TCP' if conn.type == 1 else 'UDP'
        fam = 'IPv6' if ':' in l_ip else 'IPv4'

        pid = conn.pid
        proc_name = 'System/Unknown'
        exe_path: Optional[str] = None
        cmd_prev: Optional[str] = None
        is_prot = False
        is_dev = False

        if pid:
            if pid in proc_cache:
                info = proc_cache[pid]
                proc_name = info['name']
                exe_path = info['exe']
                cmd_prev = info['cmdline']
                is_prot = info['is_protected']
                is_dev = info['is_dev']
            else:
                try:
                    p = psutil.Process(pid)
                    proc_name = p.name()
                    try:
                        exe_path = p.exe()
                    except (psutil.AccessDenied, psutil.NoSuchProcess):
                        pass
                    try:
                        cmd = p.cmdline()
                        cmd_prev = ' '.join(cmd[:6]) if cmd else None
                    except (psutil.AccessDenied, psutil.NoSuchProcess):
                        pass

                    is_prot = is_process_protected(pid, proc_name, exe_path)
                    p_low = proc_name.lower().replace('.exe', '')
                    is_dev = (p_low in DEV_PROCESS_NAMES) or any(d in p_low for d in ('node', 'python', 'java', 'mongo', 'vite', 'server'))
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    is_prot = True

                proc_cache[pid] = {
                    'name': proc_name,
                    'exe': exe_path,
                    'cmdline': cmd_prev,
                    'is_protected': is_prot,
                    'is_dev': is_dev,
                }

        unique_key = f"{proto}:{l_ip}:{l_port}->{r_ip}:{r_port}:{pid}"
        if unique_key in seen_keys:
            continue
        seen_keys.add(unique_key)

        item_id = f"conn:{proto}:{l_port}:{pid or 0}"

        results.append(NetworkConnectionItem(
            id=item_id,
            fd=conn.fd if hasattr(conn, 'fd') and conn.fd is not None else -1,
            family=fam,
            protocol=proto,
            local_ip=l_ip,
            local_port=l_port,
            remote_ip=r_ip,
            remote_port=r_port,
            status=status,
            pid=pid,
            process_name=proc_name,
            exe_path=exe_path,
            cmdline_preview=cmd_prev,
            is_listening=is_listen,
            is_dev=is_dev,
            is_protected=is_prot,
        ))

    # Sort: Listening ports first, then dev processes first, then port number ascending
    results.sort(key=lambda c: (
        not c.is_listening,
        not c.is_dev,
        c.local_port,
    ))

    return [r.to_dict() for r in results]


def get_port_diagnostics(port: int) -> Dict[str, Any]:
    """Retrieve details on which process is occupying a specific local port."""
    conns = get_network_connections(only_listening=True)
    matching = [c for c in conns if c['local_port'] == port]

    if not matching:
        return {
            "port": port,
            "is_occupied": False,
            "message": f"Port {port} is currently free.",
            "occupants": [],
        }

    return {
        "port": port,
        "is_occupied": True,
        "message": f"Port {port} is occupied by {len(matching)} process(es).",
        "occupants": matching,
    }
