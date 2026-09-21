# Backend Subsystem: Entropy Core & CLI

## Overview

The backend engine is written in Python 3.9+ with standard library modules and `psutil`. It is designed to be lightweight, zero-bloat, and fast on Windows, macOS, and Linux.

---

## Core Modules (`core/` & `scan.py`)

### 1. `scan.py`
The CLI entrypoint handling command-line argument parsing and subcommand execution:
- `entropy inspect [path]`: Scans a single target directory and outputs workspace status, git state, dirty files, build sizes, and running processes. Supports `--json` flag.
- `entropy scan [paths...]`: Performs multi-root directory discovery across specified parent paths.
- `entropy desktop`: Launches the pywebview GUI window using `core/desktop_bridge.py`.

### 2. `core/workspace.py`
Defines the core `Workspace` entity model:
```python
class Workspace:
    path: Path
    name: str
    status: str  # "active" | "attention" | "inactive" | "all_good"
    last_modified: datetime
    git_info: Optional[GitInfo]
    dependencies: List[DependencyArtifact]
    running_processes: List[DevProcess]
    reclaimable_bytes: int
```

### 3. `core/reclaimer.py`
Calculates and executes safe clean operations:
- Identifies removable folders (`node_modules`, `target`, `.next`, `.venv`, `dist`, `__pycache__`).
- Computes recursive directory size without blocking main thread.
- Provides dry-run validation before execution.

---

## Collectors (`collectors/`)

- `git_collector.py`: Uses `git status --porcelain` and `git branch` or direct `.git` file parsing to inspect local git repository health.
- `process_collector.py`: Uses `psutil.process_iter()` to match running processes (`node.exe`, `python.exe`, `cargo.exe`) to workspace working directories via `proc.cwd()`.
- `dependency_collector.py`: Scans project files (`package.json`, `Cargo.toml`, `pyproject.toml`, `requirements.txt`) to classify project types and find build targets.

---

## Testing (`tests/`)
The Python test suite uses `unittest`:
```bash
python -m unittest discover tests
```
All new backend collectors and core methods MUST have corresponding unit tests in `tests/`.
