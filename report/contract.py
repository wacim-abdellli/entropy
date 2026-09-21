"""
Machine-Readable JSON API Contract for Entropy Desktop.

Provides stable, structured schema serialization for:
1. Workspace Inspection (`serialize_workspace_inspection`)
2. Environment Overview (`serialize_environment_overview`)

This module is the single source of truth for the contract between
the Entropy Python engine and the desktop UI.
"""

from __future__ import annotations

import os
import time
from dataclasses import asdict
from typing import Any, Dict, List, Optional

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
from core.findings import Finding
from core.graph import EnvironmentGraph, RelationshipType
from linkers.relationships import _is_subpath
from report.text import _format_size, _format_time_ago


def get_workspace_state_and_category(
    target_project: Project,
    graph: EnvironmentGraph,
    findings: List[Finding],
    now: Optional[float] = None,
) -> tuple[str, str, str, List[str]]:
    """
    Determine state title, summary description, category, and causal 'why' factors.

    Returns:
        (state_title, state_desc, category, why_factors)
        category is one of: "active" | "attention" | "dormant" | "paused" | "neutral"
    """
    if now is None:
        now = time.time()

    # Connected entities
    git_rels = [
        r for r in graph.get_relationships_from(target_project.entity_id)
        if r.rel_type == RelationshipType.CONTAINS and r.target_id.startswith("git:")
    ]
    git_repo: Optional[GitRepository] = (
        graph.get_entity(git_rels[0].target_id) if git_rels else None  # type: ignore
    )

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

    active_runtime_procs = [p for p in procs if not p.is_shell]
    idle_shells = [p for p in procs if p.is_shell]

    # Check for severed/broken Docker mount
    has_severed_docker = False
    severed_mount_paths: List[str] = []
    for c in containers:
        for m in c.bind_mounts:
            if (_is_subpath(m, target_project.path) or _is_subpath(target_project.path, m)) and not os.path.exists(m):
                has_severed_docker = True
                severed_mount_paths.append(m)
        if any("ghost_container" in f.id for f in findings if (c.entity_id in f.entities_involved or target_project.entity_id in f.entities_involved)):
            has_severed_docker = True

    why_factors: List[str] = []

    if has_severed_docker:
        state_title = "Disconnected Infrastructure"
        state_desc = "Docker container references a host mount or volume that is disconnected from filesystem reality."
        category = "attention"
        why_factors.append(f"Docker container references missing host mount(s): {', '.join(severed_mount_paths) if severed_mount_paths else 'unresolved path'}")
        if containers:
            why_factors.append(f"Container '{containers[0].name}' state is {containers[0].state.value}")

    elif git_repo and git_repo.is_worktree:
        state_title = "Git Worktree"
        state_desc = f"Linked worktree of repository '{git_repo.remote_repo_id or 'parent'}' on branch '{git_repo.current_branch}'."
        category = "neutral"
        why_factors.append(f".git entry is a worktree pointer linked to '{git_repo.worktree_parent_repo or 'parent repository'}'")
        why_factors.append(f"Checked out on branch '{git_repo.current_branch or 'HEAD'}'")

    elif git_repo and git_repo.commit_count == 0 and git_repo.last_commit_timestamp is None:
        state_title = "Empty / Newly Initialized Repository"
        state_desc = "Git repository initialized, but no commits have been made yet."
        category = "neutral"
        why_factors.append("Git repository initialized on disk (.git directory present)")
        why_factors.append("0 commits recorded in HEAD history")

    elif active_runtime_procs:
        proc_str = ", ".join(f"{p.name} (PID {p.pid})" for p in active_runtime_procs)
        if git_repo and git_repo.last_commit_timestamp and (now - git_repo.last_commit_timestamp) > 30 * 86400:
            state_title = "Active Runtime"
            state_desc = f"Active processes ({proc_str}) executing from this directory despite older Git commit timestamps."
            category = "active"
            why_factors.append(f"Active compiler or runtime process executing from directory ({proc_str})")
            why_factors.append(f"Last Git commit was {_format_time_ago(git_repo.last_commit_timestamp, now)} (runtime overrides inactivity)")
        else:
            state_title = "Active Development Session"
            state_desc = f"Actively executing processes running from this workspace ({proc_str})."
            category = "active"
            why_factors.append(f"Active executing process(es): {proc_str}")
            if git_repo and git_repo.last_commit_timestamp:
                why_factors.append(f"Recent Git commit recorded ({_format_time_ago(git_repo.last_commit_timestamp, now)})")

    elif idle_shells and not active_runtime_procs:
        shell_str = ", ".join(f"{s.name} (PID {s.pid})" for s in idle_shells)
        state_title = "Idle Terminal Open (Code Inactive)"
        state_desc = f"Interactive shell ({shell_str}) has cwd in this directory, but no runtime or compiler is active."
        category = "neutral"
        why_factors.append(f"Interactive shell terminal open in workspace ({shell_str})")
        why_factors.append("No active build, runtime, or test process detected")

    elif git_repo and git_repo.has_uncommitted_changes and target_project.activity in (ActivityLevel.STALE, ActivityLevel.DORMANT):
        state_title = "Uncommitted Local State"
        state_desc = (
            f"No commits for {_format_time_ago(git_repo.last_commit_timestamp, now)}; "
            f"working tree contains uncommitted or untracked local modifications with 0 running processes."
        )
        category = "attention"
        why_factors.append(f"No commits for {_format_time_ago(git_repo.last_commit_timestamp, now)}")
        why_factors.append("Working tree contains uncommitted or untracked local modifications")
        why_factors.append(f"Current branch: {git_repo.current_branch or 'HEAD'}")
        why_factors.append("0 running processes detected in directory")

    elif target_project.activity in (ActivityLevel.STALE, ActivityLevel.DORMANT):
        if git_repo:
            state_title = "Dormant / Static Codebase"
            state_desc = f"Clean working tree; no Git commits for {_format_time_ago(git_repo.last_commit_timestamp, now)}."
            why_factors.append(f"No Git commits for {_format_time_ago(git_repo.last_commit_timestamp, now)}")
            why_factors.append("Working tree is completely clean")
            why_factors.append("0 active processes running from workspace")
        else:
            state_title = "Dormant / Static Codebase (Unversioned)"
            state_desc = f"No recent filesystem activity ({_format_time_ago(target_project.last_modified, now)}); unversioned directory."
            why_factors.append(f"No filesystem modification for {_format_time_ago(target_project.last_modified, now)}")
            why_factors.append("No Git repository initialized")
        category = "dormant"

    elif target_project.activity == ActivityLevel.INACTIVE:
        state_title = "Inactive / Clean Codebase"
        state_desc = "No activity in the last 30–180 days; normal development pause with clean working state."
        category = "inactive"
        why_factors.append(f"No commits or activity for {_format_time_ago(git_repo.last_commit_timestamp, now) if git_repo else '30–180 days'}")
        why_factors.append("Clean working tree with zero background tasks")

    else:
        state_title = "Active / Current Codebase"
        state_desc = "Recent modifications or commits observed within the last 30 days."
        category = "active"
        if git_repo and git_repo.last_commit_timestamp:
            why_factors.append(f"Recent Git commit recorded: {_format_time_ago(git_repo.last_commit_timestamp, now)}")
        else:
            why_factors.append("Filesystem modifications observed within the last 30 days")

    return state_title, state_desc, category, why_factors


def serialize_workspace_inspection(
    target_project: Project,
    graph: EnvironmentGraph,
    findings: List[Finding],
) -> Dict[str, Any]:
    """Serialize full workspace inspection into the rich JSON API contract."""
    now = time.time()
    state_title, state_desc, category, why_factors = get_workspace_state_and_category(
        target_project, graph, findings, now=now
    )

    # Connected entities
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

    rt_rels = [
        r for r in graph.get_relationships_from(target_project.entity_id)
        if r.rel_type == RelationshipType.USES_RUNTIME
    ]
    runtimes: List[RuntimeInstallation] = [
        graph.get_entity(r.target_id) for r in rt_rels if isinstance(graph.get_entity(r.target_id), RuntimeInstallation)  # type: ignore
    ]

    all_caches = [e for e in graph.entities.values() if isinstance(e, CacheDirectory)]
    matching_caches = [
        c for c in all_caches
        if (c.category == "npm" and target_project.project_type.value == "node") or
           (c.category == "nuget" and target_project.project_type.value == "dotnet") or
           (c.category in ("maven", "gradle") and target_project.project_type.value == "java")
    ]

    # Structured Evidence
    evidence_items: List[Dict[str, Any]] = []
    if git_repo:
        branch_str = git_repo.current_branch or "None"
        evidence_items.append({
            "category": "git_branch",
            "label": "Git Branch",
            "value": branch_str,
            "detail": f"Remote: {git_repo.remote_repo_id or 'local only'}",
            "verified": True,
        })
        if git_repo.last_commit_timestamp is not None:
            last_commit_str = _format_time_ago(git_repo.last_commit_timestamp, now)
            commit_cnt_str = f"{git_repo.commit_count or 'unknown'} commits in HEAD history"
        elif git_repo.commit_count == 0:
            last_commit_str = "Never"
            commit_cnt_str = "0 commits (new repository)"
        else:
            last_commit_str = "Unknown"
            commit_cnt_str = f"{git_repo.commit_count or 'unknown'} commits"
        evidence_items.append({
            "category": "git_commit",
            "label": "Last Commit",
            "value": last_commit_str,
            "detail": commit_cnt_str,
            "timestamp": git_repo.last_commit_timestamp,
            "verified": True,
        })
        evidence_items.append({
            "category": "git_working_tree",
            "label": "Working Tree",
            "value": "Uncommitted local modifications" if git_repo.has_uncommitted_changes else "Clean working tree",
            "detail": "status --porcelain checked",
            "verified": True,
        })
        if git_repo.is_worktree:
            evidence_items.append({
                "category": "git_worktree",
                "label": "Worktree Pointer",
                "value": git_repo.worktree_parent_repo or "Linked parent repo",
                "detail": "gitdir pointer verified",
                "verified": True,
            })
    else:
        evidence_items.append({
            "category": "git_metadata",
            "label": "Git Repository",
            "value": "Unversioned directory",
            "detail": "No .git directory or worktree pointer found",
            "verified": True,
        })
        evidence_items.append({
            "category": "filesystem_mtime",
            "label": "Filesystem Mtime",
            "value": _format_time_ago(target_project.last_modified, now),
            "timestamp": target_project.last_modified,
            "verified": True,
        })

    for p in procs:
        role = "Interactive Shell" if p.is_shell else "Active Process"
        evidence_items.append({
            "category": "process",
            "label": f"Process: {p.name}",
            "value": f"PID {p.pid} ({role})",
            "detail": f"cwd={p.cwd or target_project.path} RSS={_format_size(p.memory_bytes)}",
            "verified": True,
        })

    for c in containers:
        evidence_items.append({
            "category": "docker",
            "label": f"Container: {c.name}",
            "value": f"state={c.state.value} ({c.image})",
            "detail": f"bind mounts: {c.bind_mounts}",
            "verified": True,
        })

    # Uncertainties
    uncertainties: List[str] = []
    has_severed_docker = category == "attention" and "Disconnected" in state_title
    if has_severed_docker:
        uncertainties.append("Container may be stopped temporarily, or the mounted host path may reside on an unmounted volume.")
    if git_repo and git_repo.has_uncommitted_changes:
        uncertainties.append("Local modifications exist, but Entropy cannot determine whether they represent valuable human work or generated artifacts.")
    if git_repo and not git_repo.has_uncommitted_changes and target_project.activity in (ActivityLevel.INACTIVE, ActivityLevel.STALE, ActivityLevel.DORMANT):
        uncertainties.append("Absence of recent Git activity does not indicate abandonment; completed or stable reference code naturally remains static.")
    if [p for p in procs if not p.is_shell]:
        uncertainties.append("Process execution confirms running code, but Entropy cannot determine if it is an active developer session or an unattended background service.")
    if [p for p in procs if p.is_shell] and not [p for p in procs if not p.is_shell]:
        uncertainties.append("An open shell terminal indicates a navigation point, but absence of child processes indicates no build or compiler task is executing.")
    if not git_repo:
        uncertainties.append("In the absence of Git metadata, commit recency, author identity, and development intent cannot be independently verified.")
    if not uncertainties:
        uncertainties.append("No conflicting signals detected; developer intent cannot be inferred from static filesystem state alone.")

    # Primary uncertainty statement directly affecting workspace state interpretation
    primary_uncertainty = None
    if git_repo and git_repo.has_uncommitted_changes:
        primary_uncertainty = "Uncommitted changes are detected, but Entropy cannot determine whether they are intentional code changes or generated residue."
    elif [p for p in procs if not p.is_shell]:
        primary_uncertainty = "Process execution confirms running code, but Entropy cannot determine if it is an active developer session or an unattended background service."
    elif [p for p in procs if p.is_shell] and not [p for p in procs if not p.is_shell]:
        primary_uncertainty = "An open shell terminal indicates a navigation point, but absence of child processes indicates no build or compiler task is executing."
    elif not git_repo:
        primary_uncertainty = "In the absence of Git metadata, commit recency, author identity, and development intent cannot be independently verified."
    elif git_repo and not git_repo.has_uncommitted_changes and target_project.activity in (ActivityLevel.INACTIVE, ActivityLevel.STALE, ActivityLevel.DORMANT):
        primary_uncertainty = "Absence of recent Git activity does not indicate abandonment; completed or stable reference code naturally remains static."

    # Group interactive shells sharing the same parent_pid
    shells_by_parent: dict[int, list[Process]] = {}
    for p in procs:
        if p.is_shell and p.parent_pid is not None:
            shells_by_parent.setdefault(p.parent_pid, []).append(p)

    process_groups = []
    for parent_pid, shells in shells_by_parent.items():
        if len(shells) > 1:
            total_rss = sum(s.memory_bytes or 0 for s in shells)
            shell_name = shells[0].name
            group_pids = [s.pid for s in shells]
            process_groups.append({
                "name": shell_name,
                "label": f"{len(shells)} Interactive Shell Sessions",
                "parent_pid": parent_pid,
                "count": len(shells),
                "pids": group_pids,
                "total_memory_bytes": total_rss,
                "processes": [asdict(s) for s in shells],
            })

    # Caches with explicit shared system scope
    serialized_caches = []
    for c in matching_caches:
        cdict = asdict(c)
        cdict["is_shared"] = getattr(c, "is_shared", True)
        cdict["scope"] = getattr(c, "scope", "shared_system")
        cdict["scope_explanation"] = getattr(c, "scope_explanation", "Shared across projects on this machine.")
        serialized_caches.append(cdict)

    # Action boundary recommendations
    action_steps: List[str] = []
    if has_severed_docker:
        c_names = ", ".join(c.name for c in containers)
        action_steps.append(f"Review container ({c_names}) bind-mounts pointing to non-existent or severed paths.")
        action_steps.append("Run 'docker inspect' or recreate missing directories before attempting to restart container.")
        action_steps.append("Prune container with 'docker rm' if the infrastructure is no longer needed.")
    elif git_repo and git_repo.has_uncommitted_changes:
        action_steps.append("Run 'git status' and 'git diff' inside this directory to inspect modified/untracked files.")
        action_steps.append("Verify whether changes are valuable code edits or disposable build logs/residue.")
        action_steps.append("Check if the current branch exists on remote ('git branch -r') before deleting or archiving.")
    elif [p for p in procs if not p.is_shell]:
        pids_str = ", ".join(str(p.pid) for p in [pr for pr in procs if not pr.is_shell])
        action_steps.append(f"Review running process PID(s): {pids_str} in Task Manager before terminating or moving files.")
        action_steps.append("Verify if processes were started deliberately as local services or left running in background.")
    elif git_repo and not git_repo.has_uncommitted_changes:
        action_steps.append("Working tree is clean. Dependencies (if any) can be safely cleared with package manager commands.")
        action_steps.append("Verify remote repository sync ('git fetch --dry-run') before archiving or pruning.")
    else:
        action_steps.append("Workspace is unversioned. Inspect directory contents manually before moving or deleting.")
        action_steps.append("Initialize version control with 'git init' if this codebase contains valuable work.")

    # Relevant entities & relationships for the interactive graph
    relevant_entity_ids = {target_project.entity_id}
    if git_repo:
        relevant_entity_ids.add(git_repo.entity_id)
    for p in procs:
        relevant_entity_ids.add(p.entity_id)
    for c in containers:
        relevant_entity_ids.add(c.entity_id)
    for r in runtimes:
        relevant_entity_ids.add(r.entity_id)
    for d in deps:
        relevant_entity_ids.add(d.entity_id)
    for c in matching_caches:
        relevant_entity_ids.add(c.entity_id)

    relevant_entities = [
        asdict(graph.entities[eid]) for eid in relevant_entity_ids if eid in graph.entities
    ]

    relevant_relationships = [
        asdict(r) for r in graph.relationships
        if r.source_id in relevant_entity_ids or r.target_id in relevant_entity_ids
    ]

    relevant_findings = [
        asdict(f) for f in findings
        if any(eid in relevant_entity_ids for eid in f.entities_involved)
    ]

    return {
        "workspace": {
            "id": target_project.entity_id,
            "name": os.path.basename(target_project.path),
            "path": target_project.path,
            "project_type": target_project.project_type.value,
            "total_size_bytes": target_project.total_size_bytes,
            "created": target_project.created,
            "last_modified": target_project.last_modified,
            "runtime_version_hint": target_project.runtime_version_hint,
        },
        "state": {
            "label": state_title,
            "summary": state_desc,
            "category": category,
            "why_factors": why_factors,
            "primary_uncertainty": primary_uncertainty,
        },
        "connections": {
            "git": asdict(git_repo) if git_repo else None,
            "processes": [asdict(p) for p in procs],
            "process_groups": process_groups,
            "runtimes": [asdict(r) for r in runtimes],
            "docker": [asdict(c) for c in containers],
            "dependencies": [asdict(d) for d in deps],
            "caches": serialized_caches,
        },
        "primary_uncertainty": primary_uncertainty,
        "entities": relevant_entities,
        "relationships": relevant_relationships,
        "findings": relevant_findings,
        "evidence": evidence_items,
        "uncertainties": uncertainties,
        "action_boundary": {
            "read_only": True,
            "notice": "Entropy is read-only and performs zero automatic cleanup or remediation.",
            "verification_steps": action_steps,
        },
        "metadata": {
            "scan_duration_ms": int((graph.scan_duration_seconds or 0) * 1000),
            "engine_version": "0.1.0",
            "timestamp": graph.scan_timestamp,
            "hostname": graph.hostname,
            "root": target_project.path,
        },
        "scan_metadata": {
            "timestamp": graph.scan_timestamp,
            "duration_seconds": graph.scan_duration_seconds,
            "duration_ms": int((graph.scan_duration_seconds or 0) * 1000),
            "root": target_project.path,
            "roots": graph.scan_roots,
            "scope_type": graph.scope_type.value,
            "hostname": graph.hostname,
            "docker_available": graph.docker_available,
            "engine_version": "0.1.0",
        },
    }


def serialize_environment_overview(
    graph: EnvironmentGraph,
    findings: List[Finding],
) -> Dict[str, Any]:
    """Serialize multi-workspace environment overview into JSON."""
    now = time.time()
    projects = [e for e in graph.entities.values() if isinstance(e, Project)]
    runtimes = [e for e in graph.entities.values() if isinstance(e, RuntimeInstallation)]
    processes = [e for e in graph.entities.values() if isinstance(e, Process)]
    containers = [e for e in graph.entities.values() if isinstance(e, DockerContainer)]
    caches = [e for e in graph.entities.values() if isinstance(e, CacheDirectory)]

    workspace_cards: List[Dict[str, Any]] = []
    category_counts = {
        "active": 0,
        "attention": 0,
        "dormant": 0,
        "inactive": 0,
        "paused": 0,
        "neutral": 0,
    }

    for p in projects:
        state_title, state_desc, category, why_factors = get_workspace_state_and_category(
            p, graph, findings, now=now
        )
        category_counts[category] = category_counts.get(category, 0) + 1
        if category == "inactive":
            category_counts["paused"] = category_counts.get("paused", 0) + 1

        # Git branch / commit info if linked
        git_rels = [
            r for r in graph.get_relationships_from(p.entity_id)
            if r.rel_type == RelationshipType.CONTAINS and r.target_id.startswith("git:")
        ]
        git_repo: Optional[GitRepository] = (
            graph.get_entity(git_rels[0].target_id) if git_rels else None  # type: ignore
        )

        proc_rels = [
            r for r in graph.get_relationships_to(p.entity_id)
            if r.rel_type == RelationshipType.RUNS_FROM
        ]

        workspace_cards.append({
            "id": p.entity_id,
            "name": os.path.basename(p.path),
            "path": p.path,
            "project_type": p.project_type.value,
            "total_size_bytes": p.total_size_bytes,
            "last_modified": p.last_modified,
            "state_label": state_title,
            "state_category": category,
            "git_branch": git_repo.current_branch if git_repo else None,
            "git_remote": git_repo.remote_repo_id if git_repo else None,
            "last_commit_timestamp": git_repo.last_commit_timestamp if git_repo else None,
            "has_uncommitted_changes": git_repo.has_uncommitted_changes if git_repo else False,
            "process_count": len(proc_rels),
        })

    # Sort workspaces: attention first, then active, then inactive/paused, then dormant
    priority = {"attention": 0, "active": 1, "inactive": 2, "paused": 2, "neutral": 3, "dormant": 4}
    workspace_cards.sort(key=lambda w: (priority.get(w["state_category"], 5), -(w["last_modified"] or 0)))

    serialized_caches = [
        {
            **asdict(c),
            "is_shared": getattr(c, "is_shared", True),
            "scope": getattr(c, "scope", "shared_system"),
            "scope_explanation": getattr(c, "scope_explanation", "Shared across projects on this machine."),
        }
        for c in caches
    ]

    # Disposable build artifacts across projects
    disposable_artifacts = []
    total_reclaimable_bytes = 0
    try:
        from collectors.artifacts import collect_project_artifacts
        for p in projects:
            p_artifacts = collect_project_artifacts(p.path)
            disposable_artifacts.extend(p_artifacts)
            for a in p_artifacts:
                total_reclaimable_bytes += (a.get("size_bytes") or 0)
    except Exception:
        pass

    return {
        "summary": {
            "total_workspaces": len(projects),
            "active_count": category_counts["active"],
            "attention_count": category_counts["attention"],
            "dormant_count": category_counts["dormant"],
            "inactive_count": category_counts["inactive"],
            "paused_count": category_counts["paused"],
            "neutral_count": category_counts["neutral"],
            "total_processes": len(processes),
            "total_runtimes": len(runtimes),
            "total_containers": len(containers),
            "total_caches": len(caches),
            "reclaimable_bytes": total_reclaimable_bytes,
            "disposable_artifact_count": len(disposable_artifacts),
        },
        "workspaces": workspace_cards,
        "system": {
            "runtimes": [asdict(r) for r in runtimes],
            "processes": [asdict(pr) for pr in processes],
            "containers": [asdict(c) for c in containers],
            "caches": serialized_caches,
            "artifacts": disposable_artifacts,
        },
        "findings": [asdict(f) for f in findings],
        "metadata": {
            "scan_duration_ms": int((graph.scan_duration_seconds or 0) * 1000),
            "engine_version": "0.1.0",
            "timestamp": graph.scan_timestamp,
            "hostname": graph.hostname,
            "scan_roots": graph.scan_roots,
        },
        "scan_metadata": {
            "timestamp": graph.scan_timestamp,
            "duration_seconds": graph.scan_duration_seconds,
            "duration_ms": int((graph.scan_duration_seconds or 0) * 1000),
            "root": graph.scan_root,
            "roots": graph.scan_roots,
            "scope_type": graph.scope_type.value,
            "hostname": graph.hostname,
            "docker_available": graph.docker_available,
            "engine_version": "0.1.0",
        },
    }