"""
Entropy Configuration Manager.

Handles persistent application configuration stored in ~/.entropy/config.json.
Guarantees scan roots, AI provider choices, and user preferences survive app restarts.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger("entropy.config")

CONFIG_DIR = Path.home() / ".entropy"
CONFIG_FILE = CONFIG_DIR / "config.json"


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
    "max_depth": 3,
    "ai": {
        "provider": "rules",  # 'rules' | 'groq' | 'ollama'
        "groq_api_key": "",
        "groq_model": "llama-3.3-70b-versatile",
        "ollama_url": "http://localhost:11434",
        "ollama_model": "llama3.2",
    },
    "preferences": {
        "theme": "dark",
        "auto_refresh_seconds": 0,
    },
}


def load_config() -> Dict[str, Any]:
    """Load configuration from disk, creating default config if missing."""
    if not CONFIG_FILE.exists():
        cfg = dict(DEFAULT_CONFIG)
        cfg["scan_roots"] = get_default_scan_roots()
        save_config(cfg)
        return cfg

    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            saved = json.load(f)

        merged = dict(DEFAULT_CONFIG)
        merged.update(saved)

        # Ensure scan_roots is a list of valid strings
        if not isinstance(merged.get("scan_roots"), list):
            merged["scan_roots"] = get_default_scan_roots()

        # Clean normalized paths
        merged["scan_roots"] = [os.path.abspath(r) for r in merged["scan_roots"] if r]
        return merged
    except Exception as e:
        logger.warning(f"Failed to read {CONFIG_FILE}, fallback to defaults: {e}")
        cfg = dict(DEFAULT_CONFIG)
        cfg["scan_roots"] = get_default_scan_roots()
        return cfg


def save_config(config_data: Dict[str, Any]) -> Dict[str, Any]:
    """Save full or partial configuration atomically to disk."""
    try:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        current = {}
        if CONFIG_FILE.exists():
            try:
                with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                    current = json.load(f)
            except Exception:
                current = {}

        current.update(config_data)

        # Atomic write via temporary file
        temp_file = CONFIG_FILE.with_suffix(".tmp")
        with open(temp_file, "w", encoding="utf-8") as f:
            json.dump(current, f, indent=2)
        os.replace(temp_file, CONFIG_FILE)
        return current
    except Exception as e:
        logger.error(f"Failed to save config to {CONFIG_FILE}: {e}")
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
