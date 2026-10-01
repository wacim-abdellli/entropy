"""
Installed Applications Inventory Engine for Entropy.

Extracts installed desktop software, developer tools, runtimes, browsers,
and utilities from the Windows Registry (HKCU and HKLM).
Provides size estimation, categorization, duplicate detection, and uninstaller triggering.
"""

from __future__ import annotations

import logging
import os
import re
import subprocess
from dataclasses import asdict, dataclass
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# Registry hives and scopes
try:
    import winreg
    HAS_WINREG = True
except ImportError:
    HAS_WINREG = False

DEV_KEYWORDS = {
    'git', 'visual studio', 'vs code', 'vscode', 'cursor', 'antigravity',
    'android studio', 'intellij', 'pycharm', 'clion', 'webstorm', 'rider',
    'goland', 'phpstorm', 'rubymine', 'eclipse', 'netbeans', 'dbeaver',
    'postman', 'docker', 'node.js', 'nodejs', 'python', 'rust', 'go programming',
    'bun', 'deno', 'cmake', 'llvm', 'jdk', 'temurin', 'openjdk', 'java runtime',
    'mingw', 'msys2', 'gitkraken', 'sourcetree', 'sublime', 'atom', 'notepad++',
    'insomnia', 'bruno', 'wireshark', 'putty', 'winscp', 'filezilla', 'openssh',
    'powershell', 'neovim', 'vim', 'gh', 'terraform', 'kubectl', 'helm',
    'mongodb', 'ruby', 'knime', 'postgresql', 'postgres', 'mysql', 'redis',
    'sqlite', 'mariadb', 'github desktop', 'tortoisegit', 'fiddler',
}

BROWSER_KEYWORDS = {
    'chrome', 'firefox', 'brave', 'edge', 'opera', 'vivaldi', 'tor browser',
    'chromium', 'arc', 'waterfox', 'librewolf',
}

COMM_KEYWORDS = {
    'discord', 'slack', 'microsoft teams', 'teams', 'zoom', 'telegram',
    'signal', 'skype', 'webex', 'whatsapp', 'mattermost',
}

PRODUCTIVITY_KEYWORDS = {
    'notion', 'obsidian', 'microsoft office', 'word', 'excel', 'powerpoint',
    'onenote', 'libreoffice', 'adobe', 'acrobat', 'figma', 'blender',
    'gimp', 'inkscape', 'canva', 'evernote', 'powerbi', 'power bi', 'tableau',
}

MEDIA_KEYWORDS = {
    'spotify', 'vlc', 'davinci', 'obs studio', 'audacity', 'handbrake',
    'capcut', 'foobar', 'streamlabs', 'plex', 'itunes',
}

UTILITY_KEYWORDS = {
    '7-zip', 'winrar', 'powertoys', 'everything', 'rufus', 'autoruns',
    'process hacker', 'process explorer', 'bleachbit', 'ccleaner', 'recuva',
    'windirstat', 'treesize', 'crystaldisk', 'hwinfo', 'cpu-z', 'gpu-z',
    'entropy', 'qbittorrent', 'transmission',
}

GAME_KEYWORDS = {
    'steam', 'epic games', 'riot client', 'valorant', 'league of legends',
    'battle.net', 'gog galaxy', 'ea app', 'ubisoft connect', 'origin',
    'unity hub', 'unreal engine', 'roblox', 'minecraft',
}


@dataclass
class InstalledApp:
    id: str
    name: str
    version: Optional[str]
    publisher: Optional[str]
    install_date: Optional[str]
    size_bytes: Optional[int]
    install_location: Optional[str]
    scope: str                     # 'user' or 'system'
    category: str                  # 'development', 'browser', 'communication', etc.
    can_uninstall: bool
    uninstall_command: Optional[str]
    is_dev_tool: bool

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d['size_formatted'] = self._format_size()
        return d

    def _format_size(self) -> str:
        if self.size_bytes is None or self.size_bytes <= 0:
            return '—'
        size = float(self.size_bytes)
        for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
            if size < 1024.0:
                return f"{size:.1f} {unit}"
            size /= 1024.0
        return f"{size:.1f} PB"


def _categorize_app(name: str, publisher: Optional[str] = None) -> Tuple[str, bool]:
    """Classify application category based on name and publisher."""
    low = name.lower()
    pub = (publisher or '').lower()
    combined = f"{low} {pub}"

    if any(k in combined for k in DEV_KEYWORDS):
        return 'development', True
    if any(k in combined for k in BROWSER_KEYWORDS):
        return 'browser', False
    if any(k in combined for k in COMM_KEYWORDS):
        return 'communication', False
    if any(k in combined for k in PRODUCTIVITY_KEYWORDS):
        return 'productivity', False
    if any(k in combined for k in MEDIA_KEYWORDS):
        return 'media', False
    if any(k in combined for k in UTILITY_KEYWORDS):
        return 'utility', False
    if any(k in combined for k in GAME_KEYWORDS):
        return 'game', False
    return 'other', False


def _format_registry_date(raw_date: Any) -> Optional[str]:
    """Parse Windows registry InstallDate (typically YYYYMMDD)."""
    if not raw_date:
        return None
    s = str(raw_date).strip()
    if len(s) == 8 and s.isdigit():
        return f"{s[:4]}-{s[4:6]}-{s[6:]}"
    return s


def get_installed_apps() -> List[Dict[str, Any]]:
    """
    Forensically enumerate all registered desktop software on Windows.
    Scans HKCU, HKLM 64-bit, and HKLM 32-bit (Wow6432Node).
    Filters out system components and internal hotfixes.
    """
    if not HAS_WINREG:
        logger.warning("winreg module not available on this platform.")
        return []

    hives = [
        ('user', winreg.HKEY_CURRENT_USER, r'Software\Microsoft\Windows\CurrentVersion\Uninstall'),
        ('system', winreg.HKEY_LOCAL_MACHINE, r'Software\Microsoft\Windows\CurrentVersion\Uninstall'),
        ('system', winreg.HKEY_LOCAL_MACHINE, r'Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall'),
    ]

    apps: List[InstalledApp] = []
    seen_keys: set = set()

    for scope, root, path in hives:
        try:
            with winreg.OpenKey(root, path) as base_key:
                subkeys_count, _, _ = winreg.QueryInfoKey(base_key)
                for i in range(subkeys_count):
                    try:
                        subkey_name = winreg.EnumKey(base_key, i)
                        with winreg.OpenKey(base_key, subkey_name) as sk:
                            def _get_val(val_name: str) -> Any:
                                try:
                                    val, _ = winreg.QueryValueEx(sk, val_name)
                                    return val
                                except OSError:
                                    return None

                            display_name = _get_val('DisplayName')
                            if not display_name or not str(display_name).strip():
                                continue

                            # Skip Windows system components, hotfixes, security updates
                            if _get_val('SystemComponent') == 1:
                                continue
                            if _get_val('ParentKeyName'):
                                continue
                            name_str = str(display_name).strip()
                            if re.match(r'^KB\d+', name_str) or 'Security Update' in name_str or 'Hotfix' in name_str:
                                continue

                            # Deduplicate identical name+version combinations across hives
                            ver = _get_val('DisplayVersion')
                            ver_str = str(ver).strip() if ver else None
                            dedup_key = (name_str.lower(), (ver_str or '').lower())
                            if dedup_key in seen_keys:
                                continue
                            seen_keys.add(dedup_key)

                            pub = _get_val('Publisher')
                            pub_str = str(pub).strip() if pub else None

                            # Size in bytes: EstimatedSize is stored in KB
                            size_kb = _get_val('EstimatedSize')
                            size_bytes: Optional[int] = None
                            if size_kb is not None:
                                try:
                                    size_bytes = int(size_kb) * 1024
                                except (ValueError, TypeError):
                                    pass

                            loc = _get_val('InstallLocation')
                            loc_str = str(loc).strip() if loc and os.path.exists(str(loc).strip()) else None

                            raw_date = _get_val('InstallDate')
                            date_str = _format_registry_date(raw_date)

                            uninst = _get_val('UninstallString')
                            quiet_uninst = _get_val('QuietUninstallString')
                            uninst_cmd = str(uninst or quiet_uninst or '').strip() or None

                            cat, is_dev = _categorize_app(name_str, pub_str)

                            apps.append(InstalledApp(
                                id=subkey_name,
                                name=name_str,
                                version=ver_str,
                                publisher=pub_str,
                                install_date=date_str,
                                size_bytes=size_bytes,
                                install_location=loc_str,
                                scope=scope,
                                category=cat,
                                can_uninstall=bool(uninst_cmd),
                                uninstall_command=uninst_cmd,
                                is_dev_tool=is_dev,
                            ))
                    except OSError:
                        continue
        except OSError:
            continue

    # Sort apps: primary sort by size descending (known sizes first), then alphabetical by name
    apps.sort(key=lambda a: (a.size_bytes is not None, a.size_bytes or 0, a.name.lower()), reverse=True)
    return [a.to_dict() for a in apps]


def launch_uninstaller(app_id: str) -> Dict[str, Any]:
    """
    Launch the official uninstaller for an application via its Windows registry UninstallString.
    Non-destructive: This launches the interactive uninstaller dialog provided by the application.
    """
    if not HAS_WINREG:
        return {"success": False, "error": "Windows Registry is unavailable."}

    hives = [
        (winreg.HKEY_CURRENT_USER, r'Software\Microsoft\Windows\CurrentVersion\Uninstall'),
        (winreg.HKEY_LOCAL_MACHINE, r'Software\Microsoft\Windows\CurrentVersion\Uninstall'),
        (winreg.HKEY_LOCAL_MACHINE, r'Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall'),
    ]

    uninstall_cmd = None
    app_name = app_id

    for root, path in hives:
        try:
            with winreg.OpenKey(root, path) as base_key:
                try:
                    with winreg.OpenKey(base_key, app_id) as sk:
                        try:
                            app_name, _ = winreg.QueryValueEx(sk, 'DisplayName')
                        except OSError:
                            pass

                        try:
                            val, _ = winreg.QueryValueEx(sk, 'UninstallString')
                            if val:
                                uninstall_cmd = str(val).strip()
                                break
                        except OSError:
                            pass
                except OSError:
                    pass
        except OSError:
            pass

    if not uninstall_cmd:
        return {"success": False, "error": f"No uninstaller registered for '{app_name}'."}

    try:
        # Launch without blocking the desktop GUI.
        # Windows will prompt for elevation (UAC) if the uninstaller requires admin.
        subprocess.Popen(uninstall_cmd, shell=True)
        return {
            "success": True,
            "message": f"Launched uninstaller for '{app_name}'. Follow the setup wizard to complete removal.",
        }
    except Exception as e:
        logger.error("Failed to launch uninstaller for %s: %s", app_name, e)
        return {"success": False, "error": f"Failed to launch uninstaller: {e}"}


def open_install_folder(path: str) -> Dict[str, Any]:
    """Safely open an application's install directory in Windows File Explorer."""
    if not path or not os.path.exists(path):
        return {"success": False, "error": "Folder does not exist or has been removed."}

    try:
        os.startfile(os.path.abspath(path))
        return {"success": True, "message": f"Opened {path} in File Explorer."}
    except Exception as e:
        logger.error("Failed to open path %s: %s", path, e)
        return {"success": False, "error": str(e)}
