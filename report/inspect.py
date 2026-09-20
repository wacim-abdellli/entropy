"""
Focused workspace inspection report formatter.

Formats the graph footprint of a single targeted workspace into the strict 6-section schema:
WORKSPACE
STATE
EVIDENCE
RELATIONSHIPS
INTERPRETATION
UNCERTAINTIES
"""

from __future__ import annotations

import os
import time
from typing import List, Optional

from core.entities import (
    ActivityLevel,
    DependencyEnvironment,
    DockerContainer,
    GitRepository,
    Process,
    Project,
    RuntimeInstallation,
)
from core.findings import Finding, FindingSeverity
from core.graph import EnvironmentGraph, RelationshipType
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

    active_runtime_procs = [p for p in procs if not p.is_shell]
    idle_shells = [p for p in procs if p.is_shell]

    # Workspace-relevant findings
    workspace_findings = [
        f for f in findings if target_project.entity_id in f.entities_involved
    ]

    # -------------------------------------------------------------------------
    # 1. WORKSPACE
    # -------------------------------------------------------------------------
    lines.append("WORKSPACE")
    name = os.path.basename(target_project.path)
    lines.append(f"  Name:       {name}")
    lines.append(f"  Path:       {target_project.path}")
    type_str = target_project.project_type.value.capitalize()
    size_str = _format_size(target_project.total_size_bytes)
    lines.append(f"  Type:       {type_str}")
    lines.append(f"  Total Size: {size_str}")
    lines.append("")

    # -------------------------------------------------------------------------
    # 2. STATE
    # -------------------------------------------------------------------------
    lines.append("STATE")
    # Determine synthesis state
    if active_runtime_procs:
        proc_str = ", ".join(f"{p.name} (PID {p.pid})" for p in active_runtime_procs)
        state_title = "Active Development Session"
        state_desc = f"Actively executing processes running from this workspace ({proc_str})."
    elif git_repo and git_repo.has_uncommitted_changes and target_project.activity in (ActivityLevel.STALE, ActivityLevel.DORMANT):
        state_title = "[! WARNING] Suspended Feature Work (Data Loss Risk)"
        state_desc = (
            f"Codebase inactive for {_format_time_ago(git_repo.last_commit_timestamp, now)}, "
            f"but contains uncommitted local modifications with 0 running processes."
        )
    elif idle_shells and not active_runtime_procs:
        shell_str = ", ".join(f"{s.name} (PID {s.pid})" for s in idle_shells)
        state_title = "[! ATTENTION] Idle Terminal Open in Inactive Project"
        state_desc = f"Interactive shell ({shell_str}) has cwd in this directory, but no runtime/compiler is active."
    elif target_project.activity in (ActivityLevel.STALE, ActivityLevel.DORMANT):
        if git_repo:
            state_title = "Dormant / Static Codebase"
            state_desc = f"No Git activity for {_format_time_ago(git_repo.last_commit_timestamp, now)}; clean working tree."
        else:
            state_title = "Dormant / Unversioned Project"
            state_desc = f"No recent filesystem activity ({_format_time_ago(target_project.last_modified, now)}); no Git repository."
    elif target_project.activity == ActivityLevel.INACTIVE:
        state_title = "Paused / Intermittent Project"
        state_desc = "No activity in the last 30–180 days; normal development pause."
    else:
        state_title = "Active / Current Codebase"
        state_desc = "Recent modifications or commits observed within the last 30 days."

    lines.append(f"  Status:     {state_title}")
    lines.append(f"  Summary:    {state_desc}")
    lines.append("")

    # -------------------------------------------------------------------------
    # 3. EVIDENCE
    # -------------------------------------------------------------------------
    lines.append("EVIDENCE")
    if git_repo:
        last_commit_str = _format_time_ago(git_repo.last_commit_timestamp, now)
        lines.append(f"  • Git Branch:            {git_repo.current_branch}")
        lines.append(f"  • Last Commit:           {last_commit_str} ({git_repo.commit_count or 'unknown'} total commits)")
        uncommitted_str = "YES (unpushed local modifications exist)" if git_repo.has_uncommitted_changes else "No (working tree clean)"
        lines.append(f"  • Uncommitted Work:      {uncommitted_str}")
        lines.append(f"  • Remote Origin:         {git_repo.remote_repo_id or git_repo.remote_host or 'None (local only)'}")
        if git_repo.is_worktree:
            lines.append(f"  • Worktree Parent:       {git_repo.worktree_parent_repo or 'Linked main repo'}")
    else:
        lines.append("  • Git Metadata:          No .git directory or worktree detected (unversioned codebase)")
        lines.append(f"  • Filesystem Last Mod:   {_format_time_ago(target_project.last_modified, now)}")

    if procs:
        proc_details = [f"{p.name} (PID {p.pid}, memory: {_format_size(p.memory_bytes)})" for p in procs]
        lines.append(f"  • Active Processes ({len(procs)}):  {', '.join(proc_details)}")
    else:
        lines.append("  • Active Processes:      0 (no running processes observed in this workspace)")

    if deps:
        dep_strs = [f"{d.dep_type} ({_format_size(d.size_bytes)})" for d in deps]
        lines.append(f"  • Dependencies:          {', '.join(dep_strs)}")
    else:
        lines.append("  • Dependencies:          None detected (no node_modules, venv, or target folder)")

    if containers:
        c_strs = [f"'{c.name}' [{c.state.value}] (Image: {c.image})" for c in containers]
        lines.append(f"  • Docker Containers:     {', '.join(c_strs)}")
    else:
        lines.append("  • Docker Containers:     0 bind mounts associated with this workspace")
    lines.append("")

    # -------------------------------------------------------------------------
    # 4. RELATIONSHIPS
    # -------------------------------------------------------------------------
    lines.append("RELATIONSHIPS")
    project_rels = [
        r for r in graph.relationships
        if r.source_id == target_project.entity_id or r.target_id == target_project.entity_id
    ]
    if not project_rels:
        lines.append("  • No cross-entity relationships mapped for this workspace.")
    else:
        for r in project_rels:
            lines.append(f"  • [{r.rel_type.value.upper()}] {r.evidence}")
    lines.append("")

    # -------------------------------------------------------------------------
    # 5. INTERPRETATION
    # -------------------------------------------------------------------------
    lines.append("INTERPRETATION")
    if workspace_findings:
        for wf in workspace_findings:
            lines.append(f"  • {wf.title}:")
            for rc in wf.reasoning_chain:
                lines.append(f"    - {rc}")
    else:
        if active_runtime_procs:
            lines.append("  • This workspace is an active part of current machine workflow.")
            lines.append("  • Recent execution processes confirm live engagement regardless of Git commit frequency.")
        elif git_repo and not git_repo.has_uncommitted_changes and target_project.activity in (ActivityLevel.STALE, ActivityLevel.DORMANT):
            lines.append("  • This repository is in a preserved, stable, or finished state.")
            lines.append("  • Working tree is clean and code is committed. No immediate data loss risk is present.")
            lines.append("  • The absence of activity reflects a dormant project rather than hazardous waste.")
        else:
            lines.append("  • Standard development workspace with no hazardous state anomalies detected.")
            lines.append("  • Project state matches normal developer lifecycle progression.")
    lines.append("")

    # -------------------------------------------------------------------------
    # 6. UNCERTAINTIES
    # -------------------------------------------------------------------------
    lines.append("UNCERTAINTIES")
    if workspace_findings:
        for wf in workspace_findings:
            for unc in wf.uncertainties:
                lines.append(f"  ? {unc}")
    else:
        lines.append("  ? Absence of Git activity does not prove abandonment; software may be complete or stable.")
        lines.append("  ? Background tasks invoked via global paths or task scheduler may execute without resident processes.")
        if not git_repo:
            lines.append("  ? Without Git metadata, commit recency and author intent cannot be independently verified.")
    lines.append("")

    return "\n".join(lines)
