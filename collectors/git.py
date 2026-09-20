"""
Git collector module.

Safely extracts metadata from Git repositories without reading private file contents
or exposing credentials/tokens in remote URLs.
"""

from __future__ import annotations

import logging
import os
import subprocess
from typing import List, Optional
from urllib.parse import urlparse

from core.entities import GitRepository

logger = logging.getLogger(__name__)


def _get_dir_size(path: str) -> int:
    """Calculate the size of a directory in bytes without following symlinks."""
    total_size = 0
    try:
        with os.scandir(path) as it:
            for entry in it:
                try:
                    if entry.is_file(follow_symlinks=False):
                        total_size += entry.stat(follow_symlinks=False).st_size
                    elif entry.is_dir(follow_symlinks=False):
                        total_size += _get_dir_size(entry.path)
                except OSError:
                    pass
    except OSError:
        pass
    return total_size


def _run_git_command(repo_path: str, args: List[str], timeout: int = 5) -> Optional[str]:
    """Run a git command in the repository path and return stripped stdout."""
    try:
        result = subprocess.run(
            ["git"] + args,
            cwd=repo_path,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError) as e:
        logger.debug(f"Git command failed in {repo_path}: {e}")
    return None


def collect_git_repository(repo_path: str) -> Optional[GitRepository]:
    """
    Collect Git metadata for a given repository root directory.
    Returns GitRepository entity or None if not a git repository.
    """
    git_dir = os.path.join(repo_path, ".git")
    if not os.path.isdir(git_dir):
        return None

    repo = GitRepository(
        entity_id=f"git:{os.path.abspath(repo_path)}",
        path=os.path.abspath(repo_path),
    )

    # 1. Size of .git directory
    repo.repo_size_bytes = _get_dir_size(git_dir)

    # 2. Last commit timestamp
    ts_str = _run_git_command(repo_path, ["log", "--format=%at", "-1"])
    if ts_str and ts_str.isdigit():
        repo.last_commit_timestamp = float(ts_str)

    # 3. First commit timestamp (creation of repo history)
    # Using --reverse -1 gets the very first root commit
    first_ts = _run_git_command(repo_path, ["log", "--reverse", "--format=%at", "-1"])
    if first_ts and first_ts.isdigit():
        repo.first_commit_timestamp = float(first_ts)

    # 4. Total commit count
    count_str = _run_git_command(repo_path, ["rev-list", "--count", "HEAD"])
    if count_str and count_str.isdigit():
        repo.commit_count = int(count_str)

    # 5. Current branch
    branch = _run_git_command(repo_path, ["rev-parse", "--abbrev-ref", "HEAD"])
    if branch:
        repo.current_branch = branch

    # 6. Branch count
    branches_out = _run_git_command(repo_path, ["branch", "--list"])
    if branches_out:
        repo.branch_count = len([line for line in branches_out.splitlines() if line.strip()])

    # 7. Uncommitted changes (porcelain status)
    status_out = _run_git_command(repo_path, ["status", "--porcelain"])
    if status_out is not None:
        repo.has_uncommitted_changes = len(status_out.strip()) > 0

    # 8. Remotes - extract hostname only for privacy
    remotes_out = _run_git_command(repo_path, ["remote"])
    if remotes_out:
        first_remote = remotes_out.splitlines()[0].strip()
        repo.has_remote = True
        remote_url_out = _run_git_command(repo_path, ["remote", "get-url", first_remote])
        if remote_url_out:
            url = remote_url_out.strip()
            # Handle SSH format: git@github.com:user/repo.git
            if url.startswith("git@") or (":" in url and not url.startswith("http")):
                try:
                    host = url.split("@")[-1].split(":")[0]
                    repo.remote_host = host
                    path_part = url.split(":")[-1].rstrip(".git").strip("/")
                    repo.remote_repo_id = f"{host}/{path_part}"
                except IndexError:
                    pass
            else:
                # HTTP/HTTPS format
                parsed = urlparse(url)
                if parsed.hostname:
                    repo.remote_host = parsed.hostname
                    path_part = parsed.path.rstrip(".git").strip("/")
                    repo.remote_repo_id = f"{parsed.hostname}/{path_part}"

    return repo
