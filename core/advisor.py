"""
Advisor & Safety Engine for Entropy Workstation Orchestrator.

Provides deterministic, zero-dependency safety verdicts, rebuild recipes,
and actionable developer health tips for workspaces and cleanup operations.
"""

from __future__ import annotations

import logging
import os
import time
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class CleanupVerdict:
    path: str
    name: str
    risk: str  # 'safe' | 'review' | 'danger'
    headline: str
    reasons: List[str] = field(default_factory=list)
    rebuild_command: Optional[str] = None
    warnings: List[str] = field(default_factory=list)
    size_bytes: int = 0
    project_path: str = ""


@dataclass
class HealthTip:
    id: str
    title: str
    description: str
    severity: str  # 'info' | 'warning' | 'urgent'
    action_label: Optional[str] = None
    action_type: Optional[str] = None  # 'stash' | 'add_gitignore' | 'prune_branches' | 'clean_artifacts' | 'free_port'
    action_payload: Optional[Dict[str, Any]] = None


@dataclass
class WorkspaceHealth:
    workspace_path: str
    workspace_name: str
    health_score: int  # 0 to 100
    summary: str
    tips: List[HealthTip] = field(default_factory=list)
    cleanup_verdicts: List[CleanupVerdict] = field(default_factory=list)


def _detect_rebuild_command(project_path: str, artifact_name: str) -> Optional[str]:
    """Detect appropriate package manager and rebuild command from repository files."""
    if not os.path.exists(project_path):
        return None

    norm_name = artifact_name.lower()

    if norm_name in ("node_modules", ".next", ".nuxt"):
        if os.path.exists(os.path.join(project_path, "pnpm-lock.yaml")):
            return "pnpm install"
        if os.path.exists(os.path.join(project_path, "yarn.lock")):
            return "yarn install"
        if os.path.exists(os.path.join(project_path, "bun.lockb")) or os.path.exists(os.path.join(project_path, "bun.lock")):
            return "bun install"
        if os.path.exists(os.path.join(project_path, "package-lock.json")):
            return "npm install"
        return "npm install"

    if norm_name == "target":
        return "cargo build"

    if norm_name in (".venv", "venv"):
        if os.path.exists(os.path.join(project_path, "poetry.lock")):
            return "poetry install"
        if os.path.exists(os.path.join(project_path, "Pipfile")):
            return "pipenv install"
        if os.path.exists(os.path.join(project_path, "requirements.txt")):
            return "python -m venv .venv && pip install -r requirements.txt"
        return "python -m venv .venv"

    if norm_name in ("bin", "obj"):
        return "dotnet build"

    if norm_name in ("build", ".dart_tool"):
        if os.path.exists(os.path.join(project_path, "pubspec.yaml")):
            return "flutter pub get"
        return "flutter build"

    if norm_name == ".gradle":
        if os.path.exists(os.path.join(project_path, "gradlew")) or os.path.exists(os.path.join(project_path, "gradlew.bat")):
            return "gradlew build"
        return "gradle build"

    if norm_name in ("__pycache__", ".pytest_cache"):
        return "Automatically regenerated on next test/execution"

    return None


def get_cleanup_verdict(
    artifact_path: str,
    project_path: str,
    running_processes: Optional[List[Dict[str, Any]]] = None,
    has_uncommitted_changes: bool = False,
    size_bytes: int = 0,
) -> CleanupVerdict:
    """
    Produce a deterministic safety verdict for deleting a specific build artifact folder.
    """
    name = os.path.basename(os.path.normpath(artifact_path))
    rebuild_cmd = _detect_rebuild_command(project_path, name)

    warnings: List[str] = []
    reasons: List[str] = []
    risk = "safe"

    # Check 1: Is a process running in this workspace?
    active_procs = []
    if running_processes:
        proj_norm = os.path.normcase(os.path.abspath(project_path))
        for p in running_processes:
            cwd = p.get("cwd")
            if cwd:
                cwd_norm = os.path.normcase(os.path.abspath(cwd))
                if cwd_norm == proj_norm or cwd_norm.startswith(proj_norm + os.sep):
                    active_procs.append(p)

    if active_procs:
        risk = "danger"
        proc_names = ", ".join(f"{p.get('name')} (PID {p.get('pid')})" for p in active_procs[:3])
        warnings.append(f"Active process(es) running from workspace: {proc_names}. Delete will fail or crash active server.")
    else:
        reasons.append("0 active processes running from this workspace directory.")

    # Check 2: Git status
    if has_uncommitted_changes:
        if risk == "safe":
            risk = "review"
        warnings.append("Workspace has uncommitted local changes. Consider stashing changes first.")
    else:
        reasons.append("Working tree has clean Git state or changes are safe.")

    # Check 3: Rebuild ease
    if rebuild_cmd:
        reasons.append(f"Easily rebuildable via: `{rebuild_cmd}`")

    # Format human-readable size
    size_str = f"{size_bytes / (1024*1024):.1f} MB" if size_bytes < 1024**3 else f"{size_bytes / (1024**3):.2f} GB"

    if risk == "safe":
        headline = f"Safe to delete — rebuildable {name} ({size_str})"
    elif risk == "review":
        headline = f"Review needed before deleting {name} ({size_str})"
    else:
        headline = f"Caution: active process using this directory ({size_str})"

    return CleanupVerdict(
        path=artifact_path,
        name=name,
        risk=risk,
        headline=headline,
        reasons=reasons,
        rebuild_command=rebuild_cmd,
        warnings=warnings,
        size_bytes=size_bytes,
        project_path=project_path,
    )


def evaluate_workspace_health(
    workspace_path: str,
    workspace_name: str,
    git_info: Optional[Dict[str, Any]] = None,
    processes: Optional[List[Dict[str, Any]]] = None,
    artifacts: Optional[List[Dict[str, Any]]] = None,
) -> WorkspaceHealth:
    """
    Evaluate workstation health for a specific workspace and generate actionable tips.
    Health score starts at 100 and deductions are applied for hygiene/safety issues.
    """
    score = 100
    tips: List[HealthTip] = []
    verdicts: List[CleanupVerdict] = []

    git_info = git_info or {}
    processes = processes or []
    artifacts = artifacts or []

    # 1. Unprotected & Tracked Secret Files
    secret_issues = git_info.get("secret_issues", [])
    tracked_secrets = [s["path"] for s in secret_issues if s.get("status") == "tracked"]
    unignored_secrets = [s["path"] for s in secret_issues if s.get("status") == "unignored"]
    unprotected_envs = git_info.get("unprotected_env_files", [])

    if tracked_secrets:
        score -= 35
        tips.append(
            HealthTip(
                id="tracked_secret",
                title=f"Critical: {len(tracked_secrets)} Secret(s) Tracked in Git",
                description=f"Secret files ({', '.join(tracked_secrets[:3])}) are committed or staged in Git. Untrack immediately to prevent leaking credentials.",
                severity="urgent",
                action_label="Untrack Secrets",
                action_type="untrack_secret",
                action_payload={"workspace_path": workspace_path, "path": tracked_secrets[0]},
            )
        )
    elif unignored_secrets:
        score -= 25
        tips.append(
            HealthTip(
                id="unprotected_env",
                title="Protect Secrets in .gitignore",
                description=f"Secret files ({', '.join(unignored_secrets[:3])}) are not ignored by Git and could accidentally leak into repository history.",
                severity="urgent",
                action_label="Add to .gitignore",
                action_type="add_gitignore",
                action_payload={"workspace_path": workspace_path, "pattern": ".env*"},
            )
        )
    elif unprotected_envs:
        score -= 25
        tips.append(
            HealthTip(
                id="unprotected_env",
                title="Protect Secrets in .gitignore",
                description=f"Secret files ({', '.join(unprotected_envs)}) are not ignored by Git and could accidentally leak into repository history.",
                severity="urgent",
                action_label="Add to .gitignore",
                action_type="add_gitignore",
                action_payload={"workspace_path": workspace_path, "pattern": ".env*"},
            )
        )

    # 2. Stale Uncommitted Changes
    has_uncommitted = git_info.get("has_uncommitted_changes", False)
    oldest_dirty_ts = git_info.get("oldest_dirty_timestamp")
    dirty_count = git_info.get("dirty_count", 0)

    if has_uncommitted:
        if oldest_dirty_ts:
            age_days = int((time.time() - oldest_dirty_ts) / 86400)
            if age_days >= 3:
                score -= 15
                tips.append(
                    HealthTip(
                        id="stale_wip",
                        title=f"Stale Uncommitted Work ({age_days} days old)",
                        description=f"You have {dirty_count} uncommitted file(s) that have been untouched for {age_days} days. Stash or commit to prevent accidental loss.",
                        severity="warning",
                        action_label="Safe Stash",
                        action_type="stash",
                        action_payload={"workspace_path": workspace_path},
                    )
                )
            else:
                score -= 5
        else:
            score -= 5

    # 3. Merged Branches Accumulation
    merged_branches = git_info.get("merged_branches", [])
    if len(merged_branches) >= 2:
        score -= 10
        tips.append(
            HealthTip(
                id="merged_branches",
                title=f"Prune {len(merged_branches)} Merged Branches",
                description=f"Local branches ({', '.join(merged_branches[:4])}) have already been merged into HEAD and can be safely pruned.",
                severity="info",
                action_label="Prune Merged",
                action_type="prune_branches",
                action_payload={"workspace_path": workspace_path, "branches": merged_branches},
            )
        )

    # 4. Large Inactive Dependencies
    reclaimable_bytes = sum(a.get("size_bytes", 0) for a in artifacts)
    if len(processes) == 0 and reclaimable_bytes > 500 * 1024 * 1024:
        score -= 10
        size_mb = int(reclaimable_bytes / (1024 * 1024))
        tips.append(
            HealthTip(
                id="reclaim_space",
                title=f"Reclaim {size_mb} MB in Build Artifacts",
                description=f"This workspace is currently inactive with {len(artifacts)} build folder(s) consuming {size_mb} MB.",
                severity="info",
                action_label="Clean Artifacts",
                action_type="clean_artifacts",
                action_payload={"workspace_path": workspace_path, "paths": [a.get("path") for a in artifacts if a.get("path")]},
            )
        )

    # 5. Active Listening Ports
    ports = []
    for p in processes:
        if p.get("ports"):
            ports.extend(p["ports"])
    ports = sorted(list(set(ports)))

    if ports:
        tips.append(
            HealthTip(
                id="live_ports",
                title=f"Dev Server Active on Port {', :'.join(str(pt) for pt in ports)}",
                description="Background server is actively listening for HTTP traffic.",
                severity="info",
                action_label="Free Ports" if len(ports) == 1 else None,
                action_type="free_port" if len(ports) == 1 else None,
                action_payload={"port": ports[0]} if len(ports) == 1 else None,
            )
        )

    # Generate verdicts for each artifact
    for a in artifacts:
        a_path = a.get("path", "")
        if a_path:
            v = get_cleanup_verdict(
                artifact_path=a_path,
                project_path=workspace_path,
                running_processes=processes,
                has_uncommitted_changes=has_uncommitted,
                size_bytes=a.get("size_bytes", 0),
            )
            verdicts.append(v)

    score = max(0, min(100, score))

    if score >= 90:
        summary = "Workspace is in optimal condition with clean version control hygiene."
    elif score >= 70:
        summary = "Workspace is in good shape, with minor maintenance opportunities."
    elif score >= 50:
        summary = "Attention recommended: uncommitted work or unignored secrets detected."
    else:
        summary = "Hygiene alert: immediate action recommended to safeguard secrets and avoid data loss."

    return WorkspaceHealth(
        workspace_path=workspace_path,
        workspace_name=workspace_name,
        health_score=score,
        summary=summary,
        tips=tips,
        cleanup_verdicts=verdicts,
    )
