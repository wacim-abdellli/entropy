"""
Terminal report formatter.

Presents the EnvironmentGraph, cross-entity relationships, and evidence-based
findings in a clean, human-readable terminal output.
"""

from __future__ import annotations

import os
import time
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from core.entities import (
    ActivityLevel,
    CacheDirectory,
    DependencyEnvironment,
    DockerContainer,
    DockerContainerState,
    DockerImage,
    DockerVolume,
    GitRepository,
    Process,
    Project,
    RuntimeInstallation,
)
from core.findings import Finding, FindingSeverity
from core.graph import EnvironmentGraph, RelationshipType


def _format_size(size_bytes: Optional[int]) -> str:
    if size_bytes is None:
        return "Unknown"
    if size_bytes == 0:
        return "0 B"
    units = ["B", "KB", "MB", "GB", "TB"]
    s = float(size_bytes)
    idx = 0
    while s >= 1024 and idx < len(units) - 1:
        s /= 1024
        idx += 1
    if idx == 0:
        return f"{int(s)} {units[idx]}"
    return f"{s:.1f} {units[idx]}"


def _format_time_ago(timestamp: Optional[float], current_ts: float) -> str:
    if timestamp is None:
        return "Unknown"
    diff = max(0.0, current_ts - timestamp)
    if diff < 60:
        return "just now"
    if diff < 3600:
        mins = int(diff / 60)
        return f"{mins}m ago"
    if diff < 86400:
        hours = int(diff / 3600)
        return f"{hours}h ago"
    if diff < 30 * 86400:
        days = int(diff / 86400)
        return f"{days}d ago"
    if diff < 365 * 86400:
        months = int(diff / (30 * 86400))
        return f"{months} mo ago"
    years = round(diff / (365 * 86400), 1)
    return f"{years} yr ago"


def _make_bar(count: int, total: int, width: int = 20) -> str:
    if total == 0:
        return "░" * width
    filled = int(round((count / total) * width))
    filled = min(max(filled, 0), width)
    empty = width - filled
    return "█" * filled + "░" * empty


def _truncate_path(path: str, max_len: int = 50) -> str:
    home = str(Path.home())
    display_path = path
    if display_path.startswith(home):
        display_path = "~" + display_path[len(home):]
    display_path = display_path.replace("\\", "/")
    if len(display_path) <= max_len:
        return display_path
    half = (max_len - 3) // 2
    return display_path[:half] + "..." + display_path[-half:]


def format_report(graph: EnvironmentGraph, findings: List[Finding]) -> str:
    """Format the EnvironmentGraph and findings into terminal string."""
    lines: List[str] = []
    now = time.time()

    scan_dt = datetime.fromtimestamp(graph.scan_timestamp)
    time_str = scan_dt.strftime("%Y-%m-%d %H:%M:%S")

    projects = [e for e in graph.entities.values() if isinstance(e, Project)]
    processes = [e for e in graph.entities.values() if isinstance(e, Process)]
    runtimes = [e for e in graph.entities.values() if isinstance(e, RuntimeInstallation)]
    caches = [e for e in graph.entities.values() if isinstance(e, CacheDirectory)]
    containers = [e for e in graph.entities.values() if isinstance(e, DockerContainer)]
    images = [e for e in graph.entities.values() if isinstance(e, DockerImage)]
    volumes = [e for e in graph.entities.values() if isinstance(e, DockerVolume)]

    total_proj_size = sum(p.total_size_bytes or 0 for p in projects)
    total_cache_size = sum(c.size_bytes or 0 for c in caches)

    # -------------------------------------------------------------------------
    # Header
    # -------------------------------------------------------------------------
    lines.append("═══════════════════════════════════════════════════════════════")
    lines.append("  DIGITAL ENTROPY — ENVIRONMENT INTELLIGENCE SCAN")
    lines.append(f"  {time_str}  [{graph.hostname or 'local'}]")
    lines.append("═══════════════════════════════════════════════════════════════")
    lines.append("")
    lines.append(f"  Scanned:    {_truncate_path(graph.scan_root)}")
    lines.append(f"  Duration:   {graph.scan_duration_seconds:.1f}s")
    lines.append(f"  Entities:   {len(graph.entities)} discovered")
    lines.append(f"  Relations:  {len(graph.relationships)} connections mapped")
    lines.append(f"  Projects:   {len(projects)} ({_format_size(total_proj_size)} on disk)")
    lines.append(f"  Processes:  {len(processes)} running (accessible)")
    lines.append("")

    # -------------------------------------------------------------------------
    # Cross-Entity Intelligence Findings
    # -------------------------------------------------------------------------
    lines.append("───────────────────────────────────────────────────────────────")
    lines.append("  ENVIRONMENT INTELLIGENCE & FINDINGS")
    lines.append("───────────────────────────────────────────────────────────────")
    lines.append("")

    if not findings:
        lines.append("  ✓ No significant digital entropy or resource staleness detected.")
        lines.append("")
    else:
        for idx, f in enumerate(findings, 1):
            if f.severity == FindingSeverity.WARNING:
                tag = "[! WARNING]"
            elif f.severity == FindingSeverity.ATTENTION:
                tag = "[! ATTENTION]"
            else:
                tag = "[INFO]"

            lines.append(f"  {idx}. {tag} {f.title}")
            lines.append(f"     Category: {f.category}")
            lines.append(f"     Summary:  {f.summary}")
            lines.append("")
            lines.append("     Evidence:")
            for ev in f.evidence:
                lines.append(f"       • {ev}")
            lines.append("")
            lines.append("     Reasoning Chain:")
            for step in f.reasoning_chain:
                lines.append(f"       {step}")
            if f.uncertainties:
                lines.append("")
                lines.append("     Uncertainty & Caveats:")
                for unc in f.uncertainties:
                    lines.append(f"       ? {unc}")
            lines.append("")
            lines.append("  " + "·" * 59)
            lines.append("")

    # -------------------------------------------------------------------------
    # Relationship Graph Summary
    # -------------------------------------------------------------------------
    lines.append("───────────────────────────────────────────────────────────────")
    lines.append("  RELATIONSHIP GRAPH")
    lines.append("───────────────────────────────────────────────────────────────")
    lines.append("")

    rel_counts: dict[str, int] = {}
    for r in graph.relationships:
        val = r.rel_type.value
        rel_counts[val] = rel_counts.get(val, 0) + 1

    for r_type, count in sorted(rel_counts.items(), key=lambda x: x[1], reverse=True):
        lines.append(f"  {r_type.ljust(22)} : {count} mapped relationships")
    lines.append("")

    # -------------------------------------------------------------------------
    # Project Activity Breakdown
    # -------------------------------------------------------------------------
    lines.append("───────────────────────────────────────────────────────────────")
    lines.append("  PROJECT ACTIVITY")
    lines.append("───────────────────────────────────────────────────────────────")
    lines.append("")

    act_counts = {
        ActivityLevel.ACTIVE: 0,
        ActivityLevel.INACTIVE: 0,
        ActivityLevel.STALE: 0,
        ActivityLevel.DORMANT: 0,
    }
    for p in projects:
        if p.activity in act_counts:
            act_counts[p.activity] += 1

    tot = len(projects)
    if tot == 0:
        lines.append("  No projects found.")
    else:
        lines.append(f"  Active   (≤30 days)    {_make_bar(act_counts[ActivityLevel.ACTIVE], tot)}  {act_counts[ActivityLevel.ACTIVE]}")
        lines.append(f"  Inactive (1-6 mo)      {_make_bar(act_counts[ActivityLevel.INACTIVE], tot)}  {act_counts[ActivityLevel.INACTIVE]}")
        lines.append(f"  Stale    (6-12 mo)     {_make_bar(act_counts[ActivityLevel.STALE], tot)}  {act_counts[ActivityLevel.STALE]}")
        lines.append(f"  Dormant  (>12 mo)      {_make_bar(act_counts[ActivityLevel.DORMANT], tot)}  {act_counts[ActivityLevel.DORMANT]}")
    lines.append("")

    # -------------------------------------------------------------------------
    # Project Inventory Details
    # -------------------------------------------------------------------------
    if projects:
        lines.append("───────────────────────────────────────────────────────────────")
        lines.append("  PROJECT INVENTORY")
        lines.append("───────────────────────────────────────────────────────────────")
        lines.append("")

        # Sort projects by activity (dormant/stale first, then by size)
        order = {
            ActivityLevel.DORMANT: 0,
            ActivityLevel.STALE: 1,
            ActivityLevel.INACTIVE: 2,
            ActivityLevel.ACTIVE: 3,
            ActivityLevel.UNKNOWN: 4,
        }
        sorted_projects = sorted(
            projects,
            key=lambda p: (order.get(p.activity, 5), -(p.total_size_bytes or 0)),
        )

        for p in sorted_projects:
            # Check attached git repo
            git_rels = [
                r for r in graph.get_relationships_from(p.entity_id)
                if r.rel_type == RelationshipType.CONTAINS and r.target_id.startswith("git:")
            ]
            git_repo: Optional[GitRepository] = (
                graph.get_entity(git_rels[0].target_id) if git_rels else None  # type: ignore
            )

            # Check attached processes
            running_procs = [
                graph.get_entity(r.source_id)
                for r in graph.get_relationships_to(p.entity_id)
                if r.rel_type == RelationshipType.RUNS_FROM
            ]

            # Dependencies
            deps = [
                graph.get_entity(r.target_id)
                for r in graph.get_relationships_from(p.entity_id)
                if r.rel_type == RelationshipType.CONTAINS and r.target_id.startswith("dep:")
            ]

            name = os.path.basename(p.path)
            size_str = _format_size(p.total_size_bytes)
            status_tag = f"[{p.activity.value.upper()}]"

            lines.append(f"  {_truncate_path(p.path, 42).ljust(43)} {size_str.rjust(10)}  {status_tag}")
            type_str = p.project_type.value.capitalize()
            last_act_ts = (git_repo.last_commit_timestamp if git_repo else None) or p.last_modified
            last_act_str = _format_time_ago(last_act_ts, now)

            lines.append(f"    Type: {type_str} │ Last activity: {last_act_str}")

            parts = []
            for d in deps:
                if isinstance(d, DependencyEnvironment) and d.size_bytes:
                    parts.append(f"{d.dep_type}: {_format_size(d.size_bytes)}")
            if git_repo and git_repo.repo_size_bytes:
                parts.append(f".git: {_format_size(git_repo.repo_size_bytes)}")
            if parts:
                lines.append(f"    {' │ '.join(parts)}")

            if git_repo:
                uncommitted = "yes" if git_repo.has_uncommitted_changes else "no"
                remote_str = git_repo.remote_host or "none"
                lines.append(
                    f"    Branch: {git_repo.current_branch} │ Uncommitted: {uncommitted} │ Remote: {remote_str}"
                )

            if running_procs:
                proc_names = [f"{pr.name} (PID {pr.pid})" for pr in running_procs if isinstance(pr, Process)]
                lines.append(f"    ⚡ Active processes: {', '.join(proc_names)}")

            lines.append("")

    # -------------------------------------------------------------------------
    # Runtimes
    # -------------------------------------------------------------------------
    lines.append("───────────────────────────────────────────────────────────────")
    lines.append("  RUNTIMES & TOOLCHAINS")
    lines.append("───────────────────────────────────────────────────────────────")
    lines.append("")
    if not runtimes:
        lines.append("  No runtimes detected.")
    else:
        by_rt: dict[str, List[RuntimeInstallation]] = {}
        for r in runtimes:
            by_rt.setdefault(r.runtime, []).append(r)

        for r_name in sorted(by_rt.keys()):
            lines.append(f"  {r_name.capitalize()}:")
            for r in by_rt[r_name]:
                flags = []
                if r.manager:
                    flags.append(r.manager)
                if r.is_active:
                    flags.append("active")
                flag_str = f"({', '.join(flags)})" if flags else ""
                lines.append(f"    {r.version.ljust(12)} {flag_str}")
            lines.append("")

    # -------------------------------------------------------------------------
    # Docker
    # -------------------------------------------------------------------------
    lines.append("───────────────────────────────────────────────────────────────")
    lines.append("  DOCKER RESOURCES")
    lines.append("───────────────────────────────────────────────────────────────")
    lines.append("")
    if not graph.docker_available:
        lines.append("  Docker: not available or daemon not running")
        lines.append("")
    else:
        lines.append(f"  Containers: {len(containers)}")
        for c in containers:
            lines.append(f"    {c.name.ljust(20)} {c.image.ljust(25)} [{c.state.value}]")
        lines.append(f"  Images:     {len(images)}")
        lines.append(f"  Volumes:    {len(volumes)}")
        lines.append("")

    # -------------------------------------------------------------------------
    # Caches
    # -------------------------------------------------------------------------
    lines.append("───────────────────────────────────────────────────────────────")
    lines.append("  CACHES & SYSTEM ARTIFACTS")
    lines.append("───────────────────────────────────────────────────────────────")
    lines.append("")
    if not caches:
        lines.append("  No significant caches detected.")
    else:
        for c in caches[:10]:
            name = c.description or f"{c.category} cache"
            p_str = _truncate_path(c.path, 30)
            sz = _format_size(c.size_bytes)
            lines.append(f"  {name.ljust(24)} {p_str.ljust(32)} {sz.rjust(10)}")
        lines.append("                                                ────────────")
        lines.append(f"                                       Total:   {_format_size(total_cache_size).rjust(10)}")
    lines.append("")

    lines.append("═══════════════════════════════════════════════════════════════")
    lines.append("  Scan complete. Observation only — no changes made.")
    lines.append("═══════════════════════════════════════════════════════════════")

    return "\n".join(lines)
