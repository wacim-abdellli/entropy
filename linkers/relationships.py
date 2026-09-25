"""
Relationship linker module.

Transforms a raw ScanResult into an EnvironmentGraph by discovering
and validating typed relationships between Projects, Git repositories,
Processes, Runtimes, Dependencies, and Docker resources.
"""

from __future__ import annotations

import logging
import os
import time
from typing import Dict, List, Optional

from core.entities import (
    ActivityLevel,
    DockerContainer,
    DockerImage,
    DockerVolume,
    GitRepository,
    Process,
    Project,
    ProjectType,
    RuntimeInstallation,
    ScanResult,
)
from core.graph import EnvironmentGraph, Observability, RelationshipType
from core.process_control import PROTECTED_PROCESS_NAMES

logger = logging.getLogger(__name__)


def _is_subpath(child: Optional[str], parent: Optional[str]) -> bool:
    """Check if child path is equal to or located inside parent directory."""
    if not child or not parent or not child.strip() or not parent.strip():
        return False
    try:
        norm_child = os.path.normcase(os.path.abspath(child))
        norm_parent = os.path.normcase(os.path.abspath(parent))
        if norm_child == norm_parent:
            return True
        return norm_child.startswith(norm_parent + os.sep)
    except Exception:
        return False


def _classify_project_activity(
    last_commit_ts: Optional[float],
    last_modified_ts: Optional[float],
    current_ts: float,
) -> ActivityLevel:
    """Classify project activity level based on git commit date or filesystem timestamps."""
    ts = last_commit_ts or last_modified_ts
    if ts is None:
        return ActivityLevel.UNKNOWN

    diff_days = (current_ts - ts) / 86400.0
    if diff_days <= 30:
        return ActivityLevel.ACTIVE
    if diff_days <= 180:
        return ActivityLevel.INACTIVE
    if diff_days <= 365:
        return ActivityLevel.STALE
    return ActivityLevel.DORMANT


def build_environment_graph(scan: ScanResult) -> EnvironmentGraph:
    """
    Assembles the EnvironmentGraph from a ScanResult and infers cross-entity relationships.
    """
    graph = EnvironmentGraph(
        scan_timestamp=scan.scan_timestamp,
        scan_duration_seconds=scan.scan_duration_seconds,
        scan_root=scan.scan_root,
        scan_roots=list(scan.scan_roots),
        scope_type=scan.scope_type,
        hostname=scan.hostname,
        docker_available=scan.docker_available,
        errors=list(scan.errors),
    )

    current_time = time.time()

    # 1. Register all entities in graph
    for p in scan.projects:
        graph.add_entity(p)
    for g in scan.git_repos:
        graph.add_entity(g)
    for proc in scan.processes:
        graph.add_entity(proc)
    for rt in scan.runtimes:
        graph.add_entity(rt)
    for dep in scan.dep_environments:
        graph.add_entity(dep)
    for c in scan.docker_containers:
        graph.add_entity(c)
    for img in scan.docker_images:
        graph.add_entity(img)
    for vol in scan.docker_volumes:
        graph.add_entity(vol)
    for cache in scan.caches:
        graph.add_entity(cache)

    # Index git repos by path
    git_by_path: Dict[str, GitRepository] = {
        os.path.normcase(g.path): g for g in scan.git_repos
    }

    # 2. Link Project -> GitRepository (DIRECTLY OBSERVABLE)
    for p in scan.projects:
        norm_p_path = os.path.normcase(p.path)
        git_repo = git_by_path.get(norm_p_path)
        if git_repo:
            graph.add_relationship(
                source_id=p.entity_id,
                target_id=git_repo.entity_id,
                rel_type=RelationshipType.CONTAINS,
                observability=Observability.DIRECTLY_OBSERVABLE,
                evidence=f".git repository located directly at {p.path}",
            )
            # Update project activity level using verified git commit history
            p.activity = _classify_project_activity(
                git_repo.last_commit_timestamp,
                p.last_modified,
                current_time,
            )
        else:
            p.activity = _classify_project_activity(
                None,
                p.last_modified,
                current_time,
            )

    # 3. Link Project -> DependencyEnvironment (DIRECTLY OBSERVABLE)
    for dep in scan.dep_environments:
        for p in scan.projects:
            if _is_subpath(dep.path, p.path):
                graph.add_relationship(
                    source_id=p.entity_id,
                    target_id=dep.entity_id,
                    rel_type=RelationshipType.CONTAINS,
                    observability=Observability.DIRECTLY_OBSERVABLE,
                    evidence=f"{dep.dep_type} directory located inside project path",
                )
                break

    # 4. Link Process -> Project (STRONGLY INFERABLE)
    for proc in scan.processes:
        proc_name_lower = (proc.name or "").lower()
        # Never associate IDEs, text editors, AI coding tools, browsers, or system utilities as project dev processes
        if proc_name_lower in PROTECTED_PROCESS_NAMES or proc_name_lower.replace(".exe", "") in PROTECTED_PROCESS_NAMES:
            continue

        matched_project = None
        match_reason = ""

        # Check working directory (cwd)
        if proc.cwd:
            for p in scan.projects:
                if _is_subpath(proc.cwd, p.path):
                    matched_project = p
                    match_reason = f"Process '{proc.name}' (PID {proc.pid}) working directory ({proc.cwd}) is within project"
                    break

        # Check executable path if not matched by cwd
        if not matched_project and proc.exe_path:
            for p in scan.projects:
                if _is_subpath(proc.exe_path, p.path):
                    matched_project = p
                    match_reason = f"Process executable ({proc.exe_path}) resides inside project"
                    break

        if matched_project:
            graph.add_relationship(
                source_id=proc.entity_id,
                target_id=matched_project.entity_id,
                rel_type=RelationshipType.RUNS_FROM,
                observability=Observability.STRONGLY_INFERABLE,
                evidence=match_reason,
            )

    # 5. Link Process -> RuntimeInstallation (STRONGLY INFERABLE)
    for proc in scan.processes:
        if proc.exe_path:
            norm_exe = os.path.normcase(proc.exe_path)
            for rt in scan.runtimes:
                if rt.path and _is_subpath(norm_exe, os.path.normcase(rt.path)):
                    graph.add_relationship(
                        source_id=proc.entity_id,
                        target_id=rt.entity_id,
                        rel_type=RelationshipType.RUNS_ON,
                        observability=Observability.STRONGLY_INFERABLE,
                        evidence=f"Executable path matches runtime installation {rt.runtime} {rt.version}",
                    )
                    break

    # 6. Link Project -> RuntimeInstallation (STRONGLY INFERABLE)
    for p in scan.projects:
        if p.runtime_version_hint:
            hint = p.runtime_version_hint.lower().lstrip("v").strip()
            for rt in scan.runtimes:
                # e.g., hint "18" matches version "18.17.0"
                if rt.version.startswith(hint) or hint == rt.version:
                    graph.add_relationship(
                        source_id=p.entity_id,
                        target_id=rt.entity_id,
                        rel_type=RelationshipType.USES_RUNTIME,
                        observability=Observability.STRONGLY_INFERABLE,
                        evidence=f"Project runtime hint '{p.runtime_version_hint}' matches installed {rt.runtime} {rt.version}",
                    )
                    break

    # 7. Link DockerContainer -> Project via bind mounts (DIRECTLY OBSERVABLE)
    for c in scan.docker_containers:
        for mount in c.bind_mounts:
            for p in scan.projects:
                if _is_subpath(mount, p.path) or _is_subpath(p.path, mount):
                    graph.add_relationship(
                        source_id=c.entity_id,
                        target_id=p.entity_id,
                        rel_type=RelationshipType.BIND_MOUNTS,
                        observability=Observability.DIRECTLY_OBSERVABLE,
                        evidence=f"Docker container '{c.name}' mounts host directory: {mount}",
                    )
                    break

    # 8. Link DockerContainer -> DockerImage (DIRECTLY OBSERVABLE)
    for c in scan.docker_containers:
        if c.image:
            for img in scan.docker_images:
                if c.image in img.tags or c.image == img.image_id or img.image_id.startswith(c.image):
                    graph.add_relationship(
                        source_id=c.entity_id,
                        target_id=img.entity_id,
                        rel_type=RelationshipType.USES_IMAGE,
                        observability=Observability.DIRECTLY_OBSERVABLE,
                        evidence=f"Container uses image {c.image}",
                    )
                    break

    # 9. Link Project -> Project via SHARES_REMOTE (DIRECTLY OBSERVABLE duplicate detection)
    git_projects = [
        (p, git_by_path[os.path.normcase(p.path)])
        for p in scan.projects
        if os.path.normcase(p.path) in git_by_path
    ]

    for i in range(len(git_projects)):
        p1, g1 = git_projects[i]
        if not g1.remote_repo_id:
            continue
        for j in range(i + 1, len(git_projects)):
            p2, g2 = git_projects[j]
            if not g2.remote_repo_id:
                continue

            if g1.remote_repo_id.lower() == g2.remote_repo_id.lower() and p1.path != p2.path:
                is_wt = g1.is_worktree or g2.is_worktree
                ev_text = (
                    f"Both projects share the same remote repository via Git Worktree: {g1.remote_repo_id}"
                    if is_wt
                    else f"Both projects clone the same remote repository: {g1.remote_repo_id}"
                )
                graph.add_relationship(
                    source_id=p1.entity_id,
                    target_id=p2.entity_id,
                    rel_type=RelationshipType.SHARES_REMOTE,
                    observability=Observability.DIRECTLY_OBSERVABLE,
                    evidence=ev_text,
                )

    return graph
