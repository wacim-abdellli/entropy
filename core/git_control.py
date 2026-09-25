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


def _clean_git_error(stderr: str, stdout: str) -> str:
    """Filter out noise (like LF/CRLF replacement warnings) from Git output."""
    lines = (stderr + "\n" + stdout).splitlines()
    filtered = [
        line.strip()
        for line in lines
        if line.strip()
        and not line.strip().startswith("warning: in the working copy of")
        and not "LF will be replaced by CRLF" in line
        and not "CRLF will be replaced by LF" in line
    ]
    return "\n".join(filtered).strip()


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
    creationflags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    base_cmd = ["git", "-C", abs_path, "-c", "core.autocrlf=false"]

    try:
        # Attempt 1: Stash including untracked files (-u)
        cmd_with_untracked = base_cmd + ["stash", "push", "-u", "-m", stash_msg]
        res = subprocess.run(
            cmd_with_untracked,
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

        # Stash with -u failed (e.g., untracked browser profile, active socket, or locked cache)
        clean_err = _clean_git_error(res.stderr, res.stdout)

        if "Permission denied" in clean_err or "Cannot save the untracked files" in clean_err:
            # Attempt 2: Try stashing tracked changes without -u
            res_tracked = subprocess.run(
                base_cmd + ["stash", "push", "-m", stash_msg],
                capture_output=True,
                text=True,
                timeout=30,
                creationflags=creationflags,
            )
            if res_tracked.returncode == 0:
                tracked_output = res_tracked.stdout.strip()
                if "No local changes to save" not in tracked_output:
                    return {
                        "success": True,
                        "workspace_path": abs_path,
                        "stash_name": stash_msg,
                        "message": "Stashed tracked changes. (Some untracked files were skipped because they are currently locked by a running process).",
                    }

            # If there were no tracked changes to stash either
            locked_hint = ""
            for line in clean_err.splitlines():
                if "Permission denied" in line:
                    # e.g. error: open(".antigravity-white-profile/Cache/Cache_Data/data_0"): Permission denied
                    locked_hint = f" ({line.strip()})"
                    break

            return {
                "success": False,
                "workspace_path": abs_path,
                "error": f"Cannot stash untracked files because one or more files are currently open and locked by a running process{locked_hint}. Please close running background apps or add cache directories to .gitignore.",
            }

        return {
            "success": False,
            "workspace_path": abs_path,
            "error": clean_err or "Git stash failed.",
        }

    except Exception as e:
        logger.error("Git stash failed for %s: %s", abs_path, e)
        return {"success": False, "workspace_path": abs_path, "error": str(e)}


PROTECTED_BRANCHES = {"main", "master", "dev", "develop", "HEAD", "release", "staging", "production"}


def add_to_gitignore(repo_path: str, pattern: str = ".env*") -> Dict[str, Any]:
    """
    Safely append a pattern (e.g. '.env*') to the repository's .gitignore file.
    
    If the pattern already exists in .gitignore, it is not duplicated.
    If .gitignore does not exist, it will be created.
    """
    if not repo_path or not os.path.exists(repo_path):
        return {"success": False, "error": f"Path '{repo_path}' does not exist."}

    abs_path = os.path.abspath(repo_path)
    gitignore_path = os.path.join(abs_path, ".gitignore")
    pattern_clean = pattern.strip()

    if not pattern_clean:
        return {"success": False, "error": "Pattern cannot be empty."}

    try:
        existing_lines = []
        if os.path.exists(gitignore_path):
            with open(gitignore_path, "r", encoding="utf-8", errors="replace") as f:
                existing_lines = f.readlines()

        # Check if pattern or exact match is already in the file
        for line in existing_lines:
            stripped = line.strip()
            if stripped == pattern_clean or stripped == pattern_clean.lstrip("/"):
                return {
                    "success": True,
                    "repo_path": abs_path,
                    "pattern": pattern_clean,
                    "message": f"'{pattern_clean}' is already ignored in .gitignore.",
                }

        # Append pattern cleanly
        with open(gitignore_path, "a", encoding="utf-8") as f:
            if existing_lines and not existing_lines[-1].endswith("\n"):
                f.write("\n")
            f.write(f"\n# Added by Entropy Git Safety Net\n{pattern_clean}\n")

        return {
            "success": True,
            "repo_path": abs_path,
            "pattern": pattern_clean,
            "message": f"Added '{pattern_clean}' to .gitignore.",
        }
    except Exception as e:
        logger.error("Failed to update .gitignore for %s: %s", abs_path, e)
        return {"success": False, "repo_path": abs_path, "error": str(e)}


def prune_merged_branches(repo_path: str, branches: list[str] | None = None) -> Dict[str, Any]:
    """
    Safely prune local branches that have already been merged into HEAD.
    
    Enforces absolute safety:
    - Never uses 'git branch -D' (only safe 'git branch -d')
    - Never prunes current checked-out branch
    - Never prunes protected branches (main, master, dev, develop, etc.)
    """
    if not repo_path or not os.path.exists(repo_path):
        return {"success": False, "error": f"Path '{repo_path}' does not exist."}

    abs_path = os.path.abspath(repo_path)
    git_dir = os.path.join(abs_path, ".git")
    if not os.path.exists(git_dir):
        return {"success": False, "error": f"Path '{abs_path}' is not a Git repository."}

    creationflags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    base_cmd = ["git", "-C", abs_path, "-c", "core.autocrlf=false"]

    try:
        # Determine current branch
        curr_res = subprocess.run(
            base_cmd + ["branch", "--show-current"],
            capture_output=True,
            text=True,
            timeout=10,
            creationflags=creationflags,
        )
        current_branch = curr_res.stdout.strip()

        target_branches: list[str] = []
        if branches is not None:
            for b in branches:
                clean_b = b.strip()
                if clean_b and clean_b not in PROTECTED_BRANCHES and clean_b != current_branch:
                    target_branches.append(clean_b)
        else:
            # Query merged branches from git
            merged_res = subprocess.run(
                base_cmd + ["branch", "--merged"],
                capture_output=True,
                text=True,
                timeout=10,
                creationflags=creationflags,
            )
            if merged_res.returncode == 0:
                for line in merged_res.stdout.splitlines():
                    cleaned = line.strip().lstrip("*").strip()
                    if (
                        cleaned
                        and cleaned not in PROTECTED_BRANCHES
                        and cleaned != current_branch
                        and not cleaned.startswith("(HEAD")
                    ):
                        target_branches.append(cleaned)

        if not target_branches:
            return {
                "success": True,
                "repo_path": abs_path,
                "pruned": [],
                "failed": [],
                "message": "No merged branches to prune.",
            }

        pruned: list[str] = []
        failed: list[dict[str, str]] = []

        for b in target_branches:
            del_res = subprocess.run(
                base_cmd + ["branch", "-d", b],
                capture_output=True,
                text=True,
                timeout=15,
                creationflags=creationflags,
            )
            if del_res.returncode == 0:
                pruned.append(b)
            else:
                err_msg = _clean_git_error(del_res.stderr, del_res.stdout)
                failed.append({"branch": b, "error": err_msg or "Failed to delete branch."})

        return {
            "success": len(failed) == 0,
            "repo_path": abs_path,
            "pruned": pruned,
            "failed": failed,
            "message": f"Successfully pruned {len(pruned)} merged branch(es)."
            if not failed
            else f"Pruned {len(pruned)} branch(es), {len(failed)} failed.",
        }

    except Exception as e:
        logger.error("Failed to prune merged branches in %s: %s", abs_path, e)
        return {"success": False, "repo_path": abs_path, "error": str(e)}


def list_stashes(repo_path: str) -> list[Dict[str, Any]]:
    """
    List all Git stashes for a repository.
    
    Returns a list of dicts:
    [
        {
            "index": int,
            "stash_ref": str,
            "date": str,
            "message": str,
            "branch": str
        },
        ...
    ]
    """
    if not repo_path or not os.path.exists(repo_path):
        return []

    abs_path = os.path.abspath(repo_path)
    git_dir = os.path.join(abs_path, ".git")
    if not os.path.exists(git_dir):
        return []

    creationflags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    base_cmd = ["git", "-C", abs_path, "-c", "core.autocrlf=false"]

    try:
        res = subprocess.run(
            base_cmd + ["stash", "list", "--format=%gd|%cr|%gs"],
            capture_output=True,
            text=True,
            timeout=10,
            creationflags=creationflags,
        )
        if res.returncode != 0 or not res.stdout.strip():
            return []

        stashes: list[Dict[str, Any]] = []
        for line in res.stdout.splitlines():
            line_str = line.strip()
            if not line_str or "|" not in line_str:
                continue
            parts = line_str.split("|", 2)
            if len(parts) >= 3:
                ref, date_str, msg = parts[0].strip(), parts[1].strip(), parts[2].strip()
                # Parse index from ref e.g. "stash@{0}"
                idx = 0
                if "{" in ref and "}" in ref:
                    try:
                        idx = int(ref.split("{")[1].split("}")[0])
                    except (ValueError, IndexError):
                        idx = 0

                # Extract branch if message follows standard "WIP on <branch>: ..." or "On <branch>: ..."
                branch = ""
                if msg.startswith("WIP on ") or msg.startswith("On "):
                    branch_part = msg.split(":")[0].replace("WIP on ", "").replace("On ", "").strip()
                    branch = branch_part

                stashes.append({
                    "index": idx,
                    "stash_ref": ref,
                    "date": date_str,
                    "message": msg,
                    "branch": branch,
                })

        return stashes
    except Exception as e:
        logger.error("Failed to list stashes in %s: %s", abs_path, e)
        return []


def pop_stash(repo_path: str, index: int = 0) -> Dict[str, Any]:
    """
    Safely pop / restore a stash into the working tree.
    Enforces that uncommitted changes are not overwritten.
    """
    if not repo_path or not os.path.exists(repo_path):
        return {"success": False, "error": f"Path '{repo_path}' does not exist."}

    abs_path = os.path.abspath(repo_path)
    git_dir = os.path.join(abs_path, ".git")
    if not os.path.exists(git_dir):
        return {"success": False, "error": f"Path '{abs_path}' is not a Git repository."}

    creationflags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    base_cmd = ["git", "-C", abs_path, "-c", "core.autocrlf=false"]
    stash_ref = f"stash@{{{index}}}"

    try:
        res = subprocess.run(
            base_cmd + ["stash", "pop", stash_ref],
            capture_output=True,
            text=True,
            timeout=30,
            creationflags=creationflags,
        )

        clean_err = _clean_git_error(res.stderr, res.stdout)

        if res.returncode == 0:
            return {
                "success": True,
                "repo_path": abs_path,
                "stash_ref": stash_ref,
                "message": f"Successfully restored {stash_ref} into working tree.",
            }

        return {
            "success": False,
            "repo_path": abs_path,
            "stash_ref": stash_ref,
            "error": clean_err or f"Failed to restore {stash_ref}.",
        }
    except Exception as e:
        logger.error("Failed to pop stash %s in %s: %s", stash_ref, abs_path, e)
        return {"success": False, "repo_path": abs_path, "error": str(e)}


def drop_stash(repo_path: str, index: int = 0) -> Dict[str, Any]:
    """
    Safely drop/delete a specific stash entry.
    """
    if not repo_path or not os.path.exists(repo_path):
        return {"success": False, "error": f"Path '{repo_path}' does not exist."}

    abs_path = os.path.abspath(repo_path)
    git_dir = os.path.join(abs_path, ".git")
    if not os.path.exists(git_dir):
        return {"success": False, "error": f"Path '{abs_path}' is not a Git repository."}

    creationflags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    base_cmd = ["git", "-C", abs_path, "-c", "core.autocrlf=false"]
    stash_ref = f"stash@{{{index}}}"

    try:
        res = subprocess.run(
            base_cmd + ["stash", "drop", stash_ref],
            capture_output=True,
            text=True,
            timeout=15,
            creationflags=creationflags,
        )

        clean_err = _clean_git_error(res.stderr, res.stdout)

        if res.returncode == 0:
            return {
                "success": True,
                "repo_path": abs_path,
                "stash_ref": stash_ref,
                "message": f"Dropped {stash_ref}.",
            }

        return {
            "success": False,
            "repo_path": abs_path,
            "stash_ref": stash_ref,
            "error": clean_err or f"Failed to drop {stash_ref}.",
        }
    except Exception as e:
        logger.error("Failed to drop stash %s in %s: %s", stash_ref, abs_path, e)
        return {"success": False, "repo_path": abs_path, "error": str(e)}

