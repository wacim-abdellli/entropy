"""
Focused workspace inspection report formatter.

Formats the graph footprint of a single targeted workspace into the strict 6-section schema:
IDENTITY
STATE
CONNECTIONS
EVIDENCE
UNCERTAINTY
ACTION BOUNDARY
"""

from __future__ import annotations

import os
import time
from typing import List, Optional

from core.entities import (
    ActivityLevel,
    CacheDirectory,
    DependencyEnvironment,
    DockerContainer,
    GitRepository,
    Process,
    Project,
    RuntimeInstallation,
)
from core.findings import Finding, FindingSeverity
from core.graph import EnvironmentGraph, RelationshipType
from linkers.relationships import _is_subpath
from report.text import _format_size, _format_time_ago, _truncate_path


def format_inspect_report(
    target_project: Project,
    graph: EnvironmentGraph,
    findings: List[Finding],
) -> str:
    """Format a targeted workspace inspection report."""
    lines: List[str] = []
    now = time.time()

    # 1. Connected Entities
    git_rels = [
        r for r in graph.get_relationships_from(target_project.entity_id)
        if r.rel_type == RelationshipType.CONTAINS and r.target_id.startswith("git:")
    ]
    git_repo: Optional[GitRepository] = (
        graph.get_entity(git_rels[0].target_id) if git_rels else None  # type: ignore
    )

    dep_rels = [
        r for r in graph.get_relationships_from(target_project.entity_id)
        if r.rel_type == RelationshipType.CONTAINS and r.target_id.startswith("dep:")
    ]
    deps: List[DependencyEnvironment] = [
        graph.get_entity(r.target_id) for r in dep_rels if isinstance(graph.get_entity(r.target_id), DependencyEnvironment)  # type: ignore
    ]

    proc_rels = [
        r for r in graph.get_relationships_to(target_project.entity_id)
        if r.rel_type == RelationshipType.RUNS_FROM
    ]
    procs: List[Process] = [
        graph.get_entity(r.source_id) for r in proc_rels if isinstance(graph.get_entity(r.source_id), Process)  # type: ignore
    ]

    docker_rels = [
        r for r in graph.get_relationships_to(target_project.entity_id)
        if r.rel_type == RelationshipType.BIND_MOUNTS
    ]
    containers: List[DockerContainer] = [
        graph.get_entity(r.source_id) for r in docker_rels if isinstance(graph.get_entity(r.source_id), DockerContainer)  # type: ignore
    ]

    # Runtimes linked
    rt_rels = [
        r for r in graph.get_relationships_from(target_project.entity_id)
        if r.rel_type == RelationshipType.USES_RUNTIME
    ]
    runtimes: List[RuntimeInstallation] = [
        graph.get_entity(r.target_id) for r in rt_rels if isinstance(graph.get_entity(r.target_id), RuntimeInstallation)  # type: ignore
    ]

    # Relevant caches
    all_caches = [e for e in graph.entities.values() if isinstance(e, CacheDirectory)]

    active_runtime_procs = [p for p in procs if not p.is_shell]
    idle_shells = [p for p in procs if p.is_shell]

    # Check for severed/broken Docker mount
    has_severed_docker = False
    for c in containers:
        is_missing_mount = any(
            (_is_subpath(m, target_project.path) or _is_subpath(target_project.path, m)) and not os.path.exists(m)
            for m in c.bind_mounts
        )
        if is_missing_mount or any("ghost_container" in f.id for f in findings if (c.entity_id in f.entities_involved or target_project.entity_id in f.entities_involved)):
            has_severed_docker = True
            break

    # -------------------------------------------------------------------------
    # 1. IDENTITY
    # -------------------------------------------------------------------------
    lines.append("IDENTITY")
    name = os.path.basename(target_project.path)
    lines.append(f"  Name:                 {name}")
    lines.append(f"  Path:                 {target_project.path}")
    type_str = target_project.project_type.value.capitalize()
    size_str = _format_size(target_project.total_size_bytes)
    lines.append(f"  Type:                 {type_str}")
    lines.append(f"  Total Size:           {size_str}")
    if target_project.runtime_version_hint:
        lines.append(f"  Runtime Version Hint: {target_project.runtime_version_hint}")
    lines.append("")

    # -------------------------------------------------------------------------
    # 2. STATE
    # -------------------------------------------------------------------------
    lines.append("STATE")
    # State determination without judgmental language
    if has_severed_docker:
        state_title = "Disconnected Infrastructure"
        state_desc = "Docker container references a host mount or volume that is disconnected from filesystem reality."
    elif git_repo and git_repo.is_worktree:
        state_title = "Git Worktree"
        state_desc = f"Linked worktree of repository '{git_repo.remote_repo_id or 'parent'}' on branch '{git_repo.current_branch}'."
    elif active_runtime_procs:
        proc_str = ", ".join(f"{p.name} (PID {p.pid})" for p in active_runtime_procs)
        if git_repo and git_repo.last_commit_timestamp and (now - git_repo.last_commit_timestamp) > 30 * 86400:
            state_title = "Active Runtime"
            state_desc = f"Active processes ({proc_str}) executing from this directory despite older Git commit timestamps."
        else:
            state_title = "Active Development Session"
            state_desc = f"Actively executing processes running from this workspace ({proc_str})."
    elif idle_shells and not active_runtime_procs:
        shell_str = ", ".join(f"{s.name} (PID {s.pid})" for s in idle_shells)
        state_title = "Idle Terminal Open (Code Inactive)"
        state_desc = f"Interactive shell ({shell_str}) has cwd in this directory, but no runtime or compiler is active."
    elif git_repo and git_repo.has_uncommitted_changes and target_project.activity in (ActivityLevel.STALE, ActivityLevel.DORMANT):
        state_title = "Uncommitted Local State"
        state_desc = (
            f"No commits for {_format_time_ago(git_repo.last_commit_timestamp, now)}; "
            f"working tree contains uncommitted or untracked local modifications with 0 running processes."
        )
    elif target_project.activity in (ActivityLevel.STALE, ActivityLevel.DORMANT):
        if git_repo:
            state_title = "Dormant / Static Codebase"
            state_desc = f"Clean working tree; no Git commits for {_format_time_ago(git_repo.last_commit_timestamp, now)}."
        else:
            state_title = "Dormant / Static Codebase (Unversioned)"
            state_desc = f"No recent filesystem activity ({_format_time_ago(target_project.last_modified, now)}); unversioned directory."
    elif target_project.activity == ActivityLevel.INACTIVE:
        state_title = "Paused / Intermittent Project"
        state_desc = "No activity in the last 30–180 days; normal development pause with clean working state."
    else:
        state_title = "Active / Current Codebase"
        state_desc = "Recent modifications or commits observed within the last 30 days."

    lines.append(f"  Status:               {state_title}")
    lines.append(f"  Summary:              {state_desc}")
    lines.append("")

    # -------------------------------------------------------------------------
    # 3. CONNECTIONS
    # -------------------------------------------------------------------------
    lines.append("CONNECTIONS")
    # Git
    if git_repo:
        wt_note = " [Worktree]" if git_repo.is_worktree else ""
        remote_note = f" (Remote: {git_repo.remote_repo_id})" if git_repo.remote_repo_id else ""
        lines.append(f"  • Git:                Repository{wt_note} on branch '{git_repo.current_branch}'{remote_note}")
    else:
        lines.append("  • Git:                None (unversioned directory)")

    # Processes
    if procs:
        proc_items = [f"{p.name} (PID {p.pid}, RSS {_format_size(p.memory_bytes)})" for p in procs]
        lines.append(f"  • Processes ({len(procs)}):      {', '.join(proc_items)}")
    else:
        lines.append("  • Processes:          0 active processes running from this path")

    # Runtimes
    if runtimes:
        rt_items = [f"{r.runtime} {r.version}" for r in runtimes]
        lines.append(f"  • Runtimes:           {', '.join(rt_items)}")
    else:
        lines.append("  • Runtimes:           No specific runtime version pinned")

    # Docker
    if containers:
        c_items = [f"{c.name} [{c.state.value}] ({c.image})" for c in containers]
        lines.append(f"  • Docker:             {', '.join(c_items)}")
    else:
        lines.append("  • Docker:             0 containers or volumes connected")

    # Dependencies
    if deps:
        dep_items = [f"{d.dep_type} ({_format_size(d.size_bytes)})" for d in deps]
        lines.append(f"  • Dependencies:       {', '.join(dep_items)}")
    else:
        lines.append("  • Dependencies:       None materialized on disk")

    # Caches
    matching_caches = [
        c for c in all_caches
        if (c.category == "npm" and target_project.project_type.value == "node") or
           (c.category == "nuget" and target_project.project_type.value == "dotnet") or
           (c.category in ("maven", "gradle") and target_project.project_type.value == "java")
    ]
    if matching_caches:
        c_items = [f"{c.category} ({_format_size(c.size_bytes)})" for c in matching_caches]
        lines.append(f"  • Toolchain Caches:   {', '.join(c_items)}")
    lines.append("")

    # -------------------------------------------------------------------------
    # 4. EVIDENCE
    # -------------------------------------------------------------------------
    lines.append("EVIDENCE")
    if git_repo:
        last_commit_str = _format_time_ago(git_repo.last_commit_timestamp, now)
        lines.append(f"  • Git Branch:         {git_repo.current_branch}")
        lines.append(f"  • Last Commit:        {last_commit_str} ({git_repo.commit_count or 'unknown'} commits in HEAD history)")
        uncommitted_str = "YES (uncommitted file modifications detected in working tree)" if git_repo.has_uncommitted_changes else "No (working tree is clean)"
        lines.append(f"  • Uncommitted Files:  {uncommitted_str}")
        lines.append(f"  • Remote Origin:      {git_repo.remote_repo_id or git_repo.remote_host or 'None (local only)'}")
        if git_repo.is_worktree:
            lines.append(f"  • Worktree Parent:    {git_repo.worktree_parent_repo or 'Linked parent repo'}")
    else:
        lines.append("  • Git Metadata:       No .git directory or worktree pointer found")
        lines.append(f"  • Filesystem Mtime:   {_format_time_ago(target_project.last_modified, now)}")

    if procs:
        for p in procs:
            role = "Interactive Shell" if p.is_shell else "Active Process"
            lines.append(f"  • Process:            {p.name} (PID {p.pid}) [{role}] cwd={p.cwd or target_project.path}")

    if containers:
        for c in containers:
            lines.append(f"  • Docker Container:   '{c.name}' (ID: {c.container_id[:12]}) state={c.state.value} mounts={c.bind_mounts}")

    for d in deps:
        lines.append(f"  • Dependency Folder:  {d.dep_type} at {d.path} ({_format_size(d.size_bytes)})")
    lines.append("")

    # -------------------------------------------------------------------------
    # 5. UNCERTAINTY
    # -------------------------------------------------------------------------
    lines.append("UNCERTAINTY")
    unc_start_len = len(lines)
    if has_severed_docker:
        lines.append("  ? Container may be stopped temporarily, or the mounted host path may reside on an unmounted volume.")
    if git_repo and git_repo.has_uncommitted_changes:
        lines.append("  ? Local modifications exist, but Entropy cannot determine whether they represent valuable human work or generated artifacts.")
    if git_repo and not git_repo.has_uncommitted_changes and target_project.activity in (ActivityLevel.INACTIVE, ActivityLevel.STALE, ActivityLevel.DORMANT):
        lines.append("  ? Absence of recent Git activity does not indicate abandonment; completed or stable reference code naturally remains static.")
    if active_runtime_procs:
        lines.append("  ? Process execution confirms running code, but Entropy cannot determine if it is an active developer session or an unattended background service.")
    if idle_shells and not active_runtime_procs:
        lines.append("  ? An open shell terminal indicates a navigation point, but absence of child processes indicates no build or compiler task is executing.")
    if not git_repo:
        lines.append("  ? In the absence of Git metadata, commit recency, author identity, and development intent cannot be independently verified.")
    if len(lines) == unc_start_len:
        lines.append("  ? No conflicting signals detected; developer intent cannot be inferred from static filesystem state alone.")
    lines.append("")

    # -------------------------------------------------------------------------
    # 6. ACTION BOUNDARY
    # -------------------------------------------------------------------------
    lines.append("ACTION BOUNDARY")
    lines.append("  Entropy is read-only and performs zero automatic cleanup or remediation.")
    lines.append("  Recommended manual verification before making any modifications:")
    if has_severed_docker:
        c_names = ", ".join(c.name for c in containers)
        lines.append(f"  1. Review container ({c_names}) bind-mounts pointing to non-existent or severed paths.")
        lines.append("  2. Run 'docker inspect' or recreate missing directories before attempting to restart container.")
        lines.append("  3. Prune container with 'docker rm' if the infrastructure is no longer needed.")
    elif git_repo and git_repo.has_uncommitted_changes:
        lines.append("  1. Run 'git status' and 'git diff' inside this directory to inspect modified/untracked files.")
        lines.append("  2. Verify whether changes are valuable code edits or disposable build logs/residue.")
        lines.append("  3. Check if the current branch exists on remote ('git branch -r') before deleting or archiving.")
    elif active_runtime_procs:
        pids_str = ", ".join(str(p.pid) for p in active_runtime_procs)
        lines.append(f"  1. Review running process PID(s): {pids_str} in Task Manager before terminating or moving files.")
        lines.append("  2. Verify if processes were started deliberately as local services or left running in background.")
    elif git_repo and not git_repo.has_uncommitted_changes:
        lines.append("  1. Working tree is clean. Dependencies (if any) can be safely cleared with package manager commands.")
        lines.append("  2. Verify remote repository sync ('git fetch --dry-run') before archiving or pruning.")
    else:
        lines.append("  1. Workspace is unversioned. Inspect directory contents manually before moving or deleting.")
        lines.append("  2. Initialize version control with 'git init' if this codebase contains valuable work.")
    lines.append("")

    return "\n".join(lines)
