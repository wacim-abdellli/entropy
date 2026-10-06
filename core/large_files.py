"""
Entropy Large File Hunter.

Scans project workspaces for abnormally large files (media, zip dumps, database backups,
ML model weights) that consume massive disk storage or risk bloating Git history.
Provides non-destructive deletion using the Windows Recycle Bin API.
"""

from __future__ import annotations

import ctypes
from ctypes import wintypes
import logging
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from core.audit_log import log_deletion
from core.config import get_scan_roots

logger = logging.getLogger(__name__)

# File category classifiers
CATEGORIES = {
    "media": {".mp4", ".mov", ".avi", ".mkv", ".wmv", ".wav", ".mp3", ".flac", ".aac", ".ogg", ".webm"},
    "archive": {".zip", ".tar", ".gz", ".tgz", ".7z", ".rar", ".iso", ".bz2", ".xz", ".cab"},
    "database": {".sqlite", ".sqlite3", ".db", ".sql", ".bak", ".dump", ".mdf", ".ldf"},
    "model_ml": {".onnx", ".bin", ".pt", ".pth", ".safetensors", ".h5", ".ckpt", ".gguf", ".tflite"},
    "binary": {".exe", ".msi", ".dll", ".dylib", ".so", ".pkg", ".deb", ".rpm", ".apk"},
    "dataset": {".csv", ".tsv", ".parquet", ".feather", ".arrow", ".jsonl", ".xml"},
}

# Directories to skip (standard massive package trees and git metadata)
EXCLUDED_DIRS: Set[str] = {
    ".git",
    "node_modules",
    ".venv",
    "venv",
    "__pycache__",
}


def _classify_category(ext: str) -> str:
    ext_lower = ext.lower()
    for cat, exts in CATEGORIES.items():
        if ext_lower in exts:
            return cat
    return "other"


def _send_to_recycle_bin(file_path: str) -> bool:
    """Move a file to the native Windows Recycle Bin using shell32 SHFileOperationW."""
    try:
        class SHFILEOPSTRUCTW(ctypes.Structure):
            _fields_ = [
                ("hwnd", wintypes.HWND),
                ("wFunc", wintypes.UINT),
                ("pFrom", wintypes.LPCWSTR),
                ("pTo", wintypes.LPCWSTR),
                ("fFlags", wintypes.WORD),
                ("fAnyOperationsAborted", wintypes.BOOL),
                ("hNameMappings", wintypes.LPVOID),
                ("lpszProgressTitle", wintypes.LPCWSTR),
            ]

        FO_DELETE = 0x0003
        FOF_ALLOWUNDO = 0x0040
        FOF_NOCONFIRMATION = 0x0010
        FOF_SILENT = 0x0004

        # pFrom requires a double-null-terminated string
        abs_path = os.path.abspath(file_path)
        p_from = abs_path + "\0\0"

        fileop = SHFILEOPSTRUCTW()
        fileop.hwnd = 0
        fileop.wFunc = FO_DELETE
        fileop.pFrom = p_from
        fileop.pTo = None
        fileop.fFlags = FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_SILENT
        fileop.fAnyOperationsAborted = False
        fileop.hNameMappings = None
        fileop.lpszProgressTitle = None

        ret = ctypes.windll.shell32.SHFileOperationW(ctypes.byref(fileop))
        return ret == 0 and not fileop.fAnyOperationsAborted
    except Exception as e:
        logger.debug("Failed to send to Recycle Bin via SHFileOperationW: %s", e)
        return False


def scan_large_files(
    roots: Optional[List[str]] = None,
    min_size_mb: int = 25,
    max_results: int = 150,
) -> List[Dict[str, Any]]:
    """
    Search workspace directories for large files exceeding min_size_mb.
    Excludes node_modules, build targets, and git internal metadata.
    """
    if roots is None:
        roots = get_scan_roots()

    valid_roots = [os.path.abspath(r) for r in roots if os.path.isdir(r)]
    if not valid_roots:
        return []

    min_bytes = int(min_size_mb * 1024 * 1024)
    found_files: List[Dict[str, Any]] = []

    for r in valid_roots:
        for root, dirs, files in os.walk(r, topdown=True):
            # Prune excluded directories
            dirs[:] = [d for d in dirs if d not in EXCLUDED_DIRS]

            for file in files:
                full_path = os.path.join(root, file)
                try:
                    stat = os.stat(full_path)
                    sz = stat.st_size
                    if sz >= min_bytes:
                        ext = os.path.splitext(file)[1]
                        rel_path = os.path.relpath(full_path, r)
                        found_files.append({
                            "path": full_path,
                            "name": file,
                            "extension": ext.lower(),
                            "size_bytes": sz,
                            "last_modified": stat.st_mtime,
                            "category": _classify_category(ext),
                            "workspace_root": r,
                            "relative_path": rel_path,
                        })
                        if len(found_files) >= max_results:
                            break
                except (OSError, PermissionError):
                    continue
            if len(found_files) >= max_results:
                break

    # Sort descending by size
    found_files.sort(key=lambda x: x["size_bytes"], reverse=True)
    return found_files


def delete_large_file(file_path: str, use_recycle_bin: bool = True) -> Dict[str, Any]:
    """
    Safely delete a large file with audit logging.
    Defaults to moving to the Windows Recycle Bin for 100% undo safety.
    """
    abs_path = os.path.abspath(file_path)
    if not os.path.exists(abs_path):
        return {"success": False, "error": f"File does not exist: {abs_path}"}
    if os.path.isdir(abs_path):
        return {"success": False, "error": f"Target is a directory, not a file: {abs_path}"}

    try:
        file_size = os.path.getsize(abs_path)
        success = False

        if use_recycle_bin:
            success = _send_to_recycle_bin(abs_path)
            if not success:
                return {
                    "success": False,
                    "error": "Failed to move file to Windows Recycle Bin. Permanent deletion was prevented for your safety.",
                }
        else:
            os.remove(abs_path)
            success = not os.path.exists(abs_path)

        if success:
            log_deletion(
                action="large_file_deletion",
                paths=[abs_path],
                freed_bytes=file_size,
                outcome="success",
                details={"file": os.path.basename(abs_path), "recycle_bin": use_recycle_bin},
            )
            return {
                "success": True,
                "message": f"Successfully deleted {os.path.basename(abs_path)}",
                "path": abs_path,
                "freed_bytes": file_size,
            }
        else:
            return {"success": False, "error": "Windows prevented deleting the file. It may be locked by another process."}
    except Exception as e:
        logger.error("Failed to delete large file %s: %s", abs_path, e)
        return {"success": False, "error": str(e)}
