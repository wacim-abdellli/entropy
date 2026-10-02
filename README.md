<p align="center">
  <img src="desktop/src/assets/logo.png" alt="Entropy Logo" width="110" />
</p>

<h1 align="center">Entropy</h1>

<p align="center">
  <strong>The Developer Workspace Management Engine &amp; Windows Optimization Suite</strong>
</p>

<p align="center">
  <a href="https://github.com/wacim-abdellli/entropy/releases"><img src="https://img.shields.io/badge/Release-v0.2.2-blue.svg?style=flat-square" alt="Version"></a>
  <a href="https://github.com/wacim-abdellli/entropy/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-emerald.svg?style=flat-square" alt="License"></a>
  <img src="https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011%20(x64)-6366f1.svg?style=flat-square" alt="Platform">
  <img src="https://img.shields.io/badge/Frontend-React%2019%20%2B%20TypeScript-61dafb.svg?style=flat-square" alt="Frontend">
  <img src="https://img.shields.io/badge/Styling-Tailwind%20CSS%204-38bdf8.svg?style=flat-square" alt="Tailwind">
  <img src="https://img.shields.io/badge/Backend-Python%203.10%2B-ffde57.svg?style=flat-square" alt="Backend">
  <img src="https://img.shields.io/badge/Tests-147%20Passed%20(100%25)-success.svg?style=flat-square" alt="Tests">
  <img src="https://img.shields.io/badge/Telemetry-Zero%20(100%25%20Local)-blueviolet.svg?style=flat-square" alt="Telemetry">
</p>

---

## 💡 Overview

**Entropy** is an all-in-one developer workspace management platform and Windows system reclaimer designed specifically for software engineers. It fuses a blazing-fast Python forensics engine with an action-oriented React 19 desktop interface to solve the daily chaos of modern software development:

- **Reclaim dozens of gigabytes** of forgotten build targets (`node_modules`, `target`, `.venv`, `.next`, `bin/obj`).
- **Rescue full C: drives** by relocating massive package directories (`.gradle`, `.m2`, `AppData`, Android SDKs) to secondary drives via transparent NTFS Directory Junctions without breaking any builds.
- **Guard uncommitted and unpushed work** before you switch contexts or experience drive failures.
- **Inspect active developer network sockets** and free jammed development ports (`3000`, `5173`, `8080`, `5432`) in 1 click.
- **Compact WSL2 & Docker virtual disks (`.vhdx`)** to recover gigabytes held by Linux subsystems.
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

## ⚡ The Problem: Why Traditional Cleaners Fail Developers

Generic PC cleaners (CCleaner, BleachBit, CleanMyPC) treat local code directories as black boxes. They have no concept of Git repositories, build graphs, or development servers:

| Challenge | Generic Cleaners | Git CLI Alone | Windows Task Manager | **Entropy** |
| :--- | :---: | :---: | :---: | :---: |
| **Identifies disposable build targets** (`node_modules`, `target/`) | ❌ Ignores | ❌ Ignores | ❌ Ignores | ✅ **Auto-sizes & Safely Cleans** |
| **Relocates heavy dirs to D: without breaking paths** (NTFS Junctions) | ❌ | ❌ | ❌ | ✅ **1-Click Smart Mover** |
| **Correlates open ports to project directories** | ❌ | ❌ | ⚠️ Shows raw PID only | ✅ **Correlated Port & PID Forensics** |
| **Unpushed work guardian** (flags local-only commits) | ❌ | ⚠️ Must check each repo | ❌ | ✅ **Cross-Repo Guardian Dashboard** |
| **Compacts dynamic WSL2 & Docker VHDX disks** | ❌ | ❌ | ❌ | ✅ **Automated Disk Compactor** |
| **Detects locked files & responsible processes** | ❌ | ❌ | ❌ | ✅ **Win32 Restart Manager Bridge** |
| **Persistent append-only audit trail** | ❌ | ❌ | ❌ | ✅ **Forensic `audit.log`** |

---

## ✨ Core Features & Cockpit Tour

### 🛟 1. Rescue C: Drive (Smart Directory Relocator)
Running out of space on your primary Windows drive (`C:\`) is a developer nightmare. Heavy tools like Gradle, Maven, Android SDK, and npm store dozens of gigabytes in your user profile:
- **Transparent NTFS Junctions (`mklink /J`)**: Seamlessly moves large directories to secondary drives (`D:\`, `E:\`) while creating an operating-system-level pointer on `C:`.
- **Zero Configuration Breakage**: Your tools, IDEs, and build scripts continue reading from `C:\Users\...\.gradle`, but all underlying storage is absorbed by your secondary disk.
- **1-Click Restore**: Every relocated directory is indexed in an active manifest and can be reverted back to `C:` at any time.

### 🌐 2. Process-Correlated Network & Port Forensics
Never manually run `netstat -ano | findstr 3000` again:
- **Process Correlation**: Lists every active listening TCP/UDP socket mapped directly to its binary name (`node.exe`, `python.exe`, `postgres.exe`), process ID, and local/remote addresses.
- **Developer Port Highlights**: Automatically flags standard development ports (`3000`, `5173`, `8080`, `5432`, `27017`, `6379`, `8000`).
- **1-Click Port Releaser**: Safely terminate rogue or frozen background processes holding a port with built-in confirmation dialogues.

### 🖥️ 3. Machine Hardware Forensics & Live Telemetry
Deep, real-time forensic inspection of your Windows workstation:
- **Dual-GPU Telemetry**: Accurately detects dedicated and integrated GPUs (NVIDIA GeForce RTX, AMD Radeon, Intel Iris/UHD) with dedicated video memory (VRAM) sizing and driver version tracking.
- **Physical Drive & Media Forensics**: Identifies NVMe SSDs, SATA SSDs, and HDDs, device bus types, and disk serials.
- **Partition Topology**: Maps Windows partitions, EFI system partitions, recovery partitions, and dual-boot Linux installations.
- **Live Throughput Gauges**: Real-time non-blocking Disk I/O (MB/s Read/Write) and Network I/O (KB/s Sent/Received).

### 🛡️ 4. Workspace Health & Unpushed Work Guardian
Managing multiple repositories across your system often leads to forgotten, unpushed work:
- **Unpushed Commits Warning**: Scans upstream tracking branches to alert you if a repository has local commits that exist nowhere else (`commits_ahead`).
- **Stale Dependencies Alert**: Compares the modification timestamp of your package lockfiles (`package-lock.json`, `pnpm-lock.yaml`, `Cargo.lock`, `poetry.lock`) against installed modules to warn you when dependencies are out of sync.
- **Secrets Radar**: Automatically inspects untracked or committed files for leaked API keys, tokens, or credentials (`.env`, `id_rsa`, `.pem`).
- **File Lock Diagnostics**: Integrated Win32 Restart Manager identifies the exact process locking a file when builds fail with `EBUSY` or `Access Denied`.

### 🧹 5. Multi-Engine Disk Reclaimer
Reclaim gigabytes of space across every tier of your operating system:
- **Disposable Build Artifacts**: `node_modules`, `target`, `dist`, `.next`, `build`, `bin`, `obj`, `__pycache__`, `.venv`, `.pytest_cache`, `.turbo`.
- **Global Package Caches**: `npm`, `pnpm`, `yarn`, `pip`, `cargo`, `nuget`, `go-build`, `maven`, `gradle`, and `cocoapods`.
- **WSL 2 & Docker Virtual Disks**: Compacts dynamically expanding `ext4.vhdx` virtual hard disks for WSL2 and Docker Desktop.
- **Windows System Junk**: User & System Temp, crash dumps, Windows error reporting logs, browser caches, and Windows Recycle Bin.
- **Docker Daemon Pruning**: Cleans stopped containers, dangling images, unused volumes, and build cache.

### 🕵️ 6. 3-Pass Cryptographic Duplicate Hunter
Identifies duplicate files with 100% collision resistance using a three-tier algorithmic pipeline:
1. **Pass 1 (Size Clustering)**: Fast file-size grouping isolates candidate matches.
2. **Pass 2 (Head/Tail Fast Hash)**: Computes partial MD5 of file boundaries to eliminate non-matches in milliseconds.
3. **Pass 3 (Full SHA-256 Hash)**: Cryptographically verifies identical content.
- Supports batch smart selection (e.g., keep newest or keep oldest) with safe deletion to the Windows Recycle Bin.

### 🚀 7. Startup App Manager (Task Manager Synchronized)
Examine and control every application configured to launch at Windows boot:
- Synchronized with Windows Task Manager across both Current User (`HKCU`) and Local Machine (`HKLM`) registry hives.
- Safely toggle or remove resource-heavy background updaters and startup apps without manual registry edits.

### ⚙️ 8. Windows Developer Tuning & Path Auditor
Optimize Windows 10/11 specifically for software development workflows:
- **Win32 Long Paths (`LongPathsEnabled`)**: Removes the 260-character MAX_PATH limitation that frequently breaks deep Node.js and Python packages.
- **Windows Developer Mode**: Enables native symlink creation without requiring administrative privilege escalation.
- **Windows Defender Exclusions**: Automatically whitelists designated build root directories to prevent antivirus real-time scans from bottlenecking compilation speeds.
- **Windows 11 Dev Drive (ReFS)**: Detects ReFS-formatted Dev Drives and relocates global package caches for up to 30% faster file operations.
- **User PATH Auditor**: Inspects the Windows `PATH` environment variable, identifies dead or non-existent directories, highlights tool collisions (e.g., multiple Python or Node installations), and offers safe pruning.

---

## 🔒 Safety & Trust Architecture

Entropy was engineered from day one with strict safety guardrails for developers:

1. **Persistent Append-Only Audit Log**: Every single deletion or relocation is permanently logged to `~/.entropy/audit.log` with UTC timestamps, reclaimed bytes, affected paths, and execution outcomes.
2. **Git Tracking Verification**: Build artifact folders (`node_modules`, `target`) are verified against `git ls-files` before deletion to guarantee that no source code accidentally placed inside build directories is ever lost.
3. **Recycle Bin Protection**: Large files and duplicate deletions default to the Windows Recycle Bin for instant file recovery.
4. **100% Silent Execution**: All Windows system diagnostics, PowerShell CIM queries, and `mklink` operations run silently in the background with `CREATE_NO_WINDOW` and hidden window styles — zero flashing blue console windows.
5. **Zero Telemetry & 100% Local**: Entropy never phones home. All scans, metadata, and forensics remain strictly on your local machine.

---

## 📦 Installation & Download

### Windows Installer (Recommended)
Download the latest pre-compiled setup executable from the **[Releases](https://github.com/wacim-abdellli/entropy/releases)** page:

- **Installer**: `Entropy-Setup-0.2.1.exe`
- Per-user installation (no admin elevation required to install).
- Creates optional Desktop and Start Menu shortcuts with clean uninstaller registration.

---

## 🛠️ Developer Setup & Commands

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

### 2. Frontend Development (React 19 + Vite)
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

# Run full backend unit test suite (131 tests)
python -m unittest discover tests
```

### 4. Build Standalone Binary & Windows Installer
```bash
# 1. Build frontend assets
cd desktop && npm run build && cd ..

# 2. Package single-file executable with PyInstaller
pyinstaller --noconfirm Entropy.spec

# 3. Compile Inno Setup installer
& "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer.iss
```

---

## 🏛️ Repository Structure

```text
entropy/
├── scan.py                   # Python CLI entrypoint & scanner orchestrator
├── Entropy.spec              # PyInstaller production build specification
├── installer.iss             # Inno Setup 6 modern installer script
├── AGENTS.md                 # Master context guide for AI coding assistants
├── core/                     # Core business logic & forensic engines
│   ├── advisor.py            # Workspace health diagnostics & smart verdicts
│   ├── audit_log.py          # Persistent append-only audit trail (~/.entropy/audit.log)
│   ├── config.py             # User settings & persistent scan roots (~/.entropy/config.json)
│   ├── disk_cleaner.py       # Git-protected build artifact cleaner
│   ├── cache_cleaner.py      # Developer package cache purger (npm, pip, cargo, etc.)
│   ├── system_cleaner.py     # Windows junk, temp files & browser cache reclaimer
│   ├── smart_mover.py        # Smart File Mover ("Rescue C:") via NTFS Directory Junctions
│   ├── network_monitor.py    # Process-correlated TCP/UDP socket forensics & port releaser
│   ├── system_info.py        # Hardware forensics, dual GPU, partition topology & live I/O
│   ├── duplicate_finder.py   # 3-pass cryptographic duplicate file hunter
│   ├── large_files.py        # Workspace large file scanner with Recycle Bin safety
│   ├── installed_apps.py     # Desktop software & developer runtime inventory
│   ├── startup_manager.py    # Task Manager-synchronized Windows startup manager
│   ├── file_locker.py        # Win32 Restart Manager file locking diagnostics
│   ├── git_control.py        # Safe Git stash, secret untracking & branch pruning
│   ├── process_control.py    # Process termination & dev server releaser
│   ├── dev_drive.py          # Windows 11 Dev Drive (ReFS) detector & cache relocator
│   ├── path_auditor.py       # Windows PATH environment variable auditor & pruner
│   ├── vhdx_compact.py       # WSL 2 & Docker virtual disk compactor
│   └── tuner.py              # Windows developer mode, long paths & Defender exclusions
├── collectors/               # System state & telemetry collectors
│   ├── git.py                # Git status, branches, unpushed commits & secrets
│   ├── processes.py          # Active dev processes, listening ports & PID correlation
│   ├── projects.py           # Project type detector & dependency lockfile freshness
│   ├── artifacts.py          # Disposable build artifact collector
│   ├── caches.py             # Global package manager cache discovery
│   ├── runtimes.py           # Installed developer runtimes & version probes
│   └── docker.py             # Docker daemon status, images & container metrics
├── desktop/                  # React 19 + TypeScript + Vite + Tailwind CSS 4 GUI
│   ├── app.py                # Native Windows WebView2 launcher & IPC bridge
│   └── src/
│       ├── App.tsx           # Desktop container & sidebar routing
│       ├── index.css         # Design system tokens & Tailwind CSS 4 setup
│       ├── components/       # Action-oriented cockpit components
│       │   ├── OverviewView.tsx       # Actionable dashboard with workspace health
│       │   ├── CleanupView.tsx        # Multi-tab reclaimer (Artifacts, Caches, System, Docker)
│       │   ├── SystemView.tsx         # Tabbed system forensics & management hub
│       │   ├── MachineOverviewTab.tsx # Hardware specs, dual GPU & live I/O gauges
│       │   ├── NetworkMonitorTab.tsx  # Process-correlated sockets & port releaser
│       │   ├── RescueDriveTab.tsx     # Smart File Mover directory junction manager
│       │   ├── DuplicateFinderTab.tsx # 3-pass hash duplicate hunter
│       │   ├── LargeFilesHunterTab.tsx# Categorized large file finder
│       │   ├── StartupManagerTab.tsx  # Windows startup apps toggle & removal
│       │   ├── InstalledAppsTab.tsx   # Installed software & runtime inventory
│       │   ├── WorkspaceView.tsx      # Deep workspace inspector & Git manager
│       │   └── CommandPalette.tsx     # Global launcher overlay (Ctrl + K)
│       ├── types/entropy.ts  # End-to-end TypeScript interfaces
│       └── services/api.ts   # Strongly-typed IPC client
└── tests/                    # 131 unit tests covering all core modules
```

---

## 🤖 AI Assistant Integration (`AGENTS.md`)

Entropy is designed from the ground up for seamless pair programming with modern AI coding assistants (Cursor, Antigravity, Claude Code, GitHub Copilot, Aider).
- **Master Guide**: [`AGENTS.md`](AGENTS.md) contains token-optimized architecture maps and non-negotiable coding conventions.
- **Deep Context**: Detailed subsystem documentation is maintained in [`.agents/`](.agents/):
  - [`ARCHITECTURE.md`](.agents/ARCHITECTURE.md) — IPC boundaries, data flows, and concurrency models.
  - [`FRONTEND.md`](.agents/FRONTEND.md) — Design system tokens, component tree, and UX principles.
  - [`BACKEND.md`](.agents/BACKEND.md) — Core forensic engines and safety contracts.
  - [`CONVENTIONS.md`](.agents/CONVENTIONS.md) — Action-first UI rules and coding standards.

---

## 📄 License

Entropy is open-source software licensed under the **[MIT License](LICENSE)**.
Feel free to use, modify, and distribute it freely.