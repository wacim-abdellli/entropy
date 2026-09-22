# Entropy

> Clean, fast, and actionable developer workspace management.

**Entropy** is a developer workspace management tool designed to keep developer machines clean, fast, and organized. It combines a high-speed Python CLI engine with an action-oriented React 19 Desktop application to help you track workspace health, stash dirty files, reclaim gigabytes of disposable build targets (`node_modules`, `target`, `.venv`), and monitor active dev processes.

---

```text
IDENTITY
  Name:                 entropy
  Path:                 C:\Users\pc\Desktop\entropy
  Type:                 Python / TypeScript

STATE
  Status:               Needs Attention
  Summary:              2 workspaces require attention • 8.4 GB reclaimable space detected.

INLINE ACTIONS
  [ 🧹 Clean Dependencies ]   [ 📦 Stash Changes ]   [ 💻 Open in VS Code ]
```

---

## ⚡ The Problem

When developers manage multiple projects across local development drives, answering basic questions and maintaining disk space requires juggling multiple fragmented tools:

- *Which forgotten projects are hoarding 50+ GB of `node_modules` or Rust `target/` build files?*
- *Which repository has uncommitted changes that need to be stashed before switching tasks?*
- *What background dev server or process is running on port 3000 from an inactive folder?*
- *Is this project clean, active, or dormant?*

Generic disk cleaners treat code directories as disposable bytes, while git tools know nothing about OS memory or build caches. **Entropy correlates Git status, process activity, and disk usage into a single actionable dashboard.**

---

## 🚀 Key Features & Capabilities

### 🖥️ Entropy Desktop App
Built with **React 19, TypeScript, Vite, and Tailwind CSS 4**, packaged via **`pywebview`** for native desktop windowing.

1. **Welcome Hero & Urgency Grouping**:
   - Displays immediate actionable metrics upon launch.
   - Workspace cards automatically grouped by urgency:
     - 🚨 **Needs Attention**: Uncommitted local changes or removable build artifacts.
     - 💤 **Inactive**: Projects untouched for 30+ days holding disk space.
     - ✅ **All Good**: Clean, up-to-date repositories.

2. **1-Click Inline Developer Actions**:
   - 📦 **Stash Changes**: Safely stash uncommitted working tree modifications.
   - 🧹 **Clean Dependencies**: Reclaim gigabytes of disposable `node_modules`, `target/`, `.next/`, or `.venv` folders with zero risk to source code.
   - 💻 **Open in IDE**: Launch VS Code or Cursor directly at the workspace directory.
   - 💻 **Open Terminal**: Spawns an interactive shell inside the project folder.

3. **System Cleanup Hub**:
   - Aggregates all reclaimable project dependencies and shared package caches (`npm`, `pip`, `nuget`) across all scanned roots.
   - Feature 1-click **"Clean Selected"** and **"Select All Safe"** space reclamation.

4. **System & Process Monitor**:
   - Live CPU, RAM, and Disk space gauges.
   - Enumerates running developer processes (`node.exe`, `python.exe`, `cargo.exe`), PIDs, memory RSS, and working directories.

5. **Command Palette (`Ctrl + K`)**:
   - Rapid search overlay to jump between workspaces, system views, and cleanup actions instantly.

---

## 🏗️ Repository Architecture

```text
entropy/
├── scan.py                   # Main Python CLI entry point
├── AGENTS.md                 # Primary guide for AI coding assistants
├── .agents/                  # Token-optimized context files (Architecture, Frontend, Backend)
├── collectors/               # System state observers
│   ├── git_collector.py      # Git status, branches, dirty files, stashes
│   ├── process_collector.py  # Active dev processes, ports, PID correlation
│   └── dependency_collector.py # Build targets (node_modules, target, .venv)
├── core/                     # Business logic engines
│   ├── workspace.py          # Workspace state & metadata model
│   ├── reclaimer.py          # Safe disk space reclaimer
│   └── desktop_bridge.py     # Native pywebview window launcher
├── desktop/                  # React 19 + TypeScript + Vite + Tailwind CSS 4 GUI
│   ├── src/
│   │   ├── App.tsx           # App routing & container
│   │   ├── index.css         # Design system tokens & Tailwind CSS 4 setup
│   │   └── components/       # Action-first UI components
│   │       ├── Sidebar.tsx   # 4-item navigation (Home, Cleanup, Details, Settings)
│   │       ├── OverviewView.tsx # Actionable dashboard with Welcome Hero
│   │       ├── CleanupView.tsx  # Aggregated disk space reclaimer
│   │       ├── WorkspaceView.tsx# Detailed git status & process inspector
│   │       ├── SystemView.tsx   # CPU/RAM/Disk details & process manager
│   │       └── SettingsView.tsx # Scan directory configuration
└── tests/                    # Backend unit test suite
```

---

## 💻 Quick Start & Commands

### 1. Frontend Development (`desktop/`)
```bash
cd desktop

# Live reload Vite dev server
npm run dev

# Production build
npm run build

# Type-check TypeScript
npx tsc --noEmit
```

### 2. Python CLI & Desktop App
```bash
# Run CLI workspace inspect
python scan.py inspect .

# Multi-root directory scan
python scan.py scan C:\dev

# Launch Desktop GUI
python scan.py desktop

# Run unit tests
python -m unittest discover tests
```

---

## 🤖 AI Agent Integration (`AGENTS.md`)

Entropy includes built-in support for AI coding assistants (Cursor, Antigravity, Claude Code, GitHub Copilot Workspace, Aider):
- Root index: [AGENTS.md](AGENTS.md)
- Subsystem context: [.agents/](.agents/) (`ARCHITECTURE.md`, `FRONTEND.md`, `BACKEND.md`, `COMMANDS.md`, `CONVENTIONS.md`)

---

## 🔒 Safety & Privacy

- **Read-Only Inspection**: Scanning operations inspect state without mutating files.
- **Safe Cleaning**: Cleaning targets disposable build artifacts (`node_modules/`, `target/`, `.venv/`) while protecting source code and `.git` repositories.
- **Zero Telemetry**: All data and processing remain 100% local on your machine.

---

## 📜 License

MIT License. See [LICENSE](LICENSE) for details.