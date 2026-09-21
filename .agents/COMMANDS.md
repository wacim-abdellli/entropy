# Development & Operations Commands

This document lists all exact commands required to develop, test, build, lint, and run the Entropy project.

---

## 1. Frontend Development (`desktop/`)

Always run these commands inside the `desktop/` working directory:

```bash
cd desktop

# Start Vite live-reload dev server (runs on http://localhost:5173)
npm run dev

# Compile TypeScript and build Vite production assets into desktop/dist/
npm run build

# Type check frontend TypeScript without generating code
npx tsc --noEmit

# Lint frontend source code using oxlint
npm run lint
```

---

## 2. Python Backend (`root`)

Run these commands from the root `entropy/` directory:

```bash
# Run backend unit test suite
python -m unittest discover tests

# Inspect current directory CLI
python scan.py inspect .

# Inspect workspace and output JSON format
python scan.py inspect . --json

# Multi-root scan across directories
python scan.py scan C:\Users\pc\Desktop

# Launch pywebview Desktop Application
python scan.py desktop
```

---

## 3. Packaging & Distribution

```bash
# Install editable CLI package locally
pip install -e .

# Build Windows single-file executable using PyInstaller spec
pyinstaller Entropy.spec

# Create Inno Setup installer package (Windows)
iscc installer.iss
```
