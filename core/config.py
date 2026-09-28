"""
Entropy Configuration Manager.

Handles persistent application configuration stored in ~/.entropy/config.json.
Guarantees scan roots, AI provider choices, and user preferences survive app restarts.
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
    candidates = [
        os.path.join(user_home, "Desktop"),
        os.path.join(user_home, "Documents"),
        os.path.join(user_home, "source", "repos"),
        os.path.join(user_home, "projects"),
        os.path.join(user_home, "dev"),
    ]
    existing = [os.path.abspath(c) for c in candidates if os.path.isdir(c)]
    if existing:
        return existing
    return [os.path.abspath(user_home)]


DEFAULT_CONFIG: Dict[str, Any] = {
    "version": 1,
    "scan_roots": None,  # Will be populated with get_default_scan_roots() on first run
    "last_workspace": None,  # Persistent last opened workspace path
    "max_depth": 3,
    "ai": {
        "provider": "cloud",  # 'cloud' | 'rules' | 'ollama'
        "cloud_api_key": "",
        "cloud_model": "qwen/qwen3.8-27b",
        "groq_api_key": "",
        "groq_model": "qwen/qwen3.8-27b",
        "ollama_url": "http://localhost:11434",
        "ollama_model": "llama3.2",
    },
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

