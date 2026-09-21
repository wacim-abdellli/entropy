# Coding Standards & Guidelines for AI Agents

To maintain consistency and token efficiency, all AI agents modifying this repository MUST strictly follow these standards.

---

## 🎨 UI/UX Design Standards

1. **Direct Utility Over Decorative Clutter**
   - Every UI element must serve a direct developer action (e.g. *Stash*, *Clean*, *Open in VS Code*).
   - Avoid generic AI aesthetic tropes: NO arbitrary glassmorphism cards with zero actions, NO useless metric badges, NO pseudo-analytics charts.

2. **Zero Jargon Policy**
   - NEVER use synthetic pseudo-terms:
     - ❌ *"Cognitive Audit"* → ✅ *"Reclaimable Space"*
     - ❌ *"Substrate Graph"* → ✅ *"System Details"*
     - ❌ *"Evidence Drawer"* → ✅ *"Git Status & Uncommitted Files"*
     - ❌ *"Entropy Index"* → ✅ *"Workspace Health"*

3. **Typography & Layout Rules**
   - Base text MUST be **14px** (`text-sm`) with **1.6 line height** (`leading-relaxed`).
   - Use `font-mono` for all file paths, git branches, commands, sizes, and process PIDs.
   - Use `Inter` variable font for interface copy.

4. **CSS Token Enforcement**
   - Use design tokens defined in `desktop/src/index.css` (`bg-[var(--color-surface-0)]` to `--color-surface-4`).
   - DO NOT hardcode random hex colors in component inline classes.

---

## 💻 Code Quality Standards

1. **TypeScript (`desktop/src/`)**
   - Enforce strict typing. Do not use `any` unless absolutely necessary for external DOM events.
   - Component files MUST be placed in `desktop/src/components/`.
   - Shared types MUST be added to `desktop/src/types/entropy.ts`.

2. **Python (`core/`, `collectors/`)**
   - Compatible with Python 3.9 through 3.14.
   - Zero heavyweight external dependencies (only `psutil` and optional `pywebview`).
   - Handle missing git binaries or permission-denied file paths gracefully without crashing.

3. **Icon Usage**
   - Import icons strictly from `lucide-react`.
   - Verify exported component names (e.g., `GitBranch`, `FolderSearch`, `Trash2`, `RefreshCw`, `AlertTriangle`).
