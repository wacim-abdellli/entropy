"""
Git Control module for Entropy Workstation Orchestrator.

Provides safe, audited Git management operations:
- Safe Stash (`git stash push -m "Entropy Safe Stash..."`)
- Branch status inspection
- Uncommitted change safety checks

Enforces zero-data-loss boundaries:
- Never force resets (`git reset --hard`)
- Never forcefully deletes branches (`git branch -D`)
- Only performs non-destructive stashing and status queries
"""

from __future__ import annotations

import logging
import os
import subprocess
import time
from typing import Any, Dict

logger = logging.getLogger(__name__)


def safe_stash_workspace(workspace_path: str, message: str | None = None) -> Dict[str, Any]:
    """
    Safely stashes uncommitted local changes in a Git workspace.
    
    Returns a result dict:
    {
        "success": bool,
        "workspace_path": str,
        "stash_name": str,
        "message": str,
        "error": Optional[str]
    }
    """
    if not workspace_path or not os.path.exists(workspace_path):
        return {"success": False, "error": f"Workspace path '{workspace_path}' does not exist."}

    abs_path = os.path.abspath(workspace_path)
    git_dir = os.path.join(abs_path, ".git")

    if not os.path.exists(git_dir):
        return {"success": False, "error": f"Path '{abs_path}' is not a Git repository."}

    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    stash_msg = message or f"Entropy Safe Stash — {timestamp}"

    try:
        cmd = ["git", "-C", abs_path, "stash", "push", "-u", "-m", stash_msg]
        creationflags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        res = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30,
            creationflags=creationflags,
        )

        if res.returncode == 0:
            output = res.stdout.strip()
            if "No local changes to save" in output:
                return {
                    "success": True,
                    "workspace_path": abs_path,
                    "stash_name": stash_msg,
                    "message": "No local changes to save.",
                }
            return {
                "success": True,
                "workspace_path": abs_path,
                "stash_name": stash_msg,
                "message": f"Successfully stashed working tree: '{stash_msg}'.",
            }
        else:
            return {
                "success": False,
                "workspace_path": abs_path,
                "error": res.stderr.strip() or res.stdout.strip() or "Git stash failed.",
            }
    except Exception as e:
        logger.error("Git stash failed for %s: %s", abs_path, e)
        return {"success": False, "workspace_path": abs_path, "error": str(e)}
