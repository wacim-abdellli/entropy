# Digital Entropy

**A read-only tool that inspects a developer's machine and builds a model of its digital environment — detecting what's alive, abandoned, duplicated, orphaned, and costly.**

This is NOT a disk cleaner. It does not delete anything. It observes, models, and explains.

## Status

Phase 1 — Prototype. Observation only. Linux-first.

## What It Does

Scans a developer's home directory and produces a structured report:

- **Detects development projects** from filesystem patterns (`.git/`, `package.json`, `Cargo.toml`, etc.)
- **Reads Git metadata** to determine activity lifecycle (active, inactive, stale, dormant)
- **Inventories runtimes** (Node.js, Python, Go, Rust, etc.) and version managers
- **Inspects Docker state** (containers, images, volumes)
- **Measures caches** and build artifacts
- **Shows relationships** between projects, runtimes, and resources

## What It Does NOT Do

- Delete, modify, or move any files
- Read file contents (metadata only)
- Access secrets, credentials, or `.env` files
- Require root access
- Send data anywhere (local-only, no telemetry)
- Manufacture fake confidence scores

## Usage

```bash
python scan.py [TARGET_DIRECTORY]
```

Default target: current user's home directory.

## Architecture

```
entropy/
├── scan.py              # CLI entry point
├── collectors/          # Data collection modules
│   ├── projects.py      # Project detection + Git metadata
│   ├── runtimes.py      # Runtime version detection
│   ├── docker.py        # Docker state collection
│   └── caches.py        # Cache inventory
├── model/
│   └── inventory.py     # Data structures
└── report/
    └── text.py          # Human-readable report formatter
```

## Privacy

- **Local-first**: all processing happens on your machine
- **Metadata-only**: we read file paths, sizes, timestamps — never contents
- **No secrets**: `.env`, SSH keys, credentials are never accessed
- **No telemetry**: nothing leaves your machine

## License

MIT
