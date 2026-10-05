# Quick Command Reference

All exact terminal commands for development, testing, linting, and release packaging.

---

## 💻 Frontend Development (`desktop/`)

Always run these commands inside the `desktop/` directory:

```bash
cd desktop

# Start Vite live-reload dev server (http://localhost:5173)
npm run dev

# Run TypeScript strict type check (zero code emitted)
npx tsc --noEmit

# Lint frontend source code using oxlint
npm run lint

# Build production frontend bundle into desktop/dist/
npm run build
```

---

## 🐍 Backend & Desktop Runner (`root`)

Run these commands from the repository root:

```bash
# Run full unit test suite (147 tests)
python -m unittest discover tests

# Run targeted workspace inspection (default: current directory)
python scan.py inspect .

# Inspect workspace and output JSON format
python scan.py inspect . --json

# Run multi-root environment scan
python scan.py scan C:\dev C:\repos

# Launch native WebView2 Desktop Application
python scan.py desktop
```

---

## 📦 Packaging & Release Distribution

```bash
# 1. Build frontend assets
cd desktop && npm run build && cd ..

# 2. Package standalone Windows executable with PyInstaller
pyinstaller --noconfirm Entropy.spec

# 3. Compile Inno Setup 6 installer
& "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer.iss
# Output binary: dist/Entropy-Setup-0.2.5.exe
```
