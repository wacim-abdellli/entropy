# Frontend Subsystem Reference (`desktop/`)

The desktop frontend is a modern single-page application built with **React 19**, **TypeScript**, **Vite**, and **Tailwind CSS 4**. It communicates with Python through `desktop/src/services/api.ts`.

---

## 🎨 Design System Tokens (`desktop/src/index.css`)

All components MUST use semantic tokens defined in `index.css`:

```css
/* Surface hierarchy */
--color-surface-0: #0a0e17;  /* Canvas background */
--color-surface-1: #111827;  /* Cards, sidebar, modal background */
--color-surface-2: #1e293b;  /* Elevated cards, table headers, hover background */
--color-surface-3: #334155;  /* Active borders, interactive elements */
--color-surface-4: #475569;  /* Secondary tags, subtle dividers */

/* Accent & Semantics */
--color-accent: #3b82f6;     /* Vibrant developer blue */
--color-success: #10b981;    /* Emerald green for clean states */
--color-warning: #f59e0b;    /* Amber for out-of-sync or attention items */
--color-error: #ef4444;      /* Red for locked files, dirty diffs, kill actions */

/* Text hierarchy */
--color-text-primary: #f8fafc;
--color-text-secondary: #94a3b8;
--color-text-tertiary: #64748b;
```

---

## 📁 Component Tree & Tabs (`desktop/src/components/`)

### Main Navigation (`App.tsx`)
Managed by sidebar routing with 4 primary views:
1. `OverviewView.tsx`: Dashboard displaying scan summary, health cards, urgent findings, and active workspace switcher.
2. `CleanupView.tsx`: Multi-tab disk reclaimer containing 11 specialized sub-tabs.
3. `SystemView.tsx`: Deep machine inspector containing 8 specialized sub-tabs.
4. `WorkspaceView.tsx`: Forensic view for a single repository (Git state, processes, secrets radar, lockfile health).
5. `SettingsView.tsx`: Scan root configuration, exclusions, and preferences.

---

### Cleanup Tabs (`CleanupView.tsx`)
| Tab Key | Component | Functionality |
| :--- | :--- | :--- |
| `recommendations` | `SmartRecommendationsTab.tsx` | High-priority reclaim suggestions (dormant repos, stale downloads). |
| `rescue_drive` | `RescueDriveTab.tsx` | Rescue C: Drive via transparent NTFS Directory Junctions with live transfer telemetry & rollback. |
| `ssd_lens` | `SsdStorageLensTab.tsx` | Multi-drive capacity lens & developer domain cartography treemap. |
| `duplicates` | `DuplicateFinderTab.tsx` | 3-pass hash duplicate hunter with batch "Select All Duplicates" and Recycle Bin safety. |
| `large_files` | `LargeFilesHunterTab.tsx` | Big file finder (>50MB) categorized by media, archive, binary. |
| `artifacts` | (inline in CleanupView) | Disposable build artifact cleaner (`node_modules`, `target`, `.venv`). |
| `caches` | (inline in CleanupView) | Global package cache purger (npm, pip, cargo, nuget, etc.). |
| `system` | (inline in CleanupView) | Windows temp junk, crash dumps, Recycle Bin reclaimer. |
| `docker` | (inline in CleanupView) | Docker container, image, volume, and buildkit cache pruning. |
| `tuning` | `DevDriveCard.tsx` + `PathAuditorCard.tsx` | Long Paths, Developer Mode, Defender exclusions, PATH auditor. |
| `treemap` | `StorageTreemap.tsx` | Interactive high-density zoomable treemap visualization. |

---

### System Tabs (`SystemView.tsx`)
| Tab Key | Component | Functionality |
| :--- | :--- | :--- |
| `overview` | `MachineOverviewTab.tsx` | Hardware specs, Dual GPU (RTX / Iris), NVMe/SATA, live I/O gauges. |
| `startup` | `StartupManagerTab.tsx` | Windows Task Manager synchronized startup app manager. |
| `apps` | `InstalledAppsTab.tsx` | Registered desktop apps & runtime versions inventory. |
| `network` | `NetworkMonitorTab.tsx` | Active TCP/UDP sockets correlated to dev processes with port releaser. |
| `processes` | (inline in SystemView) | Process tree with memory usage, PIDs, and kill controls. |
| `runtimes` | (inline in SystemView) | Probed developer language toolchains and version status. |
| `containers`| (inline in SystemView) | Docker containers status and quick controls. |
| `caches` | (inline in SystemView) | Package cache breakdown by package manager. |

---

### Modals & Dialogs
- `CleanupSafetyModal.tsx`: Pre-flight confirmation dialog showing paths, sizes, and Git safety verification before destructive deletion.
- `ShrinkGuideModal.tsx`: Safe C: drive shrink calculation wizard via Windows CIM/WMI.
- `SecretsRadarModal.tsx`: Leaked `.env` and credential inspection modal.
- `FileLockModal.tsx`: Win32 Restart Manager file unlocker modal when builds hit `EBUSY`.
- `CommandPalette.tsx`: Global spotlight launcher (`Ctrl + K`).

---

## 🔌 IPC Client (`desktop/src/services/api.ts`)

`EntropyApiClient` wraps all bridge calls to Python:
- Detects runtime: calls `window.pywebview.api[methodName](...args)` if available.
- Fallback: returns rich Windows test data from `mockData.ts` if running in a standard browser (`npm run dev`).
- Strictly typed return promises matching definitions in `desktop/src/types/entropy.ts`.
