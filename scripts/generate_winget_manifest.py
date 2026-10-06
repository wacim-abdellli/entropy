#!/usr/bin/env python3
"""
Entropy winget Manifest Generator

Generates Microsoft Windows Package Manager (winget-pkgs) manifests for Entropy releases.
Output manifests are saved to `dist/winget/manifests/w/WassimAbdelli/Entropy/<version>/`.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import re
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent


def get_current_version() -> str:
    """Read __version__ from scan.py."""
    scan_py = ROOT_DIR / "scan.py"
    if not scan_py.exists():
        return "0.2.6"
    content = scan_py.read_text(encoding="utf-8")
    m = re.search(r'__version__\s*=\s*"([^"]+)"', content)
    return m.group(1) if m else "0.2.6"


def compute_sha256(file_path: Path) -> str:
    """Compute SHA-256 hash of a file."""
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest().upper()


def generate_manifests(version: str, sha256_hash: str, output_dir: Path) -> None:
    """Generate the 3 winget manifest YAML files."""
    output_dir.mkdir(parents=True, exist_ok=True)

    version_yaml = f"""# Created with Entropy winget Manifest Generator
# yaml-language-server: $schema=https://aka.ms/winget-manifest.version.1.6.0.schema.json

PackageIdentifier: WassimAbdelli.Entropy
PackageVersion: {version}
DefaultLocale: en-US
ManifestType: version
ManifestVersion: 1.6.0
"""

    installer_yaml = f"""# Created with Entropy winget Manifest Generator
# yaml-language-server: $schema=https://aka.ms/winget-manifest.installer.1.6.0.schema.json

PackageIdentifier: WassimAbdelli.Entropy
PackageVersion: {version}
Platform:
- Windows.Desktop
MinimumOSVersion: 10.0.17763.0
InstallerType: inno
InstallModes:
- interactive
- silent
- silentWithProgress
Installers:
- Architecture: x64
  InstallerUrl: https://github.com/wacim-abdellli/entropy/releases/download/v{version}/Entropy-Setup-{version}.exe
  InstallerSha256: {sha256_hash}
  Scope: user
ManifestType: installer
ManifestVersion: 1.6.0
"""

    locale_yaml = f"""# Created with Entropy winget Manifest Generator
# yaml-language-server: $schema=https://aka.ms/winget-manifest.defaultLocale.1.6.0.schema.json

PackageIdentifier: WassimAbdelli.Entropy
PackageVersion: {version}
PackageLocale: en-US
Publisher: Wassim Abdelli
PublisherUrl: https://github.com/wacim-abdellli
PublisherSupportUrl: https://github.com/wacim-abdellli/entropy/issues
PackageName: Entropy
PackageUrl: https://github.com/wacim-abdellli/entropy
License: MIT
LicenseUrl: https://github.com/wacim-abdellli/entropy/blob/main/LICENSE
Copyright: Copyright (c) 2026 Wassim Abdelli
ShortDescription: The Developer Workspace Management Engine & Windows Optimization Suite
Description: Entropy is an all-in-one developer workspace management engine and Windows workstation optimization suite designed specifically for software engineers. It reclaims build artifacts, moves bloated tool directories to secondary drives via transparent NTFS Junctions, compacts WSL2 and Docker virtual disks, inspects open developer ports, and tunes Windows developer settings.
Moniker: entropy
Tags:
- developer-tools
- disk-cleanup
- workspace
- windows-tuning
- node-modules
- wsl2
- docker
- developer
ManifestType: defaultLocale
ManifestVersion: 1.6.0
"""

    (output_dir / "WassimAbdelli.Entropy.yaml").write_text(version_yaml, encoding="utf-8")
    (output_dir / "WassimAbdelli.Entropy.installer.yaml").write_text(installer_yaml, encoding="utf-8")
    (output_dir / "WassimAbdelli.Entropy.locale.en-US.yaml").write_text(locale_yaml, encoding="utf-8")

    print(f"Generated winget manifests for v{version} in: {output_dir}")
    print(f"  - WassimAbdelli.Entropy.yaml")
    print(f"  - WassimAbdelli.Entropy.installer.yaml (SHA-256: {sha256_hash})")
    print(f"  - WassimAbdelli.Entropy.locale.en-US.yaml")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate winget package manifests for Entropy.")
    parser.add_argument("--version", default=get_current_version(), help="Release version (e.g. 0.2.6)")
    parser.add_argument("--installer", help="Path to compiled Entropy-Setup-<ver>.exe")
    parser.add_argument("--sha256", help="Precomputed SHA-256 hash of installer")
    args = parser.parse_args()

    version = args.version.lstrip("v")
    sha256 = args.sha256

    if not sha256:
        installer_path = Path(args.installer) if args.installer else ROOT_DIR / "dist" / f"Entropy-Setup-{version}.exe"
        if installer_path.exists():
            print(f"Hashing installer: {installer_path}")
            sha256 = compute_sha256(installer_path)
        else:
            sha256 = "0000000000000000000000000000000000000000000000000000000000000000"
            print(f"Warning: Installer not found at {installer_path}. Using placeholder SHA-256.")

    output_dir = ROOT_DIR / "dist" / "winget" / "manifests" / "w" / "WassimAbdelli" / "Entropy" / version
    generate_manifests(version, sha256, output_dir)


if __name__ == "__main__":
    main()
