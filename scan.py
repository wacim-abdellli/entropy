#!/usr/bin/env python3
"""
Digital Entropy — System Intelligence Scanner (Windows-First)

A local-first, read-only system intelligence tool that models digital state
and detects digital entropy across projects, processes, runtimes, and containers.

Usage:
    python scan.py [TARGET_DIRECTORY] [OPTIONS]

Options:
    --depth N       Maximum directory traversal depth (default: 4)
    --json          Output raw JSON graph and findings
    --json-file F   Save JSON output to file
    --verbose, -v   Verbose debug logging
    --quiet, -q     Quiet mode
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import socket
import sys
import time
from dataclasses import asdict
from pathlib import Path

from collectors.caches import collect_caches
from collectors.docker import collect_docker
from collectors.git import collect_git_repository
from collectors.processes import collect_processes
from collectors.projects import collect_projects_and_dependencies
from collectors.runtimes import collect_runtimes
from core.entities import ScanResult, ScopeType
from core.findings import analyze_graph
from core.graph import EnvironmentGraph
from linkers.relationships import build_environment_graph
from report.inspect import format_inspect_report
from report.text import format_report


def determine_scope(target_paths: list[str] | str) -> ScopeType:
    if isinstance(target_paths, str):
        target_paths = [target_paths]

    if len(target_paths) > 1:
        return ScopeType.MULTI_ROOT

    norm_target = os.path.normcase(os.path.abspath(target_paths[0]))
    home = os.path.normcase(os.path.expanduser("~"))
    drive, rest = os.path.splitdrive(norm_target)
    if rest.strip(os.sep) == "":
        return ScopeType.MACHINE_WIDE
    if norm_target == home:
        return ScopeType.USER_ENVIRONMENT
    return ScopeType.LOCAL_DIRECTORY


def setup_logging(verbose: bool = False, quiet: bool = False) -> None:
    if quiet:
        level = logging.CRITICAL
    elif verbose:
        level = logging.DEBUG
    else:
        level = logging.WARNING

    logging.basicConfig(
        level=level,
        format="%(levelname)s [%(name)s] %(message)s",
        stream=sys.stderr,
    )


def run_entropy_scan(scan_roots: list[str] | str, max_depth: int = 4) -> tuple[EnvironmentGraph, list]:
    """Execute full scanner workflow and return (graph, findings)."""
    logger = logging.getLogger("entropy")
    scan_start = time.time()

    if isinstance(scan_roots, str):
        roots = [os.path.abspath(scan_roots)]
    else:
        roots = [os.path.abspath(r) for r in scan_roots]

    scope = determine_scope(roots)

    scan_result = ScanResult(
        scan_timestamp=scan_start,
        scan_root=roots[0] if roots else "",
        scan_roots=roots,
        scope_type=scope,
        hostname=socket.gethostname(),
    )

    # 1. Projects and dependency environments across all scan roots
    seen_project_paths: set[str] = set()
    all_projects: list[Project] = []
    all_dep_envs: list[DependencyEnvironment] = []

    for root in roots:
        logger.info(f"Scanning for projects in {root} (depth={max_depth})...")
        projects, dep_envs = collect_projects_and_dependencies(root, max_depth=max_depth)
        for p in projects:
            norm_p = os.path.normcase(os.path.abspath(p.path))
            if norm_p not in seen_project_paths:
                seen_project_paths.add(norm_p)
                all_projects.append(p)
        all_dep_envs.extend(dep_envs)

    scan_result.projects = all_projects
    scan_result.dep_environments = all_dep_envs
    logger.info(
        f"Detected {len(all_projects)} projects and {len(all_dep_envs)} dependency environments across {len(roots)} root(s)."
    )

    # 2. Git metadata for projects
    logger.info("Extracting Git metadata for repositories...")
    for p in all_projects:
        git_entry = os.path.join(p.path, ".git")
        if ".git" in p.detected_sentinels or os.path.exists(git_entry):
            try:
                repo = collect_git_repository(p.path)
                if repo:
                    scan_result.git_repos.append(repo)
            except Exception as e:
                logger.debug(f"Git inspection error on {p.path}: {e}")

    # 3. Processes
    logger.info("Inspecting active processes...")
    try:
        scan_result.processes = collect_processes()
        logger.info(f"Observed {len(scan_result.processes)} accessible processes.")
    except Exception as e:
        logger.warning(f"Process inspection failed: {e}")
        scan_result.errors.append(f"Process inspection: {e}")

    # 4. Runtimes
    logger.info("Detecting installed runtimes and SDKs...")
    try:
        scan_result.runtimes = collect_runtimes()
        logger.info(f"Found {len(scan_result.runtimes)} runtime installations.")
    except Exception as e:
        logger.warning(f"Runtime inspection failed: {e}")
        scan_result.errors.append(f"Runtime inspection: {e}")

    # 5. Docker
    logger.info("Inspecting Docker resources...")
    try:
        docker_ok, docker_err, containers, images, volumes = collect_docker()
        scan_result.docker_available = docker_ok
        scan_result.docker_error = docker_err
        scan_result.docker_containers = containers
        scan_result.docker_images = images
        scan_result.docker_volumes = volumes
    except Exception as e:
        logger.debug(f"Docker inspection error: {e}")
        scan_result.docker_available = False
        scan_result.docker_error = str(e)

    # 6. Caches
    logger.info("Inventorying caches...")
    try:
        scan_result.caches = collect_caches()
    except Exception as e:
        logger.debug(f"Cache inspection error: {e}")

    scan_result.scan_duration_seconds = time.time() - scan_start

    # 7. Assemble EnvironmentGraph and link relationships
    logger.info("Synthesizing relationship graph...")
    graph = build_environment_graph(scan_result)

    # 8. Run digital entropy analysis
    logger.info("Running cross-entity entropy analysis...")
    findings = analyze_graph(graph)

    return graph, findings


def run_entropy_inspect(target_dir: str) -> tuple[Optional[Project], EnvironmentGraph, list]:
    """Inspect a single workspace and return its targeted graph footprint."""
    logger = logging.getLogger("entropy")
    scan_start = time.time()
    abs_target = os.path.abspath(target_dir)

    projects, dep_envs = collect_projects_and_dependencies(abs_target, max_depth=2)

    target_project: Optional[Project] = None
    for p in projects:
        if os.path.normcase(p.path) == os.path.normcase(abs_target):
            target_project = p
            break

    if not target_project:
        if projects:
            target_project = projects[0]
        else:
            # Fallback: create generic Project entity for the inspected directory
            stat_info = None
            try:
                stat_info = os.stat(abs_target)
            except OSError:
                pass
            created_ts = stat_info.st_ctime if stat_info else None
            mtime_ts = stat_info.st_mtime if stat_info else None
            from collectors.projects import _get_dir_size
            total_size = _get_dir_size(abs_target)
            target_project = Project(
                entity_id=f"project:{abs_target}",
                path=abs_target,
                total_size_bytes=total_size,
                created=created_ts,
                last_modified=mtime_ts,
            )
            projects.append(target_project)

    matching_deps = [
        d for d in dep_envs
        if os.path.normcase(d.path).startswith(os.path.normcase(target_project.path))
    ]

    scan_result = ScanResult(
        scan_timestamp=scan_start,
        scan_root=target_project.path,
        scan_roots=[target_project.path],
        scope_type=ScopeType.LOCAL_DIRECTORY,
        hostname=socket.gethostname(),
        projects=[target_project],
        dep_environments=matching_deps,
    )

    # Git repository
    git_entry = os.path.join(target_project.path, ".git")
    if os.path.exists(git_entry):
        try:
            repo = collect_git_repository(target_project.path)
            if repo:
                scan_result.git_repos.append(repo)
        except Exception as e:
            logger.debug(f"Git inspection error: {e}")

    # Processes running from or within this project
    try:
        all_procs = collect_processes()
        norm_proj = os.path.normcase(target_project.path)
        matching_procs = []
        for pr in all_procs:
            if pr.cwd and os.path.normcase(pr.cwd).startswith(norm_proj):
                matching_procs.append(pr)
            elif pr.exe_path and os.path.normcase(pr.exe_path).startswith(norm_proj):
                matching_procs.append(pr)
        scan_result.processes = matching_procs
    except Exception as e:
        logger.debug(f"Process inspection error: {e}")

    # Runtimes
    try:
        scan_result.runtimes = collect_runtimes()
    except Exception:
        pass

    # Docker
    try:
        docker_ok, docker_err, containers, images, volumes = collect_docker()
        scan_result.docker_available = docker_ok
        norm_proj = os.path.normcase(target_project.path)
        relevant_containers = []
        for c in containers:
            for m in c.bind_mounts:
                if os.path.normcase(m).startswith(norm_proj) or norm_proj.startswith(os.path.normcase(m)):
                    relevant_containers.append(c)
                    break
        scan_result.docker_containers = relevant_containers
        scan_result.docker_volumes = volumes
    except Exception:
        pass

    # Caches
    try:
        scan_result.caches = collect_caches()
    except Exception:
        pass

    scan_result.scan_duration_seconds = time.time() - scan_start
    graph = build_environment_graph(scan_result)
    findings = analyze_graph(graph)

    return target_project, graph, findings


def serialize_graph_and_findings(graph: EnvironmentGraph, findings: list) -> str:
    """Serialize graph entities, relationships, and findings into JSON."""
    data = {
        "scan_metadata": {
            "timestamp": graph.scan_timestamp,
            "duration_seconds": graph.scan_duration_seconds,
            "root": graph.scan_root,
            "roots": graph.scan_roots,
            "scope_type": graph.scope_type.value,
            "hostname": graph.hostname,
            "docker_available": graph.docker_available,
        },
        "entities": {
            eid: asdict(ent) for eid, ent in graph.entities.items()
        },
        "relationships": [
            asdict(r) for r in graph.relationships
        ],
        "findings": [
            asdict(f) for f in findings
        ],
    }
    return json.dumps(data, indent=2, default=str)


def main() -> None:
    # Ensure stdout and stderr support UTF-8 on Windows
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(
        description="Digital Entropy — System Intelligence Scanner (Windows-First).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "targets",
        nargs="*",
        default=None,
        help="One or more target directories to inspect (default: user home)",
    )
    parser.add_argument(
        "--depth",
        type=int,
        default=4,
        help="Maximum directory traversal depth (default: 4)",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        dest="json_output",
        help="Output raw JSON graph and findings",
    )
    parser.add_argument(
        "--json-file",
        type=str,
        default=None,
        help="Save JSON report to file",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable verbose debug logging",
    )
    parser.add_argument(
        "--quiet", "-q",
        action="store_true",
        help="Suppress all logging output",
    )

    args = parser.parse_args()
    setup_logging(verbose=args.verbose, quiet=args.quiet)

    # 1. Handle 'inspect <path>' subcommand
    if args.targets and args.targets[0].lower() == "inspect":
        target_dir = args.targets[1] if len(args.targets) > 1 else "."
        abs_target = os.path.abspath(target_dir)
        if not os.path.isdir(abs_target):
            print(f"Error: Target directory '{abs_target}' does not exist.", file=sys.stderr)
            sys.exit(1)

        target_project, graph, findings = run_entropy_inspect(abs_target)
        if args.json_output:
            print(serialize_graph_and_findings(graph, findings))
        else:
            if target_project:
                print(format_inspect_report(target_project, graph, findings))
            else:
                print(f"Error: Could not inspect workspace at '{abs_target}'.", file=sys.stderr)
        return

    # 2. Standard multi-root or single-root environment scan
    if not args.targets:
        target_paths = [os.path.abspath(os.path.expanduser("~"))]
    else:
        target_paths = [os.path.abspath(t) for t in args.targets]

    for p in target_paths:
        if not os.path.isdir(p):
            print(f"Error: Target directory '{p}' does not exist.", file=sys.stderr)
            sys.exit(1)

    graph, findings = run_entropy_scan(target_paths, max_depth=args.depth)

    if args.json_output:
        print(serialize_graph_and_findings(graph, findings))
    else:
        print(format_report(graph, findings))

    if args.json_file:
        try:
            with open(args.json_file, "w", encoding="utf-8") as f:
                f.write(serialize_graph_and_findings(graph, findings))
            if not args.quiet:
                print(f"\nJSON graph and findings saved to: {args.json_file}", file=sys.stderr)
        except OSError as e:
            print(f"Error writing JSON file: {e}", file=sys.stderr)


if __name__ == "__main__":
    main()
