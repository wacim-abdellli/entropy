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
from core.entities import Project, ScanResult, ScopeType
from core.findings import analyze_graph
from core.graph import EnvironmentGraph
from linkers.relationships import build_environment_graph
from report.contract import serialize_environment_overview, serialize_workspace_inspection
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

    from concurrent.futures import ThreadPoolExecutor

    def _scan_root(r: str):
        return collect_projects_and_dependencies(r, max_depth=max_depth)

    if len(roots) > 1:
        with ThreadPoolExecutor(max_workers=min(4, len(roots))) as executor:
            for projects, dep_envs in executor.map(_scan_root, roots):
                for p in projects:
                    norm_p = os.path.normcase(os.path.abspath(p.path))
                    if norm_p not in seen_project_paths:
                        seen_project_paths.add(norm_p)
                        all_projects.append(p)
                all_dep_envs.extend(dep_envs)
    else:
        for root in roots:
            logger.info(f"Scanning for projects in {root} (depth={max_depth})...")
            projects, dep_envs = collect_projects_and_dependencies(root, max_depth=max_depth)
            for p in projects:
                norm_p = os.path.normcase(os.path.abspath(p.path))
                if norm_p not in seen_project_paths:
                    seen_project_paths.add(norm_p)
                    all_projects.append(p)
            all_dep_envs.extend(dep_envs)

    # Ensure any explicitly specified scan root directory is retained as a workspace
    for root in roots:
        norm_r = os.path.normcase(os.path.abspath(root))
        if norm_r not in seen_project_paths and os.path.isdir(root):
            has_child_project = any(p.startswith(norm_r + os.sep) for p in seen_project_paths)
            if not has_child_project:
                stat_info = None
                try:
                    stat_info = os.stat(root)
                except OSError:
                    pass
                created_ts = stat_info.st_ctime if stat_info else None
                mtime_ts = stat_info.st_mtime if stat_info else None
                from collectors.projects import _get_dir_size
                total_size = _get_dir_size(root)
                root_proj = Project(
                    entity_id=f"project:{os.path.abspath(root)}",
                    path=os.path.abspath(root),
                    total_size_bytes=total_size,
                    created=created_ts,
                    last_modified=mtime_ts,
                )
                seen_project_paths.add(norm_r)
                all_projects.append(root_proj)

    scan_result.projects = all_projects
    scan_result.dep_environments = all_dep_envs
    logger.info(
        f"Detected {len(all_projects)} projects and {len(all_dep_envs)} dependency environments across {len(roots)} root(s)."
    )

    # 2. Git metadata for projects
    logger.info("Extracting Git metadata for repositories...")

    def _collect_git_safe(proj: Project) -> Optional[GitRepository]:
        git_entry = os.path.join(proj.path, ".git")
        if ".git" in proj.detected_sentinels or os.path.exists(git_entry):
            try:
                return collect_git_repository(proj.path)
            except Exception as e:
                logger.debug(f"Git inspection error on {proj.path}: {e}")
        return None

    # 2. Concurrently collect Git, Processes, Runtimes, Docker, and Caches
    logger.info("Concurrently inspecting Git, Processes, Runtimes, Docker, and Caches...")
    
    with ThreadPoolExecutor(max_workers=min(12, max(4, len(all_projects) + 4))) as executor:
        # Submit system background collectors in parallel
        f_processes = executor.submit(collect_processes)
        f_runtimes = executor.submit(collect_runtimes)
        f_docker = executor.submit(collect_docker)
        f_caches = executor.submit(collect_caches)

        # Collect Git repositories in parallel
        if all_projects:
            for repo in executor.map(_collect_git_safe, all_projects):
                if repo:
                    scan_result.git_repos.append(repo)

        # Retrieve background collector results
        try:
            scan_result.processes = f_processes.result()
            logger.info(f"Observed {len(scan_result.processes)} accessible processes.")
        except Exception as e:
            logger.warning(f"Process inspection failed: {e}")
            scan_result.errors.append(f"Process inspection: {e}")

        try:
            scan_result.runtimes = f_runtimes.result()
            logger.info(f"Found {len(scan_result.runtimes)} runtime installations.")
        except Exception as e:
            logger.warning(f"Runtime inspection failed: {e}")
            scan_result.errors.append(f"Runtime inspection: {e}")

        try:
            docker_ok, docker_err, containers, images, volumes = f_docker.result()
            scan_result.docker_available = docker_ok
            scan_result.docker_error = docker_err
            scan_result.docker_containers = containers
            scan_result.docker_images = images
            scan_result.docker_volumes = volumes
        except Exception as e:
            logger.debug(f"Docker inspection error: {e}")
            scan_result.docker_available = False
            scan_result.docker_error = str(e)

        try:
            scan_result.caches = f_caches.result()
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


__version__ = "0.1.0"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="entropy",
        description="Entropy — Evidence-backed workspace state and digital entropy reconstruction.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Commands:
  inspect [path]       Inspect a workspace directory (Default: current directory '.')
  scan [paths...]      Scan developer directories across the environment

Examples:
  entropy inspect .
  entropy inspect C:\\dev\\my-app
  entropy inspect . --json
  entropy scan C:\\dev C:\\repos
  entropy --version
""",
    )
    parser.add_argument(
        "--version",
        action="version",
        version=f"entropy {__version__}",
        help="Show version and exit",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable verbose debug logging to stderr",
    )
    parser.add_argument(
        "--quiet", "-q",
        action="store_true",
        help="Suppress all logging output",
    )

    subparsers = parser.add_subparsers(dest="command", help="Available subcommands")

    # 1. 'inspect' subcommand (PRIMARY)
    inspect_parser = subparsers.add_parser(
        "inspect",
        help="Inspect a specific workspace (Primary command)",
        description="Reconstruct workspace identity, state, connections, evidence, uncertainty, and action boundaries.",
    )
    inspect_parser.add_argument(
        "path",
        nargs="?",
        default=".",
        help="Path to workspace directory (default: current directory '.')",
    )
    inspect_parser.add_argument(
        "--json",
        action="store_true",
        dest="json_output",
        help="Output raw JSON graph and findings",
    )

    # 2. 'scan' subcommand (multi-root environment)
    scan_parser = subparsers.add_parser(
        "scan",
        help="Perform a multi-root or machine-wide environment scan",
        description="Scan one or more directory trees to detect projects, caches, processes, and runtimes.",
    )
    scan_parser.add_argument(
        "targets",
        nargs="*",
        default=None,
        help="One or more target directories to scan (default: user home)",
    )
    scan_parser.add_argument(
        "--depth",
        type=int,
        default=4,
        help="Maximum directory traversal depth (default: 4)",
    )
    scan_parser.add_argument(
        "--json",
        action="store_true",
        dest="json_output",
        help="Output raw JSON graph and findings",
    )
    scan_parser.add_argument(
        "--json-file",
        type=str,
        default=None,
        help="Save JSON report to file",
    )

    # 3. 'desktop' subcommand (launch GUI)
    desktop_parser = subparsers.add_parser(
        "desktop",
        help="Launch the Entropy Desktop graphical user interface",
        description="Open the Entropy interactive visual interface in a native Windows window.",
    )
    desktop_parser.add_argument(
        "--dev",
        action="store_true",
        help="Connect to Vite dev server at localhost:5173",
    )

    return parser


def main(argv: Optional[List[str]] = None) -> int:
    # Ensure stdout and stderr support UTF-8 on Windows
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass
    if hasattr(sys.stderr, "reconfigure"):
        try:
            sys.stderr.reconfigure(encoding="utf-8")
        except Exception:
            pass

    parser = build_parser()
    raw_args = list(sys.argv[1:] if argv is None else argv)

    # If no arguments provided at all, print help and return 0
    if not raw_args:
        parser.print_help()
        return 0

    # Ergonomic shortcut: if first arg is not a recognized command/flag,
    # treat it as a path to inspect (e.g. 'entropy .' or 'entropy C:\dev\repo')
    first_arg = raw_args[0].lower()
    if first_arg not in ("inspect", "scan", "desktop", "-h", "--help", "-v", "--verbose", "-q", "--quiet", "--version"):
        if not first_arg.startswith("-"):
            raw_args.insert(0, "inspect")

    args = parser.parse_args(raw_args)
    setup_logging(verbose=args.verbose, quiet=args.quiet)

    if args.command == "inspect":
        target_dir = args.path
        abs_target = os.path.abspath(target_dir)

        if not os.path.exists(abs_target):
            print(f"Error: Target path '{abs_target}' does not exist.", file=sys.stderr)
            return 1
        if not os.path.isdir(abs_target):
            print(f"Error: Path '{abs_target}' is not a directory.", file=sys.stderr)
            return 1

        try:
            target_project, graph, findings = run_entropy_inspect(abs_target)
        except PermissionError as e:
            print(f"Error: Permission denied accessing '{abs_target}': {e}", file=sys.stderr)
            return 1
        except Exception as e:
            print(f"Error: Inspection failed for '{abs_target}': {e}", file=sys.stderr)
            return 1

        if args.json_output:
            if target_project:
                print(json.dumps(serialize_workspace_inspection(target_project, graph, findings), indent=2, default=str))
            else:
                print(serialize_graph_and_findings(graph, findings))
        else:
            if target_project:
                print(format_inspect_report(target_project, graph, findings))
            else:
                print(f"Error: Could not inspect workspace at '{abs_target}'.", file=sys.stderr)
                return 1
        return 0

    elif args.command == "scan":
        if not args.targets:
            target_paths = [os.path.abspath(os.path.expanduser("~"))]
        else:
            target_paths = [os.path.abspath(t) for t in args.targets]

        for p in target_paths:
            if not os.path.exists(p):
                print(f"Error: Target path '{p}' does not exist.", file=sys.stderr)
                return 1
            if not os.path.isdir(p):
                print(f"Error: Path '{p}' is not a directory.", file=sys.stderr)
                return 1

        try:
            graph, findings = run_entropy_scan(target_paths, max_depth=args.depth)
        except Exception as e:
            print(f"Error: Scan failed: {e}", file=sys.stderr)
            return 1

        overview_json = json.dumps(serialize_environment_overview(graph, findings), indent=2, default=str)
        if args.json_output:
            print(overview_json)
        else:
            print(format_report(graph, findings))

        if args.json_file:
            try:
                with open(args.json_file, "w", encoding="utf-8") as f:
                    f.write(overview_json)
                if not args.quiet:
                    print(f"\nJSON graph and findings saved to: {args.json_file}", file=sys.stderr)
            except OSError as e:
                print(f"Error writing JSON file: {e}", file=sys.stderr)
                return 1
        return 0

    elif args.command == "desktop":
        try:
            from desktop.app import main as launch_desktop
            launch_desktop()
            return 0
        except ImportError as e:
            print(f"Error: Could not launch Entropy Desktop: {e}", file=sys.stderr)
            print("To run Entropy Desktop, install dependencies: pip install pywebview", file=sys.stderr)
            return 1
        except Exception as e:
            print(f"Error running desktop application: {e}", file=sys.stderr)
            return 1

    else:
        parser.print_help()
        return 0


if __name__ == "__main__":
    sys.exit(main())
