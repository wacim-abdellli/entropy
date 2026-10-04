<p align="center">
  <img src="desktop/src/assets/logo.png" alt="Entropy Logo" width="110" />
</p>

<h1 align="center">Entropy</h1>

<p align="center">
  <strong>The Developer Workspace Management Engine &amp; Windows Optimization Suite</strong>
</p>

<p align="center">
  <a href="https://github.com/wacim-abdellli/entropy/releases"><img src="https://img.shields.io/badge/Release-v0.2.5-blue.svg?style=flat-square" alt="Version"></a>
  <a href="https://github.com/wacim-abdellli/entropy/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-emerald.svg?style=flat-square" alt="License"></a>
  <img src="https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011%20(x64)-6366f1.svg?style=flat-square" alt="Platform">
  <img src="https://img.shields.io/badge/Frontend-React%2019%20%2B%20TypeScript-61dafb.svg?style=flat-square" alt="Frontend">
  <img src="https://img.shields.io/badge/Styling-Tailwind%20CSS%204-38bdf8.svg?style=flat-square" alt="Tailwind">
  <img src="https://img.shields.io/badge/Backend-Python%203.10%2B-ffde57.svg?style=flat-square" alt="Backend">
  <img src="https://img.shields.io/badge/Tests-147%20Passed%20(100%25)-success.svg?style=flat-square" alt="Tests">
  <img src="https://img.shields.io/badge/Telemetry-Zero%20(100%25%20Local)-blueviolet.svg?style=flat-square" alt="Telemetry">
</p>

---

## Overview

**Entropy** is an all-in-one developer workspace management engine and Windows workstation optimization suite designed specifically for software engineers. It fuses a forensic Python backend with an action-oriented React 19 desktop interface to resolve the disk bloat, system latency, and workspace sprawl of modern development stacks:

- **Reclaim dozens of gigabytes** of disposable build artifacts (`node_modules`, `target`, `.venv`, `.next`, `bin/obj`).
- **Rescue C: drive storage** by moving heavy tool and SDK directories (`.gradle`, `.m2`, `AppData`, Android SDK) to secondary drives via transparent NTFS Directory Junctions without breaking paths or build tools.
- **Inspect disk usage cartography** through an interactive SSD Storage Lens treemap categorized by development ecosystem.
- **Safely shrink and repartition disks** using the built-in Windows Shrink & Partition Wizard.
- **Find and batch-clean duplicate files** using a 3-pass cryptographic hash pipeline with 1-click "Select All" controls and Recycle Bin protection.
- **Guard uncommitted and unpushed work** before you switch branches, clear workspaces, or encounter hardware issues.
- **Inspect active developer network sockets** and free jammed development ports (`3000`, `5173`, `8080`, `5432`) in 1 click.
- **Compact WSL2 & Docker virtual disks (`.vhdx`)** to recover storage dynamically locked by Linux virtual disks.
- **Tune Windows for developers** with Win32 Long Path support, Developer Mode, Defender exclusions, and PATH conflict resolution.

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  WORKSPACE STATUS: C:\dev\ecommerce-api                                               │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  Git State:    ↑3 unpushed commits • 4 uncommitted files • 2 merged branches cleanable  │
│  Reclaimable:  4.82 GB (node_modules: 3.2 GB, target/: 1.5 GB, .pytest_cache: 120 MB)  │
│  Dev Process:  node.exe (PID 14220) listening on TCP 0.0.0.0:3000                      │
│  Health Tip:   ⚠️ Out of sync: Lockfile was updated after installed dependencies       │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  ACTIONS:  [ 🚀 Push to Remote ]  [ 🧹 Clean 4.8 GB ]  [ 🛑 Free Port 3000 ]  [ 💻 IDE ]│
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Comparison: Why Traditional Cleaners Fail Developers

Generic PC cleaners (CCleaner, BleachBit, CleanMyPC) treat local code directories as opaque black boxes. They have no concept of Git status, package manager graphs, or development servers:

| Capability | Generic Cleaners | Git CLI Alone | Windows Task Manager | **Entropy** |
| :--- | :---: | :---: | :---: | :---: |
| **Identifies disposable build targets** (`node_modules`, `target/`) | ❌ Ignores | ❌ Ignores | ❌ Ignores | ✅ **Auto-sizes & Safely Cleans** |
| **Relocates heavy dirs to D: without breaking paths** (NTFS Junctions) | ❌ | ❌ | ❌ | ✅ **1-Click Smart Mover & Rollback** |
| **Visual SSD Storage Lens with developer domain cartography** | ❌ | ❌ | ❌ | ✅ **Interactive Treemap Lens** |
| **Windows Shrink & Partition Wizard** | ❌ | ❌ | ⚠️ Disk Mgmt GUI | ✅ **Safe Partition Calculator** |
| **Duplicate Finder with multi-hash & batch "Select All"** | ⚠️ File name only | ❌ | ❌ | ✅ **3-Pass Cryptographic Hasher** |
| **Correlates open ports to process binaries & PIDs** | ❌ | ❌ | ⚠️ Shows raw PID only | ✅ **Correlated Port & PID Forensics** |
| **Unpushed work guardian** (flags local-only commits) | ❌ | ⚠️ Must check each repo | ❌ | ✅ **Cross-Repo Guardian Dashboard** |
| **Compacts dynamic WSL2 & Docker VHDX disks** | ❌ | ❌ | ❌ | ✅ **Automated Disk Compactor** |
| **Detects locked files & responsible processes** | ❌ | ❌ | ❌ | ✅ **Win32 Restart Manager Bridge** |
| **Persistent append-only audit trail** | ❌ | ❌ | ❌ | ✅ **Forensic `~/.entropy/audit.log`** |

---

## Core Features & Capabilities

### 1. Rescue C: Drive (Smart Directory Relocator)
Primary SSDs (`C:\`) frequently run out of space due to heavy build runtimes, global caches, and SDKs residing in user profiles:
- **Transparent NTFS Junctions (`mklink /J`)**: Relocates directories (`.gradle`, `.m2`, Android SDK, `AppData\Local`, `.nuget`, `.cache`) to secondary partitions (`D:\`, `E:\`) while leaving an OS-level directory junction on `C:`.
- **Zero Tooling Breakage**: Build tools, IDEs, and compilers continue reading paths on `C:\` uninterrupted, with disk storage physically hosted on the destination drive.
- **Native Win32 Reparse Point Verification**: Employs `DeviceIoControl` with `FSCTL_GET_REPARSE_POINT` to accurately verify junction status, bypassing standard shell and symlink detection edge cases.
- **Real-Time 0–100% Progress Telemetry**: Displays transfer velocity (MB/s), live file ticker, elapsed duration, and estimated completion time during relocation.
- **Full Space Reclamation**: Safely purges original files after junction creation and verifies that free space on `C:` increases.
- **1-Click Rollback Manager**: Keeps an active registry of all moved paths and allows instant reversion of junctions back to `C:` with zero data loss.
- **Drive Capacity Alerts**: Proactively displays warning thresholds when `C:` free space drops below critical limits.

### 2. SSD Storage Lens & Drilldown Cartography
Inspect disk usage through a visual cartography model tuned for developer machines:
- **Domain-Categorized Storage Treemap**: Aggregates and displays disk occupancy categorized by runtime (Node.js, Rust/Cargo, Python, Android SDK, Gradle, Docker, Windows Caches).
- **Interactive Drilldown**: Direct inspection of the heaviest storage nodes across all scanned developer roots.
- **Smooth Loading State**: Asynchronous background indexing with pulsing loading skeletons for seamless navigation.
- **Dev Drive (ReFS) Integration**: Identifies formatted Dev Drives and recommends optimal cache placement for up to 30% faster compilation and package management operations.

### 3. Windows Shrink & Partition Wizard
Manage Windows partition sizing without risky third-party partition software:
- **Safe Capacity Calculations**: Queries Windows Storage Management CIM/WMI to compute maximum shrinkable boundaries without disturbing unmovable operating system files.
- **Guided Setup Workflow**: Step-by-step instructions for shrinking `C:` partitions and carving out dedicated secondary drives (`D:\`, `E:\`) or high-performance ReFS Dev Drives.

### 4. 3-Pass Cryptographic Duplicate Hunter
Find and clean identical duplicate files with zero false-positive risk:
- **Tier 1 (Size Clustering)**: Fast file-size grouping to isolate potential candidates.
- **Tier 2 (Head/Tail Fast Hash)**: Computes partial MD5 of file boundaries to eliminate non-matching candidates in milliseconds.
- **Tier 3 (Full SHA-256 Hash)**: Cryptographically confirms identical byte sequences.
- **Batch Selection Controls**: Integrated "Select All", "Deselect All", and smart selection rules ("Keep Newest", "Keep Oldest") for rapid multi-file triage.
- **Recycle Bin Integration**: Deletions default to the Windows Recycle Bin for instantaneous recovery.

### 5. Multi-Engine Disk Reclaimer
Reclaim gigabytes of space across developer environments and operating system caches:
- **Disposable Build Artifacts**: `node_modules`, `target`, `dist`, `.next`, `build`, `bin`, `obj`, `__pycache__`, `.venv`, `.pytest_cache`, `.turbo`.
- **Global Package Caches**: `npm`, `pnpm`, `yarn`, `pip`, `cargo`, `nuget`, `go-build`, `maven`, `gradle`, `cocoapods`.
- **WSL 2 & Docker Virtual Disks**: Compacts dynamically expanding `ext4.vhdx` virtual disks for WSL2 and Docker Desktop.
- **Windows System Junk**: User and system temp directories, crash dumps, Windows error reporting logs, browser caches, and Windows Recycle Bin.
- **Docker Daemon Pruning**: Prunes stopped containers, dangling images, unused volumes, and build caches.

### 6. Process-Correlated Network & Port Forensics
Eliminate port collision issues when development servers fail to bind:
- **Process Correlation**: Lists active listening TCP/UDP sockets mapped to process names (`node.exe`, `python.exe`, `postgres.exe`), PIDs, and local addresses.
- **Developer Port Highlights**: Automatically flags standard development ports (`3000`, `5173`, `8080`, `5432`, `27017`, `6379`, `8000`).
- **1-Click Port Releaser**: Terminate unresponsive or orphaned development servers holding ports with confirmation dialogues.

### 7. Workstation Hardware Forensics & Live Telemetry
Deep, real-time forensic inspection of Windows hardware:
- **Dual-GPU Telemetry**: Detects dedicated and integrated GPUs (NVIDIA GeForce RTX, AMD Radeon, Intel Iris/UHD) with dedicated video memory (VRAM) sizing and driver version tracking.
- **Physical Drive & Media Forensics**: Identifies NVMe SSDs, SATA SSDs, HDDs, device bus types, and disk serials.
- **Partition Topology**: Maps Windows partitions, EFI system partitions, recovery partitions, and dual-boot installations.
- **Live Throughput Gauges**: Real-time non-blocking Disk I/O (MB/s Read/Write) and Network I/O (KB/s Sent/Received).

### 8. Workspace Health & Unpushed Work Guardian
Maintain hygiene across dozens of local code repositories:
- **Unpushed Commits Warning**: Compares local branches against upstream tracking branches (`@{u}..HEAD`) to flag unpushed commits (`commits_ahead`).
- **Dependency Freshness Monitor**: Compares modification timestamps of package lockfiles (`package-lock.json`, `pnpm-lock.yaml`, `Cargo.lock`, `poetry.lock`) against installed modules to detect out-of-sync dependencies.
- **Secrets Radar**: Automatically inspects untracked or committed files for leaked API keys, tokens, or credentials (`.env`, `id_rsa`, `.pem`).
- **File Lock Diagnostics**: Integrated Win32 Restart Manager identifies the exact process locking a file when builds fail with `EBUSY` or `Access Denied`.

### 9. Startup App Manager (Task Manager Synchronized)
Audit and manage applications configured to launch at Windows boot:
- Synchronized with Windows Task Manager across both Current User (`HKCU`) and Local Machine (`HKLM`) registry hives.
- Safely toggle or remove resource-heavy background updaters and startup apps without manual registry edits.

### 10. Windows Developer Tuning & Path Auditor
Optimize Windows 10 and 11 configurations for software development:
- **Win32 Long Paths (`LongPathsEnabled`)**: Removes the 260-character MAX_PATH limitation that breaks deep package dependency trees.
- **Windows Developer Mode**: Enables native symlink creation without requiring administrative privilege elevation.
- **Windows Defender Exclusions**: Whitelists designated build root directories to prevent real-time antivirus scans from slowing down builds.
- **User PATH Auditor**: Inspects the Windows `PATH` environment variable, identifies missing directories, highlights duplicate entries, and checks tool collisions.

---

## Safety & Trust Architecture

Entropy was engineered with strict safety guardrails for developer workstations:

1. **Persistent Append-Only Audit Log**: Every deletion or relocation is recorded in `~/.entropy/audit.log` with UTC timestamps, reclaimed bytes, affected paths, and execution outcomes.
2. **Git Tracking Verification**: Build artifact folders (`node_modules`, `target`) are verified against `git ls-files` before deletion to prevent accidental removal of tracked source files.
3. **Recycle Bin Protection**: Large file and duplicate deletions default to the Windows Recycle Bin for instantaneous recovery.
4. **Command Allowlisting**: Package reinstall commands are checked against strict allowlists to prevent shell metacharacter injection.
5. **100% Silent Execution**: All Windows system diagnostics, CIM queries, and `mklink` operations execute with `CREATE_NO_WINDOW` and hidden window styles — zero flashing console windows.
6. **Zero Telemetry & 100% Local**: Entropy runs entirely on your local machine with zero external network tracking or data transmission.

---

## Installation & Download

### Windows Installer (Recommended)
Download the latest pre-compiled setup executable from the **[Releases](https://github.com/wacim-abdellli/entropy/releases)** page:

- **Installer**: `Entropy-Setup-0.2.5.exe`
- Per-user installation (no administrative elevation required to install).
- Creates optional Desktop and Start Menu shortcuts with clean uninstaller registration.

---

## Developer Setup & Commands

### Prerequisites
- **Windows 10 or 11 (64-bit)**
- **Python 3.10+**
- **Node.js 18+** (for frontend development)
- **Git for Windows**

### 1. Clone the Repository
```bash
git clone https://github.com/wacim-abdellli/entropy.git
cd entropy
```

### 2. Frontend Development (React 19 + Vite + Tailwind CSS 4)
```bash
cd desktop
npm install

# Start Vite live-reload dev server (http://localhost:5173)
npm run dev

# Run TypeScript type check
npx tsc --noEmit

# Build production bundle
npm run build
```

### 3. Backend & Desktop Runner (Python)
```bash
# Install backend dependencies
pip install -r requirements.txt

# Run CLI inspection on current directory
python scan.py inspect .

# Scan specific development folders
python scan.py scan C:\dev C:\repos

# Launch native Desktop GUI
python scan.py desktop

# Run full backend unit test suite (147 tests)
python -m unittest discover tests
```

### 4. Build Standalone Binary & Windows Installer
```bash
# 1. Build frontend assets
cd desktop && npm run build && cd ..

# 2. Package standalone executable with PyInstaller
pyinstaller --noconfirm Entropy.spec

# 3. Compile Inno Setup installer
& "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer.iss
```

---

## Repository Structure

```text
entropy/
├── scan.py                   # Python CLI entrypoint & scanner orchestrator
├── Entropy.spec              # PyInstaller production build specification
├── installer.iss             # Inno Setup 6 modern installer script
├── AGENTS.md                 # Context guide for AI coding assistants
├── core/                     # Core business logic & forensic engines
│   ├── advisor.py            # Workspace health diagnostics & smart verdicts
│   ├── audit_log.py          # Persistent append-only audit trail (~/.entropy/audit.log)
│   ├── cache_cleaner.py      # Developer package cache purger (npm, pip, cargo, etc.)
│   ├── cleanup_progress.py   # Global atomic cleanup progress tracker
│   ├── config.py             # User settings & persistent scan roots (~/.entropy/config.json)
│   ├── dev_drive.py          # Windows 11 Dev Drive (ReFS) detector & cache relocator
│   ├── disk_cleaner.py       # Git-protected build artifact cleaner
│   ├── docker_control.py     # Docker container, image, volume & cache cleanup
│   ├── dormant_detector.py   # Inactive repository & workspace detector
│   ├── duplicate_finder.py   # 3-pass cryptographic duplicate file hunter
│   ├── entities.py           # Core domain entity definitions
│   ├── file_locker.py        # Win32 Restart Manager file locking diagnostics
│   ├── findings.py           # Diagnostic findings models & scoring
│   ├── git_control.py        # Safe Git stash, secret untracking & branch pruning
│   ├── graph.py              # Relationship graph & cross-entity topology
│   ├── installed_apps.py     # Desktop software & developer runtime inventory
│   ├── large_files.py        # Workspace large file scanner with Recycle Bin safety
│   ├── launcher.py           # External process launcher & terminal opener
│   ├── memory_booster.py     # Windows RAM standby list & working set management
│   ├── network_monitor.py    # Process-correlated TCP/UDP socket forensics & port releaser
│   ├── partition_wizard.py   # Windows partition shrink calculator & wizard
│   ├── path_auditor.py       # Windows PATH environment variable auditor & pruner
│   ├── process_control.py    # Process termination & dev server releaser
│   ├── smart_mover.py        # Rescue C: Directory Relocator via NTFS Junctions
│   ├── ssd_lens.py           # SSD Storage Lens & domain-categorized disk cartography
│   ├── startup_manager.py    # Task Manager-synchronized Windows startup manager
│   ├── system_cleaner.py     # Windows junk, temp files & browser cache reclaimer
│   ├── system_info.py        # Hardware forensics, dual GPU, partition topology & live I/O
│   ├── tuner.py              # Windows developer mode, long paths & Defender exclusions
│   └── vhdx_compact.py       # WSL 2 & Docker virtual disk compactor
├── collectors/               # System state & telemetry collectors
│   ├── artifacts.py          # Disposable build artifact collector
│   ├── caches.py             # Global package manager cache discovery
│   ├── docker.py             # Docker daemon status, images & container metrics
│   ├── git.py                # Git status, branches, unpushed commits & secrets
│   ├── processes.py          # Active dev processes, listening ports & PID correlation
│   ├── projects.py           # Project type detector & dependency lockfile freshness
│   └── runtimes.py           # Installed developer runtimes & version probes
├── desktop/                  # React 19 + TypeScript + Vite + Tailwind CSS 4 GUI
│   ├── app.py                # Native Windows WebView2 launcher & IPC bridge
│   └── src/
│       ├── App.tsx           # Desktop container & sidebar routing
│       ├── index.css         # Design system tokens & Tailwind CSS 4 setup
│       ├── components/       # Cockpit components & forensic views
│       │   ├── CleanupSafetyModal.tsx      # Pre-flight safety confirmation modal
│       │   ├── CleanupView.tsx             # Multi-tab reclaimer (Artifacts, Caches, System, Docker)
│       │   ├── CommandPalette.tsx          # Global launcher overlay (Ctrl + K)
│       │   ├── DevDriveCard.tsx            # Windows 11 Dev Drive status & actions
│       │   ├── DuplicateFinderTab.tsx      # 3-pass hash duplicate hunter with batch Select All
│       │   ├── EntropyLogo.tsx             # Application branding component
│       │   ├── FileLockModal.tsx           # Win32 Restart Manager file unlocker modal
│       │   ├── InstalledAppsTab.tsx        # Installed software & runtime inventory
│       │   ├── LargeFilesHunterTab.tsx     # Categorized large file finder
│       │   ├── MachineOverviewTab.tsx      # Hardware specs, dual GPU & live I/O gauges
│       │   ├── NetworkMonitorTab.tsx       # Process-correlated sockets & port releaser
│       │   ├── OverviewView.tsx            # Actionable dashboard with workspace health
│       │   ├── PathAuditorCard.tsx         # Windows PATH environment variable auditor
│       │   ├── RescueDriveTab.tsx          # Rescue C: Directory Relocator with 100% telemetry
│       │   ├── SecretsRadarModal.tsx       # Leaked credentials & secret detector
│       │   ├── SettingsView.tsx            # Scan roots, exclusions & preferences
│       │   ├── ShrinkGuideModal.tsx        # Safe partition shrinking guidance modal
│       │   ├── Sidebar.tsx                 # Navigation bar & active workspace counter
│       │   ├── SmartRecommendationsTab.tsx # Prioritized workstation health suggestions
│       │   ├── SsdStorageLensTab.tsx       # SSD Storage Lens & domain-categorized treemap
│       │   ├── StartupManagerTab.tsx       # Windows startup apps toggle & removal
│       │   ├── StorageTreemap.tsx          # Interactive high-density treemap visualization
│       │   ├── SystemView.tsx              # Tabbed system forensics & management hub
│       │   ├── WorkspaceAdvisorCard.tsx    # Workspace health card with safety modals
│       │   └── WorkspaceView.tsx           # Deep workspace inspector & Git manager
│       ├── types/entropy.ts  # End-to-end TypeScript interfaces
│       └── services/api.ts   # Strongly-typed IPC client
└── tests/                    # 147 unit tests covering all core modules
```

---

## AI Assistant Integration (`AGENTS.md`)

Entropy is designed from the ground up for seamless pair programming with modern AI coding assistants (Cursor, Antigravity, Claude Code, GitHub Copilot, Aider).
- **Master Guide**: [`AGENTS.md`](AGENTS.md) contains token-optimized architecture maps and non-negotiable coding conventions.
- **Subsystem Architecture**: Detailed subsystem documentation is maintained in [`.agents/`](.agents/):
  - [`ARCHITECTURE.md`](.agents/ARCHITECTURE.md) — IPC boundaries, data flows, and concurrency models.
  - [`FRONTEND.md`](.agents/FRONTEND.md) — Design system tokens, component tree, and UX principles.
  - [`BACKEND.md`](.agents/BACKEND.md) — Core forensic engines and safety contracts.
  - [`CONVENTIONS.md`](.agents/CONVENTIONS.md) — Action-first UI rules and coding standards.

---

## License

Entropy is open-source software licensed under the **[MIT License](LICENSE)**.
Feel free to use, modify, and distribute it freely.