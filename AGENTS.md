# Entropy AI Agent Guide (AGENTS.md)

Welcome to **Entropy** — the developer workspace management tool designed to keep developer machines clean, fast, and organized.

This guide provides high-density context for AI coding assistants (Cursor, Antigravity, Claude Code, Copilot, Aider, etc.) to understand the codebase efficiently without loading unnecessary tokens.

---

## ⚡ Quick Repository Map

```
entropy/
├── scan.py                   # Python CLI entrypoint & main scanner
├── core/                     # Core business logic engines
│   ├── workspace.py          # Workspace state detector & metadata aggregator
│   ├── reclaimer.py          # Reclaimable space calculator (node_modules, target, etc.)
│   ├── scanner.py            # Environment scanner & path traversal engine
│   └── desktop_bridge.py     # Python <-> pywebview Desktop window launcher
├── collectors/               # Data collection modules
│   ├── git_collector.py      # Git status, branch, uncommitted files detector
│   ├── process_collector.py  # Active dev processes, ports, PID correlation
│   └── dependency_collector.py # Dependency & build artifact collector
├── linkers/                  # Entity relationship & cross-collector linkers
├── report/                   # CLI output formatters (terminal table, JSON export)
├── desktop/                  # React 19 + TypeScript + Vite + Tailwind CSS 4 Desktop GUI
│   ├── src/
│   │   ├── App.tsx           # Main desktop container & sidebar routing
│   │   ├── index.css         # Design system tokens & Tailwind CSS 4 setup
│   │   ├── components/       # Clean, action-oriented React components
│   │   │   ├── Sidebar.tsx   # 4-item navigation (Home, Cleanup, Details, Settings)
│   │   │   ├── OverviewView.tsx # Actionable dashboard with Welcome Hero & cards
│   │   │   ├── CleanupView.tsx  # Aggregated build target / disk space reclaimer
│   │   │   ├── WorkspaceView.tsx# Workspace details, git status, and process list
│   │   │   ├── SystemView.tsx   # CPU/RAM/Disk details and process manager
│   │   │   ├── SettingsView.tsx # Scan directory configuration & app settings
│   │   │   └── CommandPalette.tsx # Global launcher overlay (Ctrl+K)
│   │   ├── types/
│   │   │   └── entropy.ts    # TypeScript interface definitions
│   │   └── services/
│   │       └── mockData.ts   # Sample data fallback for standalone desktop UI
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
