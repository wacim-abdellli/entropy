# Entropy Agent Context Hub (`agent/`)

Welcome, AI Agent. This directory provides **high-density, token-optimized documentation** for Entropy. Read **only the file you need** for your specific task to conserve tokens and prevent context bloat.

---

## 🧭 Fast Navigation Router

| If your task involves... | Read this file | Summary |
| :--- | :--- | :--- |
| **System Architecture & IPC** | [`ARCHITECTURE.md`](ARCHITECTURE.md) | Subsystems, dataflow, `pywebview` IPC bridge, threading |
| **Python Backend & Engines** | [`BACKEND.md`](BACKEND.md) | All `core/` engines, `collectors/`, and `scan.py` logic |
| **React 19 GUI & Styling** | [`FRONTEND.md`](FRONTEND.md) | Component tree, tabs, modals, design tokens, IPC client |
| **Windows APIs & Internals** | [`WINDOWS_INTERNALS.md`](WINDOWS_INTERNALS.md) | NTFS Junctions, CIM/WMI shrink, Restart Manager, Registry |
| **Running, Testing & Building** | [`COMMANDS.md`](COMMANDS.md) | Exact commands for dev server, tests, lint, and packaging |
| **Packaging & Distribution** | [`DISTRIBUTION.md`](DISTRIBUTION.md) | Inno Setup, winget manifest automation, SignPath code signing |
| **UI Rules & Coding Standards** | [`CONVENTIONS.md`](CONVENTIONS.md) | Plain-English UI rules, action-first design, token palette |

---

## ⚡ 10-Second Project Summary

- **What it is**: Developer workspace manager & Windows optimization suite.
- **Tech Stack**: 
  - **Backend**: Python 3.10+ (Standard Library + `psutil`, zero heavy dependencies).
  - **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS 4 (`desktop/`).
  - **Desktop Bridge**: Native Windows WebView2 via `pywebview` (`desktop/app.py`).
- **Core Capabilities**:
  1. **Rescue C: Drive**: Transparent NTFS Junctions (`mklink /J`) to move `.gradle`, `.m2`, Android SDK to `D:` without breaking build paths.
  2. **SSD Storage Lens**: Hierarchical treemap categorized by developer domain (Node, Rust, Python, Android, Docker, Windows).
  3. **Windows Shrink Wizard**: 100% safe CIM/WMI partition boundary calculation.
  4. **3-Pass Duplicate Hunter**: Size -> Head/Tail MD5 -> Full SHA-256 with batch "Select All".
  5. **Multi-Engine Cleaner**: Git-protected build artifacts (`node_modules`, `target`), package caches, WSL2/Docker `.vhdx` compactor.
  6. **Network & Port Forensics**: Listening TCP/UDP sockets correlated to dev processes and PIDs with 1-click port killer.
  7. **Hardware Forensics**: Dual-GPU detection, VRAM, NVMe/SATA bus types, live I/O gauges.
  8. **Unpushed Work Guardian**: Flags unpushed commits (`@{u}..HEAD`), uncommitted files, and leaked secrets (`.env`).
  9. **Startup App Manager**: Synchronized with Windows Task Manager across `HKCU` & `HKLM`.
  10. **Windows Developer Tuning**: Long Paths, Developer Mode, Defender exclusions, PATH auditor.

---

## 🛑 Strict Rules for AI Agents

1. **No AI Jargon in UI**: Never output *"Cognitive Audit"*, *"Entropy Index"*, or *"Substrate Matrix"*. Use plain English developer terms (*"Reclaimable Space"*, *"Git Status"*, *"Active Processes"*).
2. **Action-First Design**: UI components must provide immediate actions (*Stash*, *Clean*, *Free Port*), never passive read-only text without a button.
3. **Always Check Git Protection**: Never delete a directory without verifying it is not tracked in Git (`git ls-files`).
4. **Silent Win32 Execution**: Any Windows subprocess command must use `CREATE_NO_WINDOW` / `SW_HIDE` to prevent console flashing.
