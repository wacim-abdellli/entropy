# Frontend Subsystem: Entropy Desktop

## Tech Stack
- **Framework**: React 19 (`react`, `react-dom`)
- **Language**: TypeScript (`~6.0`)
- **Build Tool**: Vite (`^8.3.0`)
- **Styling**: Tailwind CSS 4 (`@tailwindcss/vite` plugin with custom CSS tokens in `@theme`)
- **Icons**: Lucide React (`lucide-react`)
- **Typography**: `@fontsource-variable/inter` (UI font) and `@fontsource/jetbrains-mono` (Monospace for code/paths)

---

## Component Structure & Views

The frontend utilizes a clean 4-tab sidebar navigation pattern managed by `App.tsx`:

```
App.tsx
├── Sidebar.tsx             # Fixed left navigation bar (4 nav items + Ctrl+K hint + status)
├── CommandPalette.tsx      # Modal search overlay triggered by Ctrl+K / Cmd+K
└── Active View Switcher:
    ├── OverviewView.tsx    # Home View: Welcome Hero, stats, urgency-grouped cards
    ├── CleanupView.tsx     # System Cleanup: Aggregated reclaimable space & 1-click clean
    ├── SystemView.tsx      # System Details: CPU/RAM/Disk stats & active process table
    ├── SettingsView.tsx    # Settings: Scan root directory manager & app metadata
    └── WorkspaceView.tsx   # Detailed inspector for a single selected workspace
```

---

## Design System Tokens (`index.css`)

All components MUST use the design tokens defined in `desktop/src/index.css`:

### Color System
- **Surface 0 (Canvas)**: `bg-[var(--color-surface-0)]` (`#0B0F17`)
- **Surface 1 (Cards/Sidebar)**: `bg-[var(--color-surface-1)]` (`#111827`)
- **Surface 2 (Elevated)**: `bg-[var(--color-surface-2)]` (`#1F2937`)
- **Surface 3 (Interactive Hover)**: `bg-[var(--color-surface-3)]` (`#374151`)
- **Border**: `border-[var(--color-border)]` (`#1F2937` or `#374151`)
- **Text Primary**: `text-[var(--color-text-primary)]` (`#F9FAFB`)
- **Text Secondary**: `text-[var(--color-text-secondary)]` (`#9CA3AF`)
- **Text Tertiary**: `text-[var(--color-text-tertiary)]` (`#6B7280`)
- **Accent**: `text-[var(--color-accent)]` / `bg-[var(--color-accent)]` (`#3B82F6` vibrant blue)
- **Success**: `text-[var(--color-success)]` (`#10B981` green)
- **Warning**: `text-[var(--color-warning)]` (`#F59E0B` amber)

### Typography Rules
- **Base Font Size**: `14px` (`text-sm`) with `1.6` line height (`leading-relaxed`).
- **Headings**: `text-3xl font-semibold` for page titles, `text-xl font-medium` for section titles.
- **Monospace**: `font-mono` for file paths, git branches, terminal commands, and port numbers.

---

## State Management & Routing
- Nav state is managed via `ActiveNav` union in `App.tsx`: `'home' | 'cleanup' | 'details' | 'settings'`.
- Selected workspace state is stored as `selectedWorkspace: Workspace | null`.
- When `selectedWorkspace` is non-null, `WorkspaceView.tsx` renders in place of the current main tab with a back arrow to return to Home.
