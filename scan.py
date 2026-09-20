#!/usr/bin/env python3
"""
Digital Entropy — Environment Scanner

Read-only tool that inspects a developer's machine and builds a model
of its digital environment.

Usage:
    python scan.py [TARGET_DIRECTORY] [OPTIONS]

Options:
    --json          Output raw JSON instead of formatted report
    --json-file F   Write JSON report to file F (in addition to text output)
    --depth N       Maximum directory traversal depth (default: 5)
    --verbose       Enable verbose logging
    --quiet         Suppress all logging output

If TARGET_DIRECTORY is omitted, defaults to the current user's home directory.
"""

import argparse
import json
import logging
import os
import platform
import socket
import sys
import time

from collectors.projects import collect_projects
from collectors.runtimes import collect_runtimes
from collectors.docker import collect_docker
from collectors.caches import collect_caches
from model.inventory import EnvironmentInventory
from report.text import format_report


def setup_logging(verbose: bool = False, quiet: bool = False) -> None:
    """Configure logging based on verbosity flags."""
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


def run_scan(scan_root: str, max_depth: int = 5) -> EnvironmentInventory:
    """Execute a full environment scan and return the inventory."""
    logger = logging.getLogger("scan")

    inventory = EnvironmentInventory()
    inventory.scan_timestamp = time.time()
    inventory.scan_root = os.path.abspath(scan_root)
    inventory.hostname = socket.gethostname()

    start_time = time.time()

    # --- Collect projects ---
    logger.info("Scanning for projects in %s (depth=%d)...", scan_root, max_depth)
    try:
        inventory.projects = collect_projects(scan_root, max_depth=max_depth)
        logger.info("Found %d projects.", len(inventory.projects))
    except Exception as e:
        logger.error("Project collection failed: %s", e)
        inventory.errors.append(f"Project collection failed: {e}")

    # --- Collect runtimes ---
    logger.info("Detecting installed runtimes...")
    try:
        inventory.runtimes = collect_runtimes()
        logger.info("Found %d runtime installations.", len(inventory.runtimes))
    except Exception as e:
        logger.error("Runtime collection failed: %s", e)
        inventory.errors.append(f"Runtime collection failed: {e}")

    # --- Collect Docker state ---
    logger.info("Inspecting Docker state...")
    try:
        inventory.docker = collect_docker()
        if inventory.docker.available:
            logger.info(
                "Docker: %d containers, %d images, %d volumes.",
                len(inventory.docker.containers),
                len(inventory.docker.images),
                len(inventory.docker.volumes),
            )
        else:
            logger.info("Docker not available: %s", inventory.docker.error)
    except Exception as e:
        logger.error("Docker collection failed: %s", e)
        inventory.errors.append(f"Docker collection failed: {e}")

    # --- Collect caches ---
    logger.info("Inventorying caches...")
    try:
        inventory.caches = collect_caches()
        logger.info("Found %d cache entries.", len(inventory.caches))
    except Exception as e:
        logger.error("Cache collection failed: %s", e)
        inventory.errors.append(f"Cache collection failed: {e}")

    inventory.scan_duration_seconds = time.time() - start_time
    return inventory


def main() -> None:
    # Ensure stdout can handle Unicode (fixes Windows cp1252 encoding errors)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(
        description="Digital Entropy — Environment Scanner. "
        "Inspects a developer's machine and reports on digital entropy.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "target",
        nargs="?",
        default=os.path.expanduser("~"),
        help="Root directory to scan (default: home directory)",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        dest="json_output",
        help="Output raw JSON instead of formatted report",
    )
    parser.add_argument(
        "--json-file",
        type=str,
        default=None,
        help="Write JSON report to a file (in addition to text output)",
    )
    parser.add_argument(
        "--depth",
        type=int,
        default=5,
        help="Maximum directory traversal depth (default: 5)",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable verbose logging",
    )
    parser.add_argument(
        "--quiet", "-q",
        action="store_true",
        help="Suppress all logging output",
    )

    args = parser.parse_args()
    setup_logging(verbose=args.verbose, quiet=args.quiet)

    # Validate target directory
    target = os.path.abspath(args.target)
    if not os.path.isdir(target):
        print(f"Error: '{target}' is not a valid directory.", file=sys.stderr)
        sys.exit(1)

    # Run the scan
    inventory = run_scan(target, max_depth=args.depth)

    # Output results
    if args.json_output:
        print(inventory.to_json())
    else:
        print(format_report(inventory))

    # Optionally write JSON to file
    if args.json_file:
        try:
            with open(args.json_file, "w", encoding="utf-8") as f:
                f.write(inventory.to_json())
            if not args.quiet:
                print(f"\nJSON report written to: {args.json_file}", file=sys.stderr)
        except OSError as e:
            print(f"Error writing JSON file: {e}", file=sys.stderr)
            sys.exit(1)

    # Report errors if any
    if inventory.errors and not args.quiet:
        print(f"\n{len(inventory.errors)} error(s) during scan:", file=sys.stderr)
        for err in inventory.errors:
            print(f"  - {err}", file=sys.stderr)


if __name__ == "__main__":
    main()
