# Coding & Design Conventions for AI Agents

To maintain consistency and token efficiency, all AI agents modifying this repository MUST strictly follow these standards.

---

## 🎨 UI/UX Design Standards

1. **Zero AI Jargon Policy**
   - NEVER use synthetic pseudo-terms:
     - ❌ *"Cognitive Audit"* → ✅ *"Reclaimable Space"*
     - ❌ *"Substrate Graph"* → ✅ *"System Details"*
     - ❌ *"Evidence Drawer"* → ✅ *"Git Status & Uncommitted Files"*
     - ❌ *"Entropy Index"* → ✅ *"Workspace Health"*
     - ❌ *"Neural Synthesis"* → ✅ *"Diagnostics"*

2. **Action-First UI Design**
   - Every UI element must offer a direct action button (e.g. *Stash Changes*, *Clean 4.8 GB*, *Free Port 3000*, *Open in VS Code*). Never show passive numbers without a clear next step.

3. **Typography Standards**
   - Base font size: **14px** (`text-sm`) with **1.6** line height (`leading-relaxed`).
   - Use `font-mono` for all file paths, git branches, commands, disk sizes, and PIDs.
   - Use `Inter` variable font for interface labels and text.

4. **CSS Token Palette (`desktop/src/index.css`)**
   - Use design tokens defined in `index.css`:
     - `bg-[var(--color-surface-0)]` to `--color-surface-4`
     - `text-[var(--color-accent)]` / `bg-[var(--color-accent)]`
     - `border-[var(--color-border)]`
   - DO NOT hardcode random hex colors or standard Tailwind blues/grays inline.

5. **Icon Library**
   - Use `lucide-react` exclusively. Always verify that exported icon names exist before importing (e.g., `GitBranch`, `FolderSearch`, `Trash2`, `RefreshCw`, `AlertTriangle`).

---

## 🔒 Safety & Trust Architecture

1. **Mandatory Git Verification**:
   - Never delete a build artifact directory without verifying that it is untracked by running `git ls-files` first.
2. **Recycle Bin by Default**:
   - Deletions of user files (large files, duplicates) must default to the Windows Recycle Bin, not permanent deletion.
3. **Audit Log Trail**:
   - Any destructive action must log an entry to `~/.entropy/audit.log` via `core/audit_log.py`.
4. **Silent Win32 Execution**:
   - Subprocesses must never flash command prompt windows. Always specify `CREATE_NO_WINDOW = 0x08000000` and `wShowWindow = SW_HIDE`.
