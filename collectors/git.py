"""
Git collector module.

Safely extracts metadata from Git repositories without reading private file contents
or exposing credentials/tokens in remote URLs.
"""

from __future__ import annotations

import logging
import os
import subprocess
from typing import Any, Dict, List, Optional, Set, Tuple
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
        creationflags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        result = subprocess.run(
            ["git"] + args,
            cwd=repo_path,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
            creationflags=creationflags,
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError) as e:
        logger.debug(f"Git command failed in {repo_path}: {e}")
    return None


_SECRET_SCAN_SKIP_DIRS = {
    ".git",
    "node_modules",
    "venv",
    ".venv",
    "env",
    "target",
    "dist",
    "build",
    ".next",
    ".nuxt",
    "out",
    "coverage",
    "__pycache__",
    ".pytest_cache",
    ".dart_tool",
    "bin",
    "obj",
    ".gradle",
    "vendor",
    ".turbo",
    ".cache",
    "tmp",
    ".temp",
}

_SECRET_IGNORE_EXTS = (
    ".example",
    ".sample",
    ".template",
    ".dist",
    ".defaults",
    ".schema",
    ".pub",
    ".md",
    ".txt",
    ".rst",
    ".lock",
)


def _is_secret_candidate(filename: str) -> Optional[str]:
    """
    Check if a filename looks like an env file, private key, or credential.
    Returns category ('env', 'private_key', 'credential') or None.
    """
    lower = filename.lower()
    for ignored in _SECRET_IGNORE_EXTS:
        if lower.endswith(ignored):
            return None

    # .env files (e.g. .env, .env.local, .env.development, .env.production)
    if lower == ".env" or lower.startswith(".env."):
        return "env"

    # Private keys, certificates & key stores
    if lower.endswith((".pem", ".key", ".pfx", ".p12", ".keystore", ".jks")):
        return "private_key"
    if lower in ("id_rsa", "id_ed25519", "id_ecdsa", "id_dsa"):
        return "private_key"

    # Credential and service account files
    if (lower.startswith("service-account") or lower.startswith("service_account")) and lower.endswith(".json"):
        return "credential"
    if "credential" in lower and lower.endswith(".json"):
        return "credential"
    if lower.startswith("client_secret") and lower.endswith(".json"):
        return "credential"
    if lower.startswith("firebase-adminsdk") and lower.endswith(".json"):
        return "credential"

    return None


def _scan_secret_issues(repo_path: str) -> Tuple[List[Dict[str, Any]], List[str]]:
    """
    Scan for secret files across repository root and immediate subfolders.
    Cross-references disk state with Git index and .gitignore to determine
    exact protection status:
      - 'tracked': Committed or staged in Git index (High risk)
      - 'unignored': Present on disk, not tracked, but NOT in .gitignore (Medium risk)
      - 'protected': Safely ignored by .gitignore (Safe)
    Returns (secret_issues, unprotected_env_files).
    """
    disk_candidates: Set[str] = set()

    # 1. Scan root and depth-1 / depth-2 subfolders for disk candidates
    try:
        with os.scandir(repo_path) as root_it:
            for entry in root_it:
                try:
                    if entry.is_file(follow_symlinks=False):
                        if _is_secret_candidate(entry.name):
                            disk_candidates.add(entry.name)
                    elif entry.is_dir(follow_symlinks=False) and entry.name not in _SECRET_SCAN_SKIP_DIRS:
                        sub_path = entry.path
                        with os.scandir(sub_path) as sub_it:
                            for sub_entry in sub_it:
                                try:
                                    rel1 = f"{entry.name}/{sub_entry.name}".replace("\\", "/")
                                    if sub_entry.is_file(follow_symlinks=False):
                                        if _is_secret_candidate(sub_entry.name):
                                            disk_candidates.add(rel1)
                                    elif sub_entry.is_dir(follow_symlinks=False) and sub_entry.name not in _SECRET_SCAN_SKIP_DIRS:
                                        with os.scandir(sub_entry.path) as sub2_it:
                                            for sub2_entry in sub2_it:
                                                try:
                                                    if sub2_entry.is_file(follow_symlinks=False):
                                                        if _is_secret_candidate(sub2_entry.name):
                                                            rel2 = f"{entry.name}/{sub_entry.name}/{sub2_entry.name}".replace("\\", "/")
                                                            disk_candidates.add(rel2)
                                                except OSError:
                                                    pass
                                except OSError:
                                    pass
                except OSError:
                    pass
    except OSError:
        pass

    # 2. Query Git index for tracked secret patterns across repository
    tracked_files: Set[str] = set()
    ls_patterns = [
        "*.env*",
        "*.pem",
        "*.key",
        "*.pfx",
        "*.p12",
        "*credential*.json",
        "*service-account*.json",
        "*service_account*.json",
        "*firebase-adminsdk*.json",
        "*client_secret*.json",
        "id_rsa*",
        "id_ed25519*",
    ]
    ls_out = _run_git_command(repo_path, ["ls-files"] + ls_patterns)
    if ls_out:
        for line in ls_out.splitlines():
            p = line.strip().replace("\\", "/")
            if p and _is_secret_candidate(os.path.basename(p)):
                tracked_files.add(p)

    all_paths = sorted(list(disk_candidates | tracked_files))
    if not all_paths:
        return [], []

    # 3. Batch check-ignore for disk files that are not already tracked in git
    untracked_candidates = [p for p in all_paths if p not in tracked_files]
    ignored_set: Set[str] = set()
    if untracked_candidates:
        for i in range(0, len(untracked_candidates), 50):
            chunk = untracked_candidates[i : i + 50]
            check_out = _run_git_command(repo_path, ["check-ignore"] + chunk)
            if check_out:
                for line in check_out.splitlines():
                    clean_line = line.strip().replace("\\", "/")
                    if clean_line:
                        ignored_set.add(clean_line)

    # 4. Classify each candidate
    secret_issues: List[Dict[str, Any]] = []
    unprotected_envs: List[str] = []

    for path in all_paths:
        cat = _is_secret_candidate(os.path.basename(path)) or "credential"
        if path in tracked_files:
            status = "tracked"
            risk = "high"
            action = "untrack"
        elif path in ignored_set:
            status = "protected"
            risk = "safe"
            action = None
        else:
            status = "unignored"
            risk = "medium"
            action = "ignore"

        secret_issues.append({
            "path": path,
            "name": os.path.basename(path),
            "category": cat,
            "status": status,
            "risk": risk,
            "action": action,
        })

        if cat == "env" and status in ("tracked", "unignored"):
            unprotected_envs.append(path)

    risk_rank = {"high": 0, "medium": 1, "safe": 2}
    secret_issues.sort(key=lambda x: (risk_rank.get(x["risk"], 3), x["path"]))

    return secret_issues, unprotected_envs


def collect_git_repository(repo_path: str) -> Optional[GitRepository]:
    """
    Collect Git metadata for a given repository root directory.
    Supports both traditional .git directories and git worktree file pointers.
    Returns GitRepository entity or None if not a git repository.
    """
    git_entry = os.path.join(repo_path, ".git")
    if not os.path.exists(git_entry):
        return None

    is_worktree = os.path.isfile(git_entry)
    parent_repo: Optional[str] = None

    if is_worktree:
        # Try to resolve common parent repository via git CLI first
        common_dir = _run_git_command(repo_path, ["rev-parse", "--git-common-dir"])
        if common_dir:
            norm_common = os.path.normpath(os.path.join(repo_path, common_dir))
            parent_repo = os.path.dirname(norm_common)
        else:
            # Fallback: parse gitdir: line in .git file
            try:
                with open(git_entry, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read().strip()
                    if content.startswith("gitdir:"):
                        target = content[len("gitdir:"):].strip()
                        norm_target = os.path.normpath(os.path.join(repo_path, target))
                        if ".git" in norm_target:
                            parent_repo = norm_target.split(".git")[0].rstrip(os.sep)
            except OSError:
                pass

    repo = GitRepository(
        entity_id=f"git:{os.path.abspath(repo_path)}",
        path=os.path.abspath(repo_path),
        is_worktree=is_worktree,
        worktree_parent_repo=parent_repo,
    )

    # 1. Size of .git metadata
    if is_worktree:
        try:
            repo.repo_size_bytes = os.path.getsize(git_entry)
        except OSError:
            repo.repo_size_bytes = 0
    else:
        repo.repo_size_bytes = _get_dir_size(git_entry)

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
    elif repo.last_commit_timestamp is None:
        repo.commit_count = 0

    # 5. Current branch
    branch = _run_git_command(repo_path, ["rev-parse", "--abbrev-ref", "HEAD"])
    if branch and branch != "HEAD":
        repo.current_branch = branch
    else:
        # Fallback: check .git/HEAD for symbolic ref (e.g. ref: refs/heads/main)
        head_file = os.path.join(repo_path, ".git", "HEAD") if not is_worktree else None
        if head_file and os.path.exists(head_file):
            try:
                with open(head_file, "r", encoding="utf-8", errors="ignore") as f:
                    ref_line = f.read().strip()
                    if ref_line.startswith("ref: refs/heads/"):
                        repo.current_branch = ref_line.split("refs/heads/")[-1]
            except OSError:
                pass
        if not repo.current_branch:
            repo.current_branch = "HEAD (detached)" if branch == "HEAD" else None

    # 6. Branch count
    branches_out = _run_git_command(repo_path, ["branch", "--list"])
    if branches_out:
        repo.branch_count = len([line for line in branches_out.splitlines() if line.strip()])

    # 7. Uncommitted changes (porcelain status)
    status_out = _run_git_command(repo_path, ["status", "--porcelain"])
    if status_out is not None:
        lines = [l for l in status_out.splitlines() if l.strip()]
        repo.has_uncommitted_changes = len(lines) > 0
        repo.dirty_count = len(lines)
        dirty: list[dict[str, str]] = []
        oldest_ts: Optional[float] = None
        for line in lines[:20]:
            parts = line.split(None, 1)
            if len(parts) != 2:
                continue
            code, path_str = parts[0], parts[1].strip().strip('"')
            path_str = path_str.replace("\\", "/")
            full_file_path = os.path.join(repo_path, path_str.replace("/", os.sep))
            if os.path.exists(full_file_path):
                try:
                    mtime = os.path.getmtime(full_file_path)
                    if oldest_ts is None or mtime < oldest_ts:
                        oldest_ts = mtime
                except OSError:
                    pass
            if "??" in code:
                status_type = "untracked"
            elif "D" in code:
                status_type = "deleted"
            elif "A" in code:
                status_type = "added"
            elif "R" in code:
                status_type = "renamed"
            else:
                status_type = "modified"
            dirty.append({"status": status_type, "path": path_str})
        repo.dirty_files = dirty
        repo.oldest_dirty_timestamp = oldest_ts

    # 8. Secret & .env Leak Shield: comprehensive detection across repository
    issues, unprotected = _scan_secret_issues(repo_path)
    repo.secret_issues = issues
    repo.unprotected_env_files = unprotected

    # 9. Merged local branches (safe to prune)
    merged_out = _run_git_command(repo_path, ["branch", "--merged"])
    if merged_out:
        merged_list = []
        protected_branches = {"main", "master", "dev", "develop", "HEAD"}
        for line in merged_out.splitlines():
            cleaned = line.strip().lstrip("*").strip()
            if cleaned and cleaned not in protected_branches and not cleaned.startswith("(HEAD"):
                if repo.current_branch and cleaned == repo.current_branch:
                    continue
                merged_list.append(cleaned)
        repo.merged_branches = merged_list

    # 10. Remotes - extract hostname only for privacy
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
