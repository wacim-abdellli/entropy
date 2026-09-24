# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Software developers, full-stack engineers, and devops practitioners working on local development machines (Windows, macOS, Linux) with multiple repositories, package managers (npm, pip, cargo, etc.), background dev servers, and Docker containers.

## Product Purpose
Entropy is a developer workspace management and disk reclamation platform that keeps developer machines clean, fast, and organized. It eliminates digital entropy—abandoned node_modules, zombie dev servers, leaking .env files, orphaned build targets, and stagnant git branches—with zero-fluff, actionable controls.

## Positioning
Unlike generic PC cleaners that delete temp files blindly or risk breaking developer environments, Entropy understands codebases deeply: git status, active dev servers, port bindings, runtime versions, and rebuild commands (e.g. knowing npm install can restore node_modules).

## Operating Context
Local developer workstation environments running IDEs (VS Code, Cursor, Windsurf), terminal shells (PowerShell, bash, zsh), background dev processes (Node, Python, Vite, Next.js), and local databases or Docker containers.

## Capabilities and Constraints
- Instant deterministic safety verdicts for cleanup operations.
- Port-to-PID correlation and 1-click dev server management.
- Git safety net: dirty file tracking, merged branch pruning, .env leak detection.
- Deep cache purger: npm, pip, yarn, pnpm, cargo, Docker buildkit.
- Zero external pip dependencies; standalone single-binary desktop application.
- Privacy-first: all analysis happens 100% locally on the user's machine.

## Brand Commitments
- Technical, crisp, developer-grade aesthetic.
- Never use AI buzzwords ("Cognitive Audit", "Substrate Matrix", "Entropy Index") in UI. Use plain English developer language.
- Action-first design: direct actions (Stash Changes, Free Port, Purge Cache) instead of static metrics.

## Evidence on Hand
Working desktop application built with React 19, TypeScript, Tailwind CSS 4, and Python desktop engine (`desktop/app.py`, `core/`, `collectors/`).

## Product Principles
1. Safe by Default: Never delete uncommitted work or break a running project without clear warnings.
2. Developer Speed: Instant operations, zero bloat, high keyboard accessibility.
3. Radical Transparency: Show exact disk sizes, PIDs, paths, and rebuild commands.
4. Action over Observation: Every insight offers a direct, 1-click resolution.
