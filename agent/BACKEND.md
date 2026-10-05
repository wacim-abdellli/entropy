# Backend Engine Reference (`core/` & `collectors/`)

All backend code is in Python 3.10+ and located in `core/` (business logic) and `collectors/` (data collection).

---

## 🛠️ Core Engines (`core/`)

| File | Purpose & Key Methods |
| :--- | :--- |
| `smart_mover.py` | **Rescue C: Drive**: Moves heavy folders (`.gradle`, `.m2`, Android SDK) to `D:` via transparent NTFS Directory Junctions (`mklink /J`). Win32 verification using `DeviceIoControl` with `FSCTL_GET_REPARSE_POINT`. Includes 1-click rollback and 0–100% transfer velocity telemetry. |
| `ssd_lens.py` | **SSD Storage Lens**: Analyzes multi-drive capacity and aggregates disk space by developer domain spectrum (Node, Rust, Python, Android, Docker, Windows). Identifies ReFS Dev Drives. |
| `duplicate_finder.py` | **3-Pass Duplicate Hunter**: 1) Size clustering, 2) Head/Tail partial MD5, 3) Full SHA-256 byte verification. Supports batch "Select All Duplicates" and Recycle Bin deletion. |
| `partition_wizard.py` | **Windows Shrink Wizard**: Queries Windows CIM/WMI `MSFT_Partition` to calculate maximum shrinkable boundaries on `C:` without touching unmovable files. |
| `network_monitor.py` | **Port & Socket Forensics**: Scans active TCP/UDP listening sockets via `psutil.net_connections()`, correlates to PIDs and process names, flags dev ports (3000, 5173, etc.), and releases jammed ports. |
| `startup_manager.py` | **Startup Apps**: Synchronizes with Windows Task Manager across `HKCU` and `HKLM` Run registries. Toggles or removes startup apps with dev classification. |
| `system_info.py` | **Hardware Forensics**: Detects dual GPUs (NVIDIA RTX / AMD / Intel), VRAM, NVMe vs SATA bus types, partition topology, and live non-blocking Disk/Network I/O throughput. |
| `disk_cleaner.py` | **Build Artifact Cleaner**: Deletes `node_modules`, `target`, `.venv`, `.next`, etc., with mandatory `git ls-files` verification before removal. |
| `cache_cleaner.py` | **Package Cache Purger**: Purges global caches for `npm`, `pnpm`, `yarn`, `pip`, `cargo`, `nuget`, `go`, `gradle`, and `cocoapods`. |
| `system_cleaner.py` | **Windows System Junk**: Cleans temp files, crash dumps, Windows Error Reporting logs, browser caches, and Windows Recycle Bin. |
| `vhdx_compact.py` | **Virtual Disk Compactor**: Compacts dynamically expanding `ext4.vhdx` files for WSL2 and Docker Desktop via `diskpart` / Hyper-V compaction. |
| `tuner.py` | **Windows Dev Tuning**: Toggles Win32 Long Paths (`LongPathsEnabled`), Windows Developer Mode (unprivileged symlinks), and Windows Defender exclusions. |
| `file_locker.py` | **Restart Manager Bridge**: Calls Windows Win32 Restart Manager (`rstrtmgr.dll`) to identify which PID is holding a file lock causing `EBUSY` / `Access Denied`. |
| `large_files.py` | **Large Files Hunter**: Scans workspaces for files >50MB categorized by type (archives, media, binaries) with Recycle Bin deletion. |
| `dormant_detector.py` | **Dormant Repos**: Finds inactive workspaces with no commits for >60 days and calculate reconstructible storage. |
| `installed_apps.py` | **Installed Software**: Reads Windows Uninstall registry keys to inventory desktop tools and developer runtimes. |
| `memory_booster.py` | **RAM Trimmer**: Trims working sets of idle developer processes via Win32 `EmptyWorkingSet`. |
| `path_auditor.py` | **PATH Auditor**: Inspects Windows user and system `PATH` for missing folders, duplicates, and binary name collisions. |
| `process_control.py` | **Process Killer**: Safely kills dev processes holding locks or ports. |
| `git_control.py` | **Git Control**: Stashes uncommitted work, untracks leaked `.env` secrets, and prunes merged local branches. |
| `audit_log.py` | **Audit Logger**: Append-only persistent deletion log in `~/.entropy/audit.log`. |
| `config.py` | **Config Manager**: Persistent scan roots and user preferences in `~/.entropy/config.json`. |
| `cleanup_progress.py`| **Progress Tracker**: Atomic global progress state for real-time UI updates during long file operations. |
| `advisor.py` | **Workspace Health Advisor**: Diagnoses out-of-sync lockfiles, uncommitted changes, unpushed commits, and generate verdicts. |
| `entities.py` | **Data Models**: Dataclasses for `Project`, `Process`, `Runtime`, `ScanResult`, `ScopeType`, etc. |
| `graph.py` | **EnvironmentGraph**: Graph data structure modeling relationships between projects, runtimes, processes, and ports. |
| `findings.py` | **Finding Engine**: Rules that evaluate the `EnvironmentGraph` to generate actionable findings. |

---

## 📡 Collectors (`collectors/`)

| Collector | Target & Output |
| :--- | :--- |
| `git.py` | Branch, uncommitted/untracked files, unpushed commits (`@{u}..HEAD`), secrets radar (`.env`, private keys). |
| `processes.py` | Active developer processes, memory, PID, working directory, and listening socket ports. |
| `projects.py` | Detects project types (Node, Python, Rust, Go, Flutter, .NET, Java), lockfiles, and artifact sizes. |
| `artifacts.py` | Scans for disposable build artifact directories (`node_modules`, `target`, `.next`, etc.). |
| `caches.py` | Detects global package manager cache locations and sizes across the user profile. |
| `runtimes.py` | Probes installed developer toolchains (Node, Python, Rust, Go, Java, Docker, Git versions). |
| `docker.py` | Probes Docker daemon status, images, containers, volumes, and build cache reclaimable bytes. |

---

## 🖥️ CLI Entrypoint (`scan.py`)

- `python scan.py inspect [path]` (Default: `.`): Targeted workspace inspection. Supports `--json`.
- `python scan.py scan [paths...]`: Multi-root workspace discovery across drives. Supports `--json` and `--json-file`.
- `python scan.py desktop`: Launches the native Windows WebView2 desktop app.
