# Entropy AI Agent Guide (AGENTS.md)

Welcome to **Entropy** — the developer workspace management tool designed to keep developer machines clean, fast, and organized.

This guide provides high-density context for AI coding assistants (Cursor, Antigravity, Claude Code, Copilot, Aider, etc.) to understand the codebase efficiently without loading unnecessary tokens.

---

## ⚡ Quick Repository Map

```
entropy/
├── scan.py                   # Python CLI entrypoint & scanner orchestrator
├── core/                     # Core business logic engines
│   ├── advisor.py            # Safety verdicts & health recommendations
│   ├── ai_provider.py        # Platform AI, Cloud (Groq), Ollama & Rules provider
│   ├── audit_log.py          # Persistent append-only deletion audit logger (~/.entropy/audit.log)
│   ├── config.py             # User settings & persistent scan roots (~/.entropy/config.json)
│   ├── disk_cleaner.py       # Whitelisted build artifact cleaner (node_modules, target, etc.)
│   ├── cache_cleaner.py      # Developer package cache purger (npm, pip, cargo, etc.)
│   ├── system_cleaner.py     # Windows system junk, Recycle Bin & browser cache reclaimer
│   ├── cleanup_progress.py   # Real-time multi-phase cleanup progress tracker
│   ├── git_control.py        # Safe Git stash, secret untracking & branch pruning
│   ├── process_control.py    # Process killer, port releaser & clean slate
│   ├── launcher.py           # IDE, Terminal & Windows Explorer launcher
│   ├── memory_booster.py     # Win32 working-set RAM trimmer
│   ├── path_auditor.py       # Windows user PATH environment variable auditor & pruner
│   ├── dev_drive.py          # Windows 11 Dev Drive detector & cache relocator
│   ├── vhdx_compact.py       # WSL 2 & Docker virtual disk compactor
│   └── tuner.py              # Windows developer mode, long paths & Defender exclusions
├── collectors/               # Data collection modules
│   ├── git.py                # Git status, branch, uncommitted files, unpushed commits
│   ├── processes.py          # Active dev processes, listening ports, PID correlation
│   ├── projects.py           # Project type detector, dependency environments & directory sizing
│   ├── artifacts.py          # Disposable build artifact collector
│   ├── caches.py             # Global package manager cache discovery & sizing
│   ├── runtimes.py           # Installed developer runtimes & versions
│   └── docker.py             # Docker daemon status, images, containers & build cache
├── linkers/                  # Entity relationship & cross-collector linkers
├── report/                   # CLI output formatters (terminal table, JSON export, contract)
├── desktop/                  # React 19 + TypeScript + Vite + Tailwind CSS 4 Desktop GUI
│   ├── app.py                # Native Windows WebView2 launcher & IPC bridge
│   ├── src/
│   │   ├── App.tsx           # Main desktop container & sidebar routing
│   │   ├── index.css         # Design system tokens & Tailwind CSS 4 setup
│   │   ├── components/       # Clean, action-oriented React components
│   │   │   ├── Sidebar.tsx   # Navigation & quick workspace switcher
│   │   │   ├── OverviewView.tsx # Actionable dashboard with workspace table & quick actions
│   │   │   ├── CleanupView.tsx  # Multi-tab disk reclaimer (System, Artifacts, Caches, Docker, Tuning)
│   │   │   ├── WorkspaceView.tsx# Workspace details, git status, secrets & process list
│   │   │   ├── WorkspaceAdvisorCard.tsx # Diagnostic health card with confirmation modal & Platform AI
│   │   │   ├── SystemView.tsx   # Processes, Runtimes, Containers, Caches & RAM Booster
│   │   │   ├── SettingsView.tsx # Scan directory configuration & Platform AI settings
│   │   │   └── CommandPalette.tsx # Global launcher overlay (Ctrl+K)
│   │   ├── types/
│   │   │   └── entropy.ts    # TypeScript interface definitions
│   │   └── services/
│   │       ├── api.ts        # Typed IPC client (EntropyApiClient)
│   │       └── mockData.ts   # High-fidelity Windows sample data for standalone UI
│   └── package.json          # Node dependencies & Vite scripts
└── tests/                    # Python backend unit test suite
```

---

## 📚 Agent Context Directory (`.agents/`)

For detailed subsystem documentation, consult these token-optimized context files:

1. [ARCHITECTURE.md](file:///.agents/ARCHITECTURE.md) — End-to-end system architecture, data flows, and IPC details.
2. [FRONTEND.md](file:///.agents/FRONTEND.md) — React 19 frontend layout, navigation, design tokens, and components.
3. [BACKEND.md](file:///.agents/BACKEND.md) — Python engine (`scan.py`, `core/`, `collectors/`) and inspection logic.
4. [COMMANDS.md](file:///.agents/COMMANDS.md) — Exact commands for dev, test, build, lint, and packaging.
5. [CONVENTIONS.md](file:///.agents/CONVENTIONS.md) — Coding standards, design principles, and UI/UX anti-patterns to avoid.

---

## 🚀 Key Commands at a Glance

| Task | Command | Directory |
| :--- | :--- | :--- |
| **Frontend Dev Server** | `npm run dev` | `./desktop` |
| **Frontend Build** | `npm run build` | `./desktop` |
| **Frontend Type Check** | `npx tsc --noEmit` | `./desktop` |
| **Frontend Lint** | `npm run lint` | `./desktop` |
| **Backend Tests** | `python -m unittest discover tests` | `./` |
| **Run CLI Inspect** | `python scan.py inspect .` | `./` |
| **Run CLI Scan** | `python scan.py scan C:\dev` | `./` |
| **Launch Desktop App** | `python scan.py desktop` | `./` |

---

## 🛑 Important Rules for AI Agents

1. **No AI Jargon in UI**: Never use terms like *"Cognitive Audit"*, *"Entropy Index"*, *"Substrate Matrix"*, or *"Evidence Drawer"*. Use clear, plain-English developer language (*"Reclaimable Space"*, *"Git Status"*, *"Active Processes"*, *"Scan Root"*).
2. **Action-First Design**: UI components must provide direct actions (e.g., *Stash Changes*, *Clean node_modules*, *Open in IDE*), not static metrics.
3. **Typography Standards**: Base font size in desktop is **14px** with **1.6 line-height**. Inter variable font for text, JetBrains Mono for paths, branches, and code.
4. **CSS Token Palette**: ALWAYS use custom surface tokens defined in `desktop/src/index.css`:
   - Canvas background: `bg-[var(--color-surface-0)]`
   - Card/Sidebar surface: `bg-[var(--color-surface-1)]`
   - Hover surface: `bg-[var(--color-surface-2)]`
   - Accent color: `text-[var(--color-accent)]` (`#3b82f6` blue)
5. **Icon Library**: Use `lucide-react` exclusively. Verify exported icon names before importing (e.g., `GitBranch`, `Trash2`, `FolderSearch`, `RefreshCw`).
