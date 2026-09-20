"""
Findings and digital entropy analysis engine.

Inspects the EnvironmentGraph to surface multi-entity intelligence that no single
traditional utility (WinDirStat, Task Manager, Docker Desktop, Git) can produce alone.

Core rule: NO fake confidence scores. Always explain the reasoning chain, list
concrete evidence, and explicitly communicate uncertainties and caveats.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import List, Optional

from core.entities import (
    ActivityLevel,
    CacheDirectory,
    DependencyEnvironment,
    DockerContainer,
    DockerContainerState,
    GitRepository,
    Process,
    Project,
    ProjectType,
    RuntimeInstallation,
)
from core.graph import EnvironmentGraph, RelationshipType
from linkers.relationships import _is_subpath


class FindingSeverity(str, Enum):
    INFO = "info"
    ATTENTION = "attention"
    WARNING = "warning"


@dataclass
class Finding:
    """A cross-entity intelligence finding backed by concrete evidence."""
    id: str
    title: str
    severity: FindingSeverity
    category: str
    summary: str
    entities_involved: List[str] = field(default_factory=list)
    evidence: List[str] = field(default_factory=list)
    reasoning_chain: List[str] = field(default_factory=list)
    uncertainties: List[str] = field(default_factory=list)


def _format_size(size_bytes: Optional[int]) -> str:
    if size_bytes is None:
        return "unknown size"
    if size_bytes == 0:
        return "0 B"
    units = ["B", "KB", "MB", "GB", "TB"]
    s = float(size_bytes)
    idx = 0
    while s >= 1024 and idx < len(units) - 1:
        s /= 1024
        idx += 1
    return f"{s:.1f} {units[idx]}"


def _format_days_ago(timestamp: Optional[float], current_ts: float) -> str:
    if not timestamp:
        return "unknown time"
    diff_days = int((current_ts - timestamp) / 86400.0)
    if diff_days <= 0:
        return "today"
    if diff_days == 1:
        return "1 day ago"
    if diff_days < 30:
        return f"{diff_days} days ago"
    months = int(diff_days / 30)
    if months < 12:
        return f"{months} month{'s' if months != 1 else ''} ago ({diff_days} days)"
    years = round(diff_days / 365.0, 1)
    return f"{years} years ago ({diff_days} days)"


def analyze_graph(graph: EnvironmentGraph) -> List[Finding]:
    """
    Evaluates the EnvironmentGraph to produce evidence-based findings.
    """
    findings: List[Finding] = []
    current_time = time.time()

    projects = [e for e in graph.entities.values() if isinstance(e, Project)]
    git_repos = [e for e in graph.entities.values() if isinstance(e, GitRepository)]
    processes = [e for e in graph.entities.values() if isinstance(e, Process)]
    runtimes = [e for e in graph.entities.values() if isinstance(e, RuntimeInstallation)]
    dep_envs = [e for e in graph.entities.values() if isinstance(e, DependencyEnvironment)]
    docker_containers = [e for e in graph.entities.values() if isinstance(e, DockerContainer)]
    caches = [e for e in graph.entities.values() if isinstance(e, CacheDirectory)]

    # -------------------------------------------------------------------------
    # 1. Running Process in Stale/Inactive Project
    # -------------------------------------------------------------------------
    for p in projects:
        # Find processes running from this project
        runs_from_rels = [
            r for r in graph.get_relationships_to(p.entity_id)
            if r.rel_type == RelationshipType.RUNS_FROM
        ]
        if not runs_from_rels:
            continue

        # Check if project is stale or dormant
        is_stale = p.activity in (ActivityLevel.STALE, ActivityLevel.DORMANT)

        # Get git repo if attached
        contains_git = [
            r for r in graph.get_relationships_from(p.entity_id)
            if r.rel_type == RelationshipType.CONTAINS and r.target_id.startswith("git:")
        ]
        git_repo: Optional[GitRepository] = None
        if contains_git:
            git_repo = graph.get_entity(contains_git[0].target_id)  # type: ignore

        if is_stale or (git_repo and git_repo.last_commit_timestamp and (current_time - git_repo.last_commit_timestamp) > 90 * 86400):
            proc_names = []
            proc_mem = 0
            for r in runs_from_rels:
                proc = graph.get_entity(r.source_id)
                if isinstance(proc, Process):
                    proc_names.append(f"{proc.name} (PID {proc.pid})")
                    if proc.memory_bytes:
                        proc_mem += proc.memory_bytes

            evidence = [
                f"Project directory: {p.path}",
                f"Project activity state: {p.activity.value.upper()}",
            ]
            if git_repo and git_repo.last_commit_timestamp:
                evidence.append(
                    f"Last Git commit: {_format_days_ago(git_repo.last_commit_timestamp, current_time)}"
                )
            for r in runs_from_rels:
                evidence.append(f"Running process: {r.evidence}")
            if proc_mem > 0:
                evidence.append(f"Combined process memory: {_format_size(proc_mem)}")

            findings.append(
                Finding(
                    id=f"running_proc_stale_{p.entity_id}",
                    title=f"Active process running in stale project: {os.path.basename(p.path)}",
                    severity=FindingSeverity.WARNING,
                    category="Process Lifecycle",
                    summary=(
                        f"Process {', '.join(proc_names)} is currently running from a project "
                        f"with no Git activity for months."
                    ),
                    entities_involved=[p.entity_id] + [r.source_id for r in runs_from_rels],
                    evidence=evidence,
                    reasoning_chain=[
                        "1. Process inspection detected an active process whose working directory or executable is inside this project.",
                        "2. Git metadata demonstrates that code development has been inactive for a prolonged period.",
                        "3. Filesystem modification timestamps may appear recent purely due to this process writing logs or cache files.",
                        "4. This process may be an abandoned background server or forgotten development instance.",
                    ],
                    uncertainties=[
                        "The process might be a long-running service intentionally left running by the developer.",
                        "The project might be a stable utility that requires no recent code modifications.",
                    ],
                )
            )

    # -------------------------------------------------------------------------
    # 2. Inactive Project with Substantial Lingering Resources
    # -------------------------------------------------------------------------
    for p in projects:
        if p.activity not in (ActivityLevel.STALE, ActivityLevel.DORMANT, ActivityLevel.INACTIVE):
            continue

        # Ensure no process is running from it
        has_running_proc = any(
            r.rel_type == RelationshipType.RUNS_FROM
            for r in graph.get_relationships_to(p.entity_id)
        )
        if has_running_proc:
            continue

        # Look for dependencies (node_modules, venvs, targets)
        dep_rels = [
            r for r in graph.get_relationships_from(p.entity_id)
            if r.rel_type == RelationshipType.CONTAINS and r.target_id.startswith("dep:")
        ]

        total_dep_size = 0
        dep_descriptions = []
        for dr in dep_rels:
            dep_ent = graph.get_entity(dr.target_id)
            if isinstance(dep_ent, DependencyEnvironment) and dep_ent.size_bytes:
                total_dep_size += dep_ent.size_bytes
                dep_descriptions.append(f"{dep_ent.dep_type} ({_format_size(dep_ent.size_bytes)})")

        # Check for associated Docker containers
        docker_rels = [
            r for r in graph.get_relationships_to(p.entity_id)
            if r.rel_type == RelationshipType.BIND_MOUNTS
        ]

        # Only flag if significant resources exist (> 200 MB or Docker container attached)
        if total_dep_size > 200 * 1024 * 1024 or docker_rels or p.activity == ActivityLevel.DORMANT:
            # Check git state
            git_rel = [
                r for r in graph.get_relationships_from(p.entity_id)
                if r.rel_type == RelationshipType.CONTAINS and r.target_id.startswith("git:")
            ]
            git_repo: Optional[GitRepository] = None
            if git_rel:
                git_repo = graph.get_entity(git_rel[0].target_id)  # type: ignore

            evidence = [
                f"Project path: {p.path}",
                f"Project size: {_format_size(p.total_size_bytes)}",
                f"Activity status: {p.activity.value}",
            ]
            if git_repo and git_repo.last_commit_timestamp:
                evidence.append(
                    f"Last commit: {_format_days_ago(git_repo.last_commit_timestamp, current_time)}"
                )
                if git_repo.has_remote:
                    evidence.append(f"Remote repository host: {git_repo.remote_host}")
            if dep_descriptions:
                evidence.append(f"Dependency directories: {', '.join(dep_descriptions)}")
            for dr in docker_rels:
                c = graph.get_entity(dr.source_id)
                if isinstance(c, DockerContainer):
                    evidence.append(f"Associated container: '{c.name}' (State: {c.state.value})")

            findings.append(
                Finding(
                    id=f"inactive_resources_{p.entity_id}",
                    title=f"Inactive development environment with lingering resources: {os.path.basename(p.path)}",
                    severity=FindingSeverity.ATTENTION,
                    category="Environment Lifecycle",
                    summary=(
                        f"Project '{os.path.basename(p.path)}' has been inactive ({p.activity.value}) "
                        f"and holds {_format_size(total_dep_size or p.total_size_bytes)} of resources with no active processes."
                    ),
                    entities_involved=[p.entity_id] + [dr.target_id for dr in dep_rels] + [dr.source_id for dr in docker_rels],
                    evidence=evidence,
                    reasoning_chain=[
                        "1. Verified project has had no Git commits or modifications for an extended period.",
                        "2. Process inspection confirmed no running process or background service is using this folder.",
                        "3. Installed dependencies or build outputs remain fully materialized on disk.",
                        "4. Code appears backed up if remote is present, while local environment state remains frozen.",
                    ],
                    uncertainties=[
                        "The developer might resume work on this project at any time.",
                        "Re-installing dependencies in the future could be slow if package versions are archived.",
                    ],
                )
            )

    # -------------------------------------------------------------------------
    # 3. Duplicate Project Checkouts Across Locations (SHARES_REMOTE)
    # -------------------------------------------------------------------------
    shares_remote_rels = [
        r for r in graph.relationships
        if r.rel_type == RelationshipType.SHARES_REMOTE
    ]

    for rel in shares_remote_rels:
        p1 = graph.get_entity(rel.source_id)
        p2 = graph.get_entity(rel.target_id)
        if isinstance(p1, Project) and isinstance(p2, Project):
            # Fetch git repos for both
            g1_rels = [r for r in graph.get_relationships_from(p1.entity_id) if r.target_id.startswith("git:")]
            g2_rels = [r for r in graph.get_relationships_from(p2.entity_id) if r.target_id.startswith("git:")]
            g1: Optional[GitRepository] = graph.get_entity(g1_rels[0].target_id) if g1_rels else None  # type: ignore
            g2: Optional[GitRepository] = graph.get_entity(g2_rels[0].target_id) if g2_rels else None  # type: ignore

            evidence = [
                f"Copy 1: {p1.path} ({_format_size(p1.total_size_bytes)})",
                f"Copy 2: {p2.path} ({_format_size(p2.total_size_bytes)})",
                rel.evidence,
            ]
            if g1:
                evidence.append(
                    f"Copy 1: branch '{g1.current_branch}', uncommitted changes: {g1.has_uncommitted_changes}, "
                    f"last commit: {_format_days_ago(g1.last_commit_timestamp, current_time)}"
                )
            if g2:
                evidence.append(
                    f"Copy 2: branch '{g2.current_branch}', uncommitted changes: {g2.has_uncommitted_changes}, "
                    f"last commit: {_format_days_ago(g2.last_commit_timestamp, current_time)}"
                )

            findings.append(
                Finding(
                    id=f"duplicate_repo_{p1.entity_id}_{p2.entity_id}",
                    title=f"Duplicate project clones detected: {os.path.basename(p1.path)}",
                    severity=FindingSeverity.WARNING if (g1 and g1.has_uncommitted_changes) or (g2 and g2.has_uncommitted_changes) else FindingSeverity.ATTENTION,
                    category="Duplication",
                    summary=(
                        f"The same Git repository exists in two separate locations: "
                        f"'{p1.path}' and '{p2.path}'."
                    ),
                    entities_involved=[p1.entity_id, p2.entity_id],
                    evidence=evidence,
                    reasoning_chain=[
                        "1. Both directories contain Git repositories with identical remote repository identities.",
                        "2. Multiple copies independently accumulate duplicate dependencies and build caches.",
                        "3. Discrepancies in branches or uncommitted changes risk accidental work divergence or loss.",
                    ],
                    uncertainties=[
                        "The developer might maintain multiple clones intentionally (e.g. for parallel branch testing or worktrees).",
                    ],
                )
            )

    # -------------------------------------------------------------------------
    # 4. Stale Project with Uncommitted Changes (Risk of Lost Work)
    # -------------------------------------------------------------------------
    for p in projects:
        if p.activity in (ActivityLevel.STALE, ActivityLevel.DORMANT):
            git_rels = [
                r for r in graph.get_relationships_from(p.entity_id)
                if r.rel_type == RelationshipType.CONTAINS and r.target_id.startswith("git:")
            ]
            if git_rels:
                g: Optional[GitRepository] = graph.get_entity(git_rels[0].target_id)  # type: ignore
                if g and g.has_uncommitted_changes:
                    findings.append(
                        Finding(
                            id=f"uncommitted_stale_{p.entity_id}",
                            title=f"Uncommitted work in inactive project: {os.path.basename(p.path)}",
                            severity=FindingSeverity.WARNING,
                            category="Data Integrity Risk",
                            summary=(
                                f"Project '{os.path.basename(p.path)}' has not been committed to for "
                                f"{_format_days_ago(g.last_commit_timestamp, current_time)}, but contains uncommitted modifications."
                            ),
                            entities_involved=[p.entity_id, g.entity_id],
                            evidence=[
                                f"Project directory: {p.path}",
                                f"Branch: {g.current_branch}",
                                f"Last committed: {_format_days_ago(g.last_commit_timestamp, current_time)}",
                                "Git status shows modified or untracked files.",
                            ],
                            reasoning_chain=[
                                "1. Git status reveals uncommitted modifications.",
                                "2. Long inactivity means this unfinished work is likely forgotten.",
                                "3. Unlike committed code, uncommitted work cannot be restored from remote repositories.",
                            ],
                            uncertainties=[
                                "The uncommitted files could be disposable test artifacts or build residue.",
                            ],
                        )
                    )

    # -------------------------------------------------------------------------
    # 5. Potentially Unused Runtime Installation
    # -------------------------------------------------------------------------
    for rt in runtimes:
        if rt.is_active:
            continue

        # Check if any project references this runtime
        referenced_by_project = any(
            r.rel_type == RelationshipType.USES_RUNTIME and r.target_id == rt.entity_id
            for r in graph.relationships
        )

        # Check if any running process runs on this runtime
        used_by_process = any(
            r.rel_type == RelationshipType.RUNS_ON and r.target_id == rt.entity_id
            for r in graph.relationships
        )

        if not referenced_by_project and not used_by_process:
            findings.append(
                Finding(
                    id=f"unused_runtime_{rt.entity_id}",
                    title=f"Potentially unused runtime: {rt.runtime} {rt.version}",
                    severity=FindingSeverity.INFO,
                    category="Runtime Management",
                    summary=(
                        f"Runtime '{rt.runtime} {rt.version}' ({rt.manager or 'installed'}) "
                        f"is not currently referenced by scanned projects or running processes."
                    ),
                    entities_involved=[rt.entity_id],
                    evidence=[
                        f"Runtime: {rt.runtime} {rt.version}",
                        f"Installation manager: {rt.manager or 'system'}",
                        f"Installation path: {rt.path or 'system default'}",
                        "No scanned projects declare a requirement for this specific version.",
                        "No currently running process is executing using this runtime.",
                    ],
                    reasoning_chain=[
                        "1. Scanned project configs (.nvmrc, pyproject.toml, etc.) showed no requirement for this version.",
                        "2. Process inspection found no running process executing from this runtime path.",
                        "3. The runtime remains installed on the filesystem.",
                    ],
                    uncertainties=[
                        "Projects located outside the scanned directories might depend on this runtime.",
                        "The runtime might be invoked occasionally via CLI commands.",
                    ],
                )
            )

    # -------------------------------------------------------------------------
    # 6. Severed Container Infrastructure (Ghost Bind Mounts)
    # -------------------------------------------------------------------------
    for c in docker_containers:
        for mount in c.bind_mounts:
            # A mount is severed if it does not exist on disk AND is not associated with any scanned project
            has_matching_project = any(
                _is_subpath(mount, p.path) or _is_subpath(p.path, mount)
                for p in projects
            )
            if not has_matching_project and not os.path.exists(mount):
                findings.append(
                    Finding(
                        id=f"ghost_container_{c.entity_id}_{abs(hash(mount))}",
                        title=f"Severed container infrastructure: {c.name}",
                        severity=FindingSeverity.WARNING,
                        category="Container Infrastructure",
                        summary=(
                            f"Docker container '{c.name}' (state: {c.state.value}) mounts host path "
                            f"'{mount}' which does not exist on the filesystem."
                        ),
                        entities_involved=[c.entity_id],
                        evidence=[
                            f"Container name: {c.name} (ID: {c.container_id[:12]})",
                            f"Container state: {c.state.value}",
                            f"Target host mount: {mount}",
                            "The referenced host directory does not exist on the filesystem.",
                        ],
                        reasoning_chain=[
                            "1. The container configuration specifies a bind mount to a host directory.",
                            "2. Filesystem verification confirmed the host path does not exist and no scanned project claims it.",
                            "3. The container's environment is severed from its intended host code or data.",
                        ],
                        uncertainties=[
                            "The mount path may reside on an unmounted external volume or network share.",
                        ],
                    )
                )

    # -------------------------------------------------------------------------
    # 7. Obsolete Build Cache (No Matching Language Projects on Machine)
    # -------------------------------------------------------------------------
    cache_to_project_types = {
        "gradle": [ProjectType.JAVA],
        "maven": [ProjectType.JAVA],
        "cargo": [ProjectType.RUST],
        "composer": [ProjectType.PHP],
        "nuget": [ProjectType.DOTNET],
    }

    project_types_present = {p.project_type for p in projects}

    for c in caches:
        expected_types = cache_to_project_types.get(c.category)
        if expected_types:
            has_matching_project = any(pt in project_types_present for pt in expected_types)
            if not has_matching_project and (c.size_bytes or 0) > 50 * 1024 * 1024:
                type_names = ", ".join(pt.value for pt in expected_types)
                findings.append(
                    Finding(
                        id=f"obsolete_cache_{c.entity_id}",
                        title=f"Potentially obsolete build cache: {c.description or c.category.capitalize()}",
                        severity=FindingSeverity.ATTENTION,
                        category="Storage & Tooling Lifecycle",
                        summary=(
                            f"{c.description or c.category.capitalize()} cache ({_format_size(c.size_bytes)}) "
                            f"exists, but no {type_names} projects were detected."
                        ),
                        entities_involved=[c.entity_id],
                        evidence=[
                            f"Cache path: {c.path}",
                            f"Cache size: {_format_size(c.size_bytes)}",
                            f"Toolchain category: {c.category}",
                            f"No projects of type {type_names} found in scan.",
                        ],
                        reasoning_chain=[
                            f"1. Build cache directory exists on disk for toolchain '{c.category}'.",
                            "2. Scanned environment contains zero projects requiring this toolchain.",
                            "3. The cache may be leftover storage from uninstalled or finished projects.",
                        ],
                        uncertainties=[
                            "Projects using this toolchain may exist outside the scanned directory scope.",
                        ],
                    )
                )

    return findings
