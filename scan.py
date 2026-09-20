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
from report.text import format_report


def determine_scope(target_path: str) -> ScopeType:
    norm_target = os.path.normcase(os.path.abspath(target_path))
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


def run_entropy_scan(scan_root: str, max_depth: int = 4) -> tuple[EnvironmentGraph, list]:
    """Execute full scanner workflow and return (graph, findings)."""
    logger = logging.getLogger("entropy")
    scan_start = time.time()
    scope = determine_scope(scan_root)

    scan_result = ScanResult(
        scan_timestamp=scan_start,
        scan_root=os.path.abspath(scan_root),
        scope_type=scope,
        hostname=socket.gethostname(),
    )

    # 1. Projects and dependency environments
    logger.info(f"Scanning for projects in {scan_root} (depth={max_depth})...")
    projects, dep_envs = collect_projects_and_dependencies(scan_root, max_depth=max_depth)
    scan_result.projects = projects
    scan_result.dep_environments = dep_envs
    logger.info(f"Detected {len(projects)} projects and {len(dep_envs)} dependency environments.")

    # 2. Git metadata for projects
    logger.info("Extracting Git metadata for repositories...")
    for p in projects:
        if ".git" in p.detected_sentinels or os.path.isdir(os.path.join(p.path, ".git")):
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


def serialize_graph_and_findings(graph: EnvironmentGraph, findings: list) -> str:
    """Serialize graph entities, relationships, and findings into JSON."""
    data = {
        "scan_metadata": {
            "timestamp": graph.scan_timestamp,
            "duration_seconds": graph.scan_duration_seconds,
            "root": graph.scan_root,
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
        "target",
        nargs="?",
        default=os.path.expanduser("~"),
        help="Target directory to inspect (default: user home)",
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

    target_path = os.path.abspath(args.target)
    if not os.path.isdir(target_path):
        print(f"Error: Target directory '{target_path}' does not exist.", file=sys.stderr)
        sys.exit(1)

    graph, findings = run_entropy_scan(target_path, max_depth=args.depth)

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
