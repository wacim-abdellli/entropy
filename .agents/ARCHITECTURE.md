# Subsystem Architecture: Entropy

## Overview

Entropy is a dual-interface workspace management utility:
1. **Python CLI Engine (`entropy-cli`)**: Fast, dependency-light scanner and inspection utility built with Python 3.9+ and `psutil`.
2. **React Desktop Application (`desktop/`)**: Rich, action-oriented desktop frontend built with React 19, Vite, TypeScript, and Tailwind CSS 4, integrated via `pywebview`.

---

## Data Flow Diagram

```
[ Developer Filesystem ]
           │
           ▼
[ Collectors Layer ]
 ├── git_collector.py      --> Reads .git state, branch, uncommitted diffs
 ├── process_collector.py  --> Scans psutil for active node/python/rust dev servers
 └── dependency_collector.py--> Scans node_modules, target, .next, venv sizes
           │
           ▼
[ Core Engines ]
 ├── workspace.py          --> Merges collector output into unified Workspace model
 ├── reclaimer.py          --> Calculates total reclaimable bytes across projects
 └── scanner.py            --> Parallel directory walker for multi-root workspace discovery
           │
 ┌─────────┴────────────────────────┐
 │                                  │
 ▼                                  ▼
[ CLI Terminal Output ]       [ pywebview Bridge ]
(Tables, JSON export)               │
                                    ▼
                          [ React 19 Desktop GUI ]
                          (Sidebar, Overview, Cleanup, Inspector)
```

---

## Key Subsystems

### 1. Collectors (`collectors/`)
- **Git Collector**: Runs low-overhead git status checks or parses `.git/` folder directly to determine if a workspace has uncommitted changes, untracked files, or local stashes.
- **Process Collector**: Uses `psutil` to trace running developer processes (Vite, Next.js, Webpack, Cargo, Python, Docker) back to their working directories and exposed network ports.
- **Dependency Collector**: Identifies build artifacts and calculate disk footprint of `node_modules/`, `target/`, `.venv/`, `.next/`, `dist/`, and `__pycache__/`.

### 2. Core Engines (`core/`)
- **Workspace Model (`core/workspace.py`)**: Data structure representing a single developer project, including path, name, status (`active`, `attention`, `inactive`), dirty files, dependencies, and linked processes.
- **Disk Reclaimer (`core/reclaimer.py`)**: Safety-checked artifact cleaner that can safely delete build outputs while preserving source files and configurations.
- **Desktop Launcher (`core/desktop_bridge.py`)**: Spawns a native `pywebview` window serving the built Vite bundle (`desktop/dist/`) with bidirectional RPC methods exposed to JavaScript.

### 3. Desktop Application (`desktop/src/`)
- **Vite SPA**: High-performance React 19 single page application using Tailwind CSS 4 `@theme` tokens.
- **Fallback Mocking**: Includes `services/mockData.ts` so the frontend UI can be previewed independently in standard web browsers (`npm run dev`) or executed inside `pywebview`.
