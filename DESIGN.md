---
name: Entropy Desktop Design System
description: Developer workspace manager and disk reclamation tool design system
colors:
  surface-0: "#09090b"
  surface-1: "#0f1014"
  surface-2: "#17191f"
  surface-3: "#20232b"
  surface-4: "#2a2e38"
  border: "#2a2d35"
  border-subtle: "#1d2027"
  border-strong: "#424752"
  text-primary: "#f5f7fa"
  text-secondary: "#a9afbb"
  text-tertiary: "#737a87"
  accent: "#3b82f6"
  accent-strong: "#60a5fa"
  success: "#34d399"
  warning: "#fbbf24"
  danger: "#fb7185"
  info: "#38bdf8"
typography:
  display:
    fontFamily: "Inter Variable, Inter, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.3
  headline:
    fontFamily: "Inter Variable, Inter, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.4
  title:
    fontFamily: "Inter Variable, Inter, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: "Inter Variable, Inter, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Inter Variable, Inter, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.5
  mono:
    fontFamily: "JetBrains Mono, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
---

# Entropy Design System

## Overview
Entropy is a precision desktop instrument for software developers. The design language is high-contrast, technical, dark-mode-first, and utilitarian. It prioritizes data density, instant actionability, and rapid cognitive scanning over marketing flair or decorative noise.

## Colors
- **Canvas (`var(--color-surface-0)`)**: `#09090b` — Deep, neutral dark canvas base.
- **Card Surfaces (`var(--color-surface-1)`, `var(--color-surface-2)`)**: `#0f1014`, `#17191f` — Tonal layering for cards, navigation panels, and interactive rows.
- **Elevated/Hover (`var(--color-surface-3)`)**: `#20232b` — Active states, hover highlights, and modal backdrops.
- **Text Roles**:
  - Primary (`#f5f7fa`): High-legibility off-white for headers and prominent titles.
  - Secondary (`#a9afbb`): Balanced slate for descriptions, body text, and subtitles.
  - Tertiary (`#737a87`): Muted gray for metadata, timestamps, and secondary captions.
- **Semantic Accents**:
  - Primary Accent (`#3b82f6` / `#60a5fa`): Focused interactive elements, active links, primary CTA buttons.
  - Success (`#34d399`): Clean/safe items, reclaimed space, running processes.
  - Warning (`#fbbf24`): Review-required items, uncommitted changes, dormant workspaces.
  - Danger (`#fb7185`): High-risk actions, force termination, secret leak alerts.

## Typography
- **UI Font**: `Inter Variable` with 14px base font size and 1.6 line height.
- **Monospace Font**: `JetBrains Mono` for all paths, commit hashes, branch names, listening ports, and disk byte sizes.
- **Scale**:
  - Page Titles: 20px / 24px semibold.
  - Section Headers: 15px / 16px semibold.
  - Body & Card Text: 13px / 14px regular.
  - Metadata & Badges: 11px / 12px medium.

## Layout
- **Fixed Desktop Canvas**: 48px titlebar drag region, 240px persistent sidebar navigation, flex-1 scrollable main content area.
- **Grid & Tables**: Compact, tabular data display with crisp borders (`var(--color-border)`) and subtle row hover highlights (`var(--color-surface-2)`).
- **Responsive Shell**: Minimum width 960px, overflow-x hidden, custom narrow dark scrollbars.

## Elevation & Depth
- Entropy relies on **tonal contrast** rather than heavy drop-shadows.
- Depth is expressed through surface progression: `surface-0` (deep canvas) → `surface-1` (card) → `surface-2` (nested container / active card) → `surface-3` (hover / modal).
- Borders use subtle neutral tones (`#2a2d35`) to define shape without visual harshness.

## Shapes
- Cards and content panels: `rounded-xl` (12px - 14px).
- Buttons and inputs: `rounded-md` (6px) or `rounded-lg` (8px).
- Status dots and badge pills: `rounded-full` (9999px).

## Components
- **Action Buttons**: Direct verbs (`Free Port`, `Stash Changes`, `Clean Selected`, `Purge Cache`). Primary actions use accent blue; dangerous actions use danger rose with confirmation dialogs.
- **Filter Tabs**: Clean neutral segmented buttons; active tab highlighted with `surface-3` and text-primary.
- **Port Pills**: `● :3000 ↗` in monospace with click-to-open browser action.
- **Command Palette (`Ctrl+K`)**: Centered overlay modal with backdrop blur, keyboard arrows, and quick actions.

## Do's and Don'ts
- **DO** use `JetBrains Mono` for any path, PID, port, branch, or file name.
- **DO** provide direct 1-click action buttons next to any detected issue.
- **DO** use tonal contrast and subtle 1px borders for card separation.
- **DON'T** use thick colored borders on cards (e.g. `border-l-4`).
- **DON'T** use AI jargon ("Cognitive Audit", "Substrate Matrix", "Entropy Index") in UI copy.
- **DON'T** use nested cards inside cards without tonal differentiation.
- **DON'T** use pure `#000000` or pure gray backgrounds without subtle cool tinting.
