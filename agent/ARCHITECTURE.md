# Subsystem Architecture & IPC

## System Topology

Entropy operates as a hybrid architecture:
1. **Python Engine (`scan.py`, `core/`, `collectors/`)**: Forensic system intelligence layer, zero heavy dependencies (`psutil` only).
2. **Native WebView2 Shell (`desktop/app.py`)**: Windows-native desktop container using `pywebview`, exposing Python RPC methods directly to the frontend window object (`window.pywebview.api`).
3. **React 19 GUI (`desktop/src/`)**: High-performance UI built with TypeScript, Vite, Tailwind CSS 4, and Lucide React icons.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        React 19 Desktop GUI                            │
│           (OverviewView, CleanupView, SystemView, Modals)              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ window.pywebview.api (IPC RPC)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   WebView2 Host Bridge (desktop/app.py)                │
│            • Exposes API methods directly to JavaScript                │
│            • Background thread pool for long-running disk/WMI tasks    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
       ┌────────────────────────────┴─────────────────────────────┐
       ▼                                                          ▼
┌──────────────────────────────┐          ┌──────────────────────────────┐
│  Core Business Logic Engine  │          │   Collectors & Telemetry     │
│  (`core/`)                   │          │   (`collectors/`)            │
│  • smart_mover.py (Junctions)│          │  • git.py (commits, dirty)   │
│  • ssd_lens.py (Treemap)     │          │  • processes.py (ports, PIDs)│
│  • duplicate_finder.py       │◄─────────┤  • projects.py (targets)     │
│  • partition_wizard.py       │          │  • runtimes.py (versions)    │
│  • network_monitor.py        │          │  • caches.py (npm, pip)      │
│  • disk_cleaner.py           │          │  • docker.py (containers)    │
│  • audit_log.py              │          │  • artifacts.py (disposable) │
└──────────────┬───────────────┘          └──────────────┬───────────────┘
               │                                         │
               └────────────────────┬────────────────────┘
                                    ▼
              ┌───────────────────────────────────────────┐
              │           Windows 10/11 OS API            │
              │  Win32 Reparse Points, WMI/CIM, Registry, │
              │  Restart Manager, NTFS, PowerShell/Cmd    │
              └───────────────────────────────────────────┘
```

---

## Concurrency & Threading Model

1. **Parallel System Scanning (`scan.py`)**:
   - `ThreadPoolExecutor(max_workers=min(12, max(4, len(projects) + 4)))` runs Git inspection, process enumeration, runtime checks, Docker probing, and cache sizing concurrently.
2. **Non-Blocking Telemetry Polling**:
   - Hardware metrics (Disk Read/Write MB/s, Network Sent/Recv KB/s) poll every 1–2 seconds on a background worker thread.
   - Live cleanup progress (`core/cleanup_progress.py`) uses atomic locks to expose real-time transfer velocity, percentage, and current active path to the frontend without UI stutter.
3. **Win32 Command Isolation**:
   - Subprocesses run with `CREATE_NO_WINDOW = 0x08000000` or `STARTF_USESHOWWINDOW` with `SW_HIDE` to prevent black console flashes on Windows desktops.

---

## Safety & Audit Pipeline

- **Append-Only Audit Log**: Every destructive operation writes to `~/.entropy/audit.log` via `core/audit_log.py` with UTC timestamp, target path, reclaimed bytes, and status.
- **Git Tracking Shield**: Before purging any build directory (`node_modules`, `target`), `core/disk_cleaner.py` executes `git ls-files --error-unmatch` to ensure no tracked code files are deleted.
- **Recycle Bin Routing**: Deletions in `large_files.py` and `duplicate_finder.py` route through `send2trash` or Win32 `SHFileOperationW` (Recycle Bin) rather than permanent deletion.
