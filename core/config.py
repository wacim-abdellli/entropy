"""
Entropy Configuration Manager.

Handles persistent application configuration stored in ~/.entropy/config.json.
Guarantees scan roots, last workspace, and user preferences survive app restarts.
Thread-safe read-modify-write with atomic file swap and deep dictionary merging.
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger("entropy.config")

CONFIG_DIR = Path.home() / ".entropy"
CONFIG_FILE = CONFIG_DIR / "config.json"
_config_lock = threading.Lock()


def get_default_scan_roots() -> List[str]:
    """Auto-detect standard developer roots on first run."""
    user_home = os.path.expanduser("~")
    # Dedicated developer directory candidates
    dev_candidates = [
        os.path.join(user_home, "Desktop"),
        os.path.join(user_home, "source", "repos"),
        os.path.join(user_home, "projects"),
        os.path.join(user_home, "dev"),
        os.path.join(user_home, "code"),
        os.path.join(user_home, "workspace"),
        os.path.join(user_home, "Documents", "Projects"),
        os.path.join(user_home, "Documents", "Visual Studio 2022", "Projects"),
    ]
    existing = [os.path.abspath(c) for c in dev_candidates if os.path.isdir(c)]
    if existing:
        return existing
    desktop = os.path.join(user_home, "Desktop")
    if os.path.isdir(desktop):
        return [os.path.abspath(desktop)]
    return [os.path.abspath(user_home)]


def get_user_profile_info() -> Dict[str, Any]:
    """Get dynamic information about current user's profile and default paths."""
    user_home = os.path.expanduser("~")
    desktop_path = os.path.join(user_home, "Desktop")
    documents_path = os.path.join(user_home, "Documents")
    username = os.environ.get("USERNAME") or os.path.basename(user_home) or "User"

    candidates = [
        desktop_path,
        documents_path,
        os.path.join(user_home, "source", "repos"),
        os.path.join(user_home, "projects"),
        os.path.join(user_home, "dev"),
    ]
    standard_dev_roots = [os.path.abspath(c) for c in candidates if os.path.isdir(c)]
    if not standard_dev_roots:
        standard_dev_roots = [os.path.abspath(desktop_path) if os.path.isdir(desktop_path) else os.path.abspath(user_home)]

    return {
        "username": username,
        "user_home": os.path.abspath(user_home),
        "desktop": os.path.abspath(desktop_path) if os.path.isdir(desktop_path) else os.path.abspath(user_home),
        "documents": os.path.abspath(documents_path) if os.path.isdir(documents_path) else os.path.abspath(user_home),
        "standard_dev_roots": standard_dev_roots,
    }


DEFAULT_CONFIG: Dict[str, Any] = {
    "version": 1,
    "scan_roots": None,  # Will be populated with get_default_scan_roots() on first run
    "last_workspace": None,  # Persistent last opened workspace path
    "max_depth": 3,
    "scan_timeout_seconds": 30,  # Guard for high-volume storage / slow drives
    "preferences": {
        "theme": "dark",
        "auto_refresh_seconds": 0,
    },
}


def _deep_merge(target: Dict[str, Any], source: Dict[str, Any]) -> Dict[str, Any]:
    """Recursively merge source dictionary into target dictionary."""
    for key, value in source.items():
        if isinstance(value, dict) and isinstance(target.get(key), dict):
            target[key] = _deep_merge(dict(target[key]), value)
        else:
            target[key] = value
    return target


def load_config() -> Dict[str, Any]:
    """Load configuration from disk, creating default config if missing."""
    with _config_lock:
        if not CONFIG_FILE.exists():
            cfg = _deep_merge(dict(DEFAULT_CONFIG), {})
            cfg["scan_roots"] = get_default_scan_roots()
            _save_config_unlocked(cfg)
            return cfg

        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f)

            merged = _deep_merge(dict(DEFAULT_CONFIG), saved)

            # Ensure scan_roots is a list of valid strings
            if not isinstance(merged.get("scan_roots"), list):
                merged["scan_roots"] = get_default_scan_roots()

            # Clean normalized paths
            merged["scan_roots"] = [os.path.abspath(r) for r in merged["scan_roots"] if r]
            return merged
        except Exception as e:
            logger.warning("Failed to read %s, fallback to defaults: %s", CONFIG_FILE, e)
            cfg = _deep_merge(dict(DEFAULT_CONFIG), {})
            cfg["scan_roots"] = get_default_scan_roots()
            return cfg


def _save_config_unlocked(config_data: Dict[str, Any]) -> Dict[str, Any]:
    """Internal atomic write to config file (caller must hold _config_lock)."""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    current = {}
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                current = json.load(f)
        except Exception:
            current = {}

    current = _deep_merge(current, config_data)

    # Atomic write via unique temporary file in the same directory
    temp_fd, temp_path = tempfile.mkstemp(dir=CONFIG_DIR, prefix="config_", suffix=".tmp")
    try:
        with os.fdopen(temp_fd, "w", encoding="utf-8") as f:
            json.dump(current, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp_path, CONFIG_FILE)
    except Exception:
        if os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except OSError:
                pass
        raise
    return current


def save_config(config_data: Dict[str, Any]) -> Dict[str, Any]:
    """Save full or partial configuration atomically to disk in a thread-safe manner."""
    with _config_lock:
        try:
            return _save_config_unlocked(config_data)
        except Exception as e:
            logger.error("Failed to save config to %s: %s", CONFIG_FILE, e)
            return config_data


def get_scan_roots() -> List[str]:
    """Get persistent scan roots."""
    cfg = load_config()
    roots = cfg.get("scan_roots")
    if not roots or not isinstance(roots, list):
        return get_default_scan_roots()
    return [os.path.abspath(r) for r in roots]


def save_scan_roots(roots: List[str]) -> List[str]:
    """Save user-configured scan roots persistently to disk."""
    valid_roots = []
    seen = set()
    for r in roots:
        if not r or not isinstance(r, str):
            continue
        abs_r = os.path.abspath(r.strip())
        norm = os.path.normcase(abs_r)
        if norm not in seen and os.path.exists(abs_r):
            seen.add(norm)
            valid_roots.append(abs_r)

    save_config({"scan_roots": valid_roots})
    return valid_roots


def get_last_workspace() -> Optional[str]:
    """Retrieve user's last inspected workspace path."""
    cfg = load_config()
    lw = cfg.get("last_workspace")
    if lw and isinstance(lw, str) and lw.strip():
        abs_p = os.path.abspath(lw.strip())
        if os.path.exists(abs_p) and os.path.isdir(abs_p):
            return abs_p
    return None


def save_last_workspace(workspace_path: Optional[str]) -> Optional[str]:
    """Save user's last opened workspace path persistently to disk."""
    if not workspace_path:
        save_config({"last_workspace": None})
        return None
    abs_p = os.path.abspath(workspace_path.strip())
    if os.path.exists(abs_p) and os.path.isdir(abs_p):
        save_config({"last_workspace": abs_p})
        return abs_p
    return None


def get_max_scan_depth() -> int:
    """Get user-configured maximum directory scan depth (default: 3)."""
    cfg = load_config()
    depth = cfg.get("max_depth", 3)
    try:
        return max(1, int(depth))
    except (ValueError, TypeError):
        return 3


def get_scan_timeout_seconds() -> float:
    """Get user-configured scan timeout limit in seconds (default: 30.0)."""
    cfg = load_config()
    timeout = cfg.get("scan_timeout_seconds", 30)
    try:
        return max(5.0, float(timeout))
    except (ValueError, TypeError):
        return 30.0


