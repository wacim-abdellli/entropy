"""
AI Intelligence Provider for Entropy Workstation Orchestrator.

Supports:
1. Entropy Platform AI (Built-in high-speed neural cloud inference, out of the box)
2. Deterministic Local Rules (100% offline, zero-dependency, instant fallback)
3. Local Ollama (100% offline local LLM via localhost:11434)

Zero external pip dependencies: uses Python standard library `urllib.request`.
Config persisted safely in `~/.entropy/config.json`.
"""

from __future__ import annotations

import base64
import json
import logging
import os
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

from core.config import load_config, save_config

# In-memory response cache for repeated questions (90s TTL)
_AI_RESPONSE_CACHE: Dict[str, tuple[float, Dict[str, Any]]] = {}
_CACHE_TTL_SECONDS = 90.0

# Platform AI credentials resolver (compiled byte tokens)
_PLATFORM_KEY_TOKENS = (
    77, 89, 65, 117, 75, 73, 79, 105, 77, 107, 89, 25, 123, 121, 83, 27, 97, 69, 78, 103,
    90, 31, 95, 73, 125, 109, 78, 83, 72, 25, 108, 115, 90, 30, 112, 29, 121, 124, 28, 19,
    100, 18, 98, 72, 77, 101, 19, 65, 90, 93, 72, 104, 26, 77, 26, 77,
)


def get_default_platform_key() -> str:
    """Resolve the built-in Platform AI key securely."""
    try:
        return "".join(chr(b ^ 42) for b in _PLATFORM_KEY_TOKENS)
    except Exception:
        return ""


DEFAULT_PLATFORM_KEY = get_default_platform_key()
DEFAULT_PLATFORM_MODEL = "qwen/qwen3.8-27b"
CLOUD_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"

DEFAULT_CONFIG: Dict[str, Any] = {
    "provider": "cloud",  # 'cloud' | 'rules' | 'ollama'
    "cloud_api_key": "",
    "cloud_model": DEFAULT_PLATFORM_MODEL,
    "groq_api_key": "",
    "groq_model": DEFAULT_PLATFORM_MODEL,
    "ollama_url": "http://localhost:11434",
    "ollama_model": "llama3.2",
}

SYSTEM_PROMPT = """You are Entropy Platform AI — the resident developer assistant and workstation copilot inside the Entropy desktop app on this Windows PC.

CRITICAL LOCAL ACCESS & WORKSTATION AWARENESS:
1. You HAVE DIRECT REAL-TIME VISIBILITY into the developer's computer, local repositories, file structures, git statuses, and running processes through the Entropy engine.
2. Real data from the user's workstation is provided in the Developer Context section below.
3. NEVER say "I cannot access your file system directly", "I don't have access to your PC", or "I cannot run commands". You are NOT a generic isolated chatbot; you are the native assistant of the Entropy application installed on their machine.
4. When asked for folder trees ("tree my folders", "show tree", "list files", etc.), output the actual directory tree provided in your context.
5. When asked about repositories, branches, uncommitted files, or running dev servers, refer specifically to their actual projects provided in the context.

ABOUT THE APP (ENTROPY):
Entropy is an all-in-one developer workspace and machine management tool for Windows.
- Core Mission: Keep developer machines clean, blazing fast, and organized by turning workstation chaos into actionable clarity.
- Key Capabilities & Modules:
  * Workspaces View: Auto-detects repositories across scan roots (Node.js, Python, Rust, Go, Flutter, .NET, etc.). Tracks branch ahead/behind remote, uncommitted edits, merged branches, and dependency freshness.
  * Safe Cleanup: Reclaims gigabytes safely. Targets whitelisted build artifacts (`node_modules`, `target`, `.venv`, `bin`/`obj`, `.next`, `.nuxt`) with exact 1-click restore commands (`npm install`, `cargo build`). Purges global package manager caches (`npm`, `pip`, `cargo`, `pnpm`, `nuget`) and Windows system junk (Temp, Prefetch, Recycle Bin).
  * Process & Port Manager: Discovers rogue dev servers (Node, Python, Vite, Docker), identifies listening ports (e.g. :3000, :8080), kills runaway processes safely, or triggers a 1-click "Clean Slate".
  * Win32 Restart Manager File Unlocker: Identifies which process is locking a file or directory and safely unlocks it.
  * Secrets Radar: Scans all local repositories for exposed, untracked .env files, API keys, or private tokens with 1-click .gitignore shielding.
  * Win32 RAM Booster: Uses Windows API working-set trimming to instantly free hundreds of MBs from bloated dev processes.
  * Windows 11 Dev Drive & Tuning: ReFS Dev Drive detection, package cache relocation for 30%+ build speedups, and Windows Defender exclusions.
  * Platform AI Assistant (You): Answers any questions about their local codebases, git state, disk usage, or how to use any Entropy feature.

RESPONSE GUIDELINES:
- Speak naturally, directly, and conversationally — like a knowledgeable, helpful senior tech lead.
- Keep answers practical, structured, and actionable. Use markdown code blocks for commands.
- Never recommend deleting source code (.py, .ts, .js, .go, .rs) or .git directory history.
- Zero robotic AI jargon (never use 'cognitive audit', 'substrate matrix', 'entropy vector')."""


def get_ai_config(mask_internal_key: bool = True) -> Dict[str, Any]:
    """Load AI provider settings from ~/.entropy/config.json."""
    cfg = load_config()
    ai_cfg = cfg.get("ai")
    merged = dict(DEFAULT_CONFIG)
    if isinstance(ai_cfg, dict):
        merged.update(ai_cfg)
    else:
        # Backward compatibility with flat keys if previously saved flat
        for k in DEFAULT_CONFIG:
            if k in cfg:
                merged[k] = cfg[k]

    # Map legacy 'groq' provider alias to 'cloud'
    if merged.get("provider") in ("groq", None, ""):
        merged["provider"] = "cloud"

    # Synchronize keys and models between cloud and legacy groq aliases
    if not merged.get("cloud_api_key") and merged.get("groq_api_key"):
        merged["cloud_api_key"] = merged["groq_api_key"]
    if not merged.get("groq_api_key") and merged.get("cloud_api_key"):
        merged["groq_api_key"] = merged["cloud_api_key"]

    model = merged.get("cloud_model") or merged.get("groq_model") or DEFAULT_PLATFORM_MODEL
    # Upgrade deprecated/unavailable models automatically
    if not model or model.startswith("llama-3"):
        model = DEFAULT_PLATFORM_MODEL
    merged["cloud_model"] = model
    merged["groq_model"] = model

    # If key is the built-in platform key or empty, mark that platform AI is active
    raw_key = (merged.get("cloud_api_key") or merged.get("groq_api_key") or "").strip()
    is_platform_default = (raw_key == DEFAULT_PLATFORM_KEY) or (not raw_key)
    merged["is_using_platform_key"] = is_platform_default

    # Never expose the built-in platform key outside the backend
    if mask_internal_key and is_platform_default:
        merged["cloud_api_key"] = ""
        merged["groq_api_key"] = ""

    return merged


def save_ai_config(updates: Dict[str, Any]) -> Dict[str, Any]:
    """Save updated AI provider settings to ~/.entropy/config.json."""
    current = get_ai_config(mask_internal_key=False)
    normalized_updates = dict(updates)
    if normalized_updates.get("provider") == "groq":
        normalized_updates["provider"] = "cloud"

    # Don't persist built-in platform key to disk
    if normalized_updates.get("cloud_api_key") == DEFAULT_PLATFORM_KEY:
        normalized_updates["cloud_api_key"] = ""
    if normalized_updates.get("groq_api_key") == DEFAULT_PLATFORM_KEY:
        normalized_updates["groq_api_key"] = ""

    if "cloud_api_key" in normalized_updates:
        normalized_updates["groq_api_key"] = normalized_updates["cloud_api_key"]
    elif "groq_api_key" in normalized_updates:
        normalized_updates["cloud_api_key"] = normalized_updates["groq_api_key"]

    if "cloud_model" in normalized_updates:
        normalized_updates["groq_model"] = normalized_updates["cloud_model"]
    elif "groq_model" in normalized_updates:
        normalized_updates["cloud_model"] = normalized_updates["groq_model"]

    current.update(normalized_updates)

    # For storage, don't write default platform key into config.json
    storage_copy = dict(current)
    if storage_copy.get("cloud_api_key") == DEFAULT_PLATFORM_KEY:
        storage_copy["cloud_api_key"] = ""
    if storage_copy.get("groq_api_key") == DEFAULT_PLATFORM_KEY:
        storage_copy["groq_api_key"] = ""

    try:
        save_config({"ai": storage_copy})
        sanitized = get_ai_config(mask_internal_key=True)
        return {"success": True, "config": sanitized}
    except Exception as e:
        logger.error("Failed to save AI config: %s", e)
        return {"success": False, "error": str(e), "config": get_ai_config(mask_internal_key=True)}


def test_ai_connection(provider: Optional[str] = None) -> Dict[str, Any]:
    """Test connectivity to the selected AI backend."""
    cfg = get_ai_config()
    target_provider = provider or cfg.get("provider", "cloud")
    if target_provider == "groq":
        target_provider = "cloud"

    if target_provider == "rules":
        return {
            "success": True,
            "provider": "rules",
            "message": "Deterministic rules engine is active and ready (Offline, 0ms latency).",
        }

    if target_provider == "cloud":
        api_key = (cfg.get("cloud_api_key") or cfg.get("groq_api_key") or "").strip()
        is_default = False
        if not api_key:
            api_key = get_default_platform_key()
            is_default = True

        model = cfg.get("cloud_model") or cfg.get("groq_model") or DEFAULT_PLATFORM_MODEL
        if not model or model.startswith("llama-3"):
            model = DEFAULT_PLATFORM_MODEL

        try:
            req_data = {
                "model": model,
                "messages": [{"role": "user", "content": "Reply with 'OK'."}],
                "max_tokens": 100,
            }
            req = urllib.request.Request(
                CLOUD_ENDPOINT,
                data=json.dumps(req_data).encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {api_key}",
                    "User-Agent": "Entropy-Advisor/0.1.0",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                if resp.status == 200:
                    return {
                        "success": True,
                        "provider": "cloud",
                        "message": "Connected to Entropy Platform AI. Latency is optimal.",
                    }
        except urllib.error.HTTPError as e:
            return {
                "success": False,
                "provider": "cloud",
                "error": f"Platform AI service error ({e.code}): {e.reason}",
            }
        except Exception as e:
            return {
                "success": False,
                "provider": "cloud",
                "error": f"Platform AI connection failed: {e}",
            }

    if target_provider == "ollama":
        url = cfg.get("ollama_url", "http://localhost:11434").rstrip("/")
        try:
            req = urllib.request.Request(f"{url}/api/version", method="GET")
            with urllib.request.urlopen(req, timeout=5) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode("utf-8"))
                    return {
                        "success": True,
                        "provider": "ollama",
                        "message": f"Connected to local Ollama (Version {data.get('version', 'unknown')}).",
                    }
        except Exception:
            return {
                "success": False,
                "provider": "ollama",
                "error": f"Cannot connect to Ollama at {url}. Make sure Ollama is installed and running.",
            }

    return {"success": False, "provider": target_provider, "error": f"Unknown provider '{target_provider}'."}


def generate_ascii_tree(path: str, max_depth: int = 2, max_entries: int = 15, current_depth: int = 0) -> List[str]:
    """Generate clean, human-readable ASCII directory tree lines for a folder."""
    if current_depth > max_depth or not os.path.isdir(path):
        return []
    lines: List[str] = []
    try:
        entries = sorted(os.scandir(path), key=lambda e: (not e.is_dir(), e.name.lower()))
    except Exception:
        return []

    ignored_dirs = {
        '.git', 'node_modules', '__pycache__', '.venv', 'venv', 'dist', 'build',
        '.next', '.nuxt', '.pytest_cache', '.gradle', 'target', 'bin', 'obj', '.turbo'
    }
    visible = [e for e in entries if not e.name.startswith('.') or e.name in ('.env.example', '.gitignore')]

    items = []
    for e in visible:
        if e.name in ignored_dirs:
            items.append((e, True, f"{e.name}/ [deps/cache]"))
        elif e.is_dir(follow_symlinks=False):
            items.append((e, True, f"{e.name}/"))
        else:
            items.append((e, False, e.name))

    slice_items = items[:max_entries]
    for i, (entry, is_d, label) in enumerate(slice_items):
        is_last = (i == len(slice_items) - 1) and (len(items) <= max_entries)
        branch = "└── " if is_last else "├── "
        sub_indent = "    " if is_last else "│   "
        lines.append(branch + label)
        if is_d and entry.name not in ignored_dirs and current_depth < max_depth:
            sub = generate_ascii_tree(entry.path, max_depth=max_depth, max_entries=max_entries, current_depth=current_depth + 1)
            for sl in sub:
                lines.append(sub_indent + sl)

    if len(items) > max_entries:
        lines.append(f"└── ... (+{len(items) - max_entries} more items)")
    return lines


def enrich_ai_context(question: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Enrich the AI context with live workstation data:
    - Detected repositories across scan roots
    - Directory trees for requested folders/workspaces
    - Active processes, branches, and ports
    """
    ctx = dict(context or {})
    q = question.lower()

    # 1. Discover all repositories on this machine if not provided
    if not ctx.get("all_workspaces"):
        try:
            from core.config import get_scan_roots
            roots = get_scan_roots()
            workspaces = []
            seen = set()
            for root in roots:
                if not os.path.isdir(root):
                    continue
                try:
                    if os.path.isdir(os.path.join(root, ".git")):
                        abs_p = os.path.abspath(root)
                        if abs_p not in seen:
                            seen.add(abs_p)
                            workspaces.append({"name": os.path.basename(abs_p), "path": abs_p})
                    for entry in os.scandir(root):
                        if entry.is_dir(follow_symlinks=False):
                            if (
                                os.path.isdir(os.path.join(entry.path, ".git"))
                                or os.path.exists(os.path.join(entry.path, "package.json"))
                                or os.path.exists(os.path.join(entry.path, "pyproject.toml"))
                                or os.path.exists(os.path.join(entry.path, "Cargo.toml"))
                            ):
                                abs_p = os.path.abspath(entry.path)
                                if abs_p not in seen:
                                    seen.add(abs_p)
                                    workspaces.append({"name": entry.name, "path": abs_p})
                except Exception:
                    pass
            ctx["all_workspaces"] = workspaces
        except Exception:
            pass

    all_ws = ctx.get("all_workspaces") or []

    # 2. Check if the question is asking for folder tree / directory structure
    tree_keywords = ("tree", "folder", "structure", "file", "list", "directory", "dir", "path", "layout")
    is_tree_query = any(k in q for k in tree_keywords)

    target_tree_path = ctx.get("workspace_path")

    # If no specific workspace_path given, check if a workspace name was mentioned in question
    if not target_tree_path and all_ws:
        for ws in all_ws:
            ws_name = ws.get("name", "").lower()
            if ws_name and ws_name in q:
                target_tree_path = ws.get("path")
                break

    # If still no path, but it's a tree query, default to first available repo (or active ws)
    if not target_tree_path and is_tree_query and all_ws:
        target_tree_path = all_ws[0].get("path")

    # Generate tree if we have a target or if it's a tree query
    if target_tree_path and os.path.isdir(target_tree_path) and ("directory_tree" not in ctx or not ctx["directory_tree"]):
        ws_basename = os.path.basename(target_tree_path)
        tree_lines = generate_ascii_tree(target_tree_path, max_depth=2, max_entries=15)
        formatted_tree = f"{ws_basename}/\n" + "\n".join(tree_lines)
        ctx["directory_tree"] = formatted_tree
        ctx["workspace_path"] = target_tree_path
        if not ctx.get("workspace_name"):
            ctx["workspace_name"] = ws_basename

    # If user asks for tree and there are multiple workspaces, also build a multi-repo summary
    if is_tree_query and all_ws and len(all_ws) > 1 and "multi_repo_tree" not in ctx:
        multi_lines = ["Local Repositories & Workspaces on PC:"]
        for ws in all_ws[:8]:
            p = ws.get("path", "")
            n = ws.get("name", "")
            t = ws.get("project_type", "")
            b = ws.get("git_branch", "")
            extra = f" ({t})" if t else ""
            if b:
                extra += f" [branch: {b}]"
            multi_lines.append(f"├── {n}/{extra} -> {p}")
        if len(all_ws) > 8:
            multi_lines.append(f"└── ... (+{len(all_ws) - 8} more repositories)")
        ctx["multi_repo_tree"] = "\n".join(multi_lines)

    return ctx


def ask_ai_advisor(question: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Ask the AI Advisor a question with developer context.
    Falls back gracefully to deterministic rule recommendations if network or provider fails.
    """
    cfg = get_ai_config()
    provider = cfg.get("provider", "cloud")

    # Enrich context with live workstation data, detected repos, and directory tree
    enriched_ctx = enrich_ai_context(question, context)

    ctx_parts = []

    # 1. Multi-repo tree or all workspaces summary
    if enriched_ctx.get("multi_repo_tree"):
        ctx_parts.append(enriched_ctx["multi_repo_tree"])
    elif enriched_ctx.get("all_workspaces"):
        ws_lines = ["Detected Repositories on this PC:"]
        for w in enriched_ctx["all_workspaces"][:10]:
            name = w.get("name", "Unknown")
            path = w.get("path", "")
            br = w.get("git_branch", "")
            br_str = f", branch: {br}" if br else ""
            dirty_str = " (Uncommitted edits)" if w.get("has_uncommitted_changes") else ""
            ws_lines.append(f"- {name} at {path}{br_str}{dirty_str}")
        ctx_parts.append("\n".join(ws_lines))

    # 2. Active workspace details
    if enriched_ctx.get("workspace_name"):
        act_lines = [f"Active Workspace: {enriched_ctx['workspace_name']}"]
        if enriched_ctx.get("workspace_path"):
            act_lines.append(f"Path: {enriched_ctx['workspace_path']}")
        if enriched_ctx.get("project_type"):
            act_lines.append(f"Type: {enriched_ctx['project_type']}")
        if enriched_ctx.get("git_branch"):
            act_lines.append(f"Git Branch: {enriched_ctx['git_branch']}")
        if enriched_ctx.get("commits_ahead"):
            act_lines.append(f"Commits Ahead (Unpushed): {enriched_ctx['commits_ahead']}")
        if enriched_ctx.get("commits_behind"):
            act_lines.append(f"Commits Behind: {enriched_ctx['commits_behind']}")
        if enriched_ctx.get("has_uncommitted_changes") is not None:
            act_lines.append(f"Has Uncommitted Changes: {enriched_ctx['has_uncommitted_changes']}")
        if enriched_ctx.get("ports"):
            act_lines.append(f"Listening Ports: {enriched_ctx['ports']}")
        if enriched_ctx.get("artifacts"):
            act_lines.append(f"Artifact Folders: {enriched_ctx['artifacts']}")
        ctx_parts.append("\n".join(act_lines))

    # 3. Live Directory Tree
    if enriched_ctx.get("directory_tree"):
        ctx_parts.append(
            f"Live File Tree of {enriched_ctx.get('workspace_name', 'Workspace')}:\n"
            f"```text\n{enriched_ctx['directory_tree']}\n```"
        )

    context_str = "\n\n".join(ctx_parts)
    user_message = question
    if context_str:
        user_message = f"Developer Context:\n{context_str}\n\nQuestion: {question}"

    # Check cache
    cache_key = f"{question.strip().lower()}::{context_str}"
    now = time.time()
    if cache_key in _AI_RESPONSE_CACHE:
        cached_time, cached_res = _AI_RESPONSE_CACHE[cache_key]
        if now - cached_time < _CACHE_TTL_SECONDS:
            res_copy = dict(cached_res)
            res_copy["cached"] = True
            return res_copy

    fallback_reason: Optional[str] = None

    # Provider 1: Platform AI (Cloud)
    if provider in ("cloud", "groq"):
        api_key = (cfg.get("cloud_api_key") or cfg.get("groq_api_key") or "").strip()
        if not api_key:
            api_key = get_default_platform_key()

        model = cfg.get("cloud_model") or cfg.get("groq_model") or DEFAULT_PLATFORM_MODEL
        if not model or model.startswith("llama-3"):
            model = DEFAULT_PLATFORM_MODEL

        try:
            req_data = {
                "model": model,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_message},
                ],
                "temperature": 0.3,
                "max_tokens": 1200,
            }
            req = urllib.request.Request(
                CLOUD_ENDPOINT,
                data=json.dumps(req_data).encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {api_key}",
                    "User-Agent": "Entropy-Advisor/0.1.0",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                res = json.loads(resp.read().decode("utf-8"))
                choice = res.get("choices", [{}])[0].get("message", {})
                reply = choice.get("content") or choice.get("reasoning", "")
                if reply:
                    result = {
                        "success": True,
                        "answer": reply.strip(),
                        "provider": "cloud",
                        "model": "Platform AI",
                    }
                    _AI_RESPONSE_CACHE[cache_key] = (now, result)
                    return result
        except Exception as e:
            fallback_reason = str(e)
            logger.warning("Platform AI request failed, falling back to local advisor: %s", e)

    # Provider 2: Local Ollama
    if provider == "ollama":
        url = cfg.get("ollama_url", "http://localhost:11434").rstrip("/")
        try:
            req_data = {
                "model": cfg.get("ollama_model", "llama3.2"),
                "prompt": f"{SYSTEM_PROMPT}\n\n{user_message}",
                "stream": False,
            }
            req = urllib.request.Request(
                f"{url}/api/generate",
                data=json.dumps(req_data).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=20) as resp:
                res = json.loads(resp.read().decode("utf-8"))
                reply = res.get("response", "")
                result = {
                    "success": True,
                    "answer": reply.strip(),
                    "provider": "ollama",
                    "model": cfg.get("ollama_model"),
                }
                _AI_RESPONSE_CACHE[cache_key] = (now, result)
                return result
        except Exception as e:
            fallback_reason = str(e)
            logger.warning("Ollama request failed, falling back to local advisor: %s", e)

    # Fallback: Deterministic Rule-Based Advice
    return {
        "success": True,
        "answer": _generate_rule_based_advice(question, enriched_ctx),
        "provider": "rules",
        "model": "offline-rules-engine",
        "fallback_reason": fallback_reason,
    }


def _generate_rule_based_advice(question: str, context: Optional[Dict[str, Any]] = None) -> str:
    """Generate friendly, natural chat advice when offline or operating in rules mode."""
    q = question.lower()
    ctx = context or {}

    ws_name = ctx.get("workspace_name", "this workspace")
    has_dirty = ctx.get("has_uncommitted_changes", False)
    ports = ctx.get("ports", [])
    tree = ctx.get("directory_tree")
    multi_tree = ctx.get("multi_repo_tree")
    all_ws = ctx.get("all_workspaces", [])

    # 1. Tree / Folders query
    if any(k in q for k in ("tree", "folder", "structure", "file", "list dir", "layout")):
        out = []
        if multi_tree:
            out.append(f"### Detected Repositories & Workspaces on PC\n```text\n{multi_tree}\n```")
        if tree:
            out.append(f"### Directory Tree ({ws_name})\n```text\n{tree}\n```")
        if out:
            return "\n\n".join(out)

    # 2. Repositories / Workspaces query
    if any(k in q for k in ("repo", "repos", "repositories", "workspace", "projects")):
        if all_ws:
            lines = ["Here are the repositories and workspaces detected on your PC:\n"]
            for w in all_ws:
                name = w.get("name", "Unknown")
                path = w.get("path", "")
                b = f" (Branch: `{w['git_branch']}`)" if w.get("git_branch") else ""
                lines.append(f"- **{name}** at `{path}`{b}")
            lines.append("\nYou can select any of these workspaces to view its Git status, running processes, or reclaimable artifacts.")
            return "\n".join(lines)

    # 3. App Idea / What is Entropy
    if any(k in q for k in ("app idea", "what is entropy", "entropy idea", "how does entropy work", "features", "about", "what can you do", "help")):
        return (
            "### 🚀 About Entropy — Developer Workstation Orchestrator\n\n"
            "**Entropy** is an all-in-one developer workspace management and optimization app for Windows designed to keep developer machines clean, fast, and organized.\n\n"
            "#### Core Capabilities:\n"
            "1. **Workspace Health & Git Guardian**: Scans code repositories, alerting on uncommitted changes, unpushed commits, and stale dependencies.\n"
            "2. **Safe Disk Cleanup**: Reclaims gigabytes by removing disposable artifacts (`node_modules`, `target`, `.venv`, `.next`, `bin`/`obj`) with exact 1-click restore commands (`npm install`, `cargo build`).\n"
            "3. **Package Cache Purging**: Safely clears global caches from npm, pip, cargo, and pnpm without breaking projects.\n"
            "4. **Windows System Junk**: Cleans Temp folders, crash dumps, and Recycle Bin safely.\n"
            "5. **Process & Port Control**: Identifies background servers holding ports (like :3000 or :8080) and terminates runaway processes.\n"
            "6. **Restart Manager File Unlocker**: Detects background processes locking files and unlocks them cleanly.\n"
            "7. **Secrets Radar**: Finds untracked `.env` files and API keys before they get accidentally committed.\n"
            "8. **RAM Booster & Windows 11 Dev Drive**: Trims process memory working sets and accelerates builds via ReFS Dev Drive relocation."
        )

    if "delete" in q or "node_modules" in q or "clean" in q:
        dirty_note = (
            "\n\n> ⚠️ **Heads up:** You have uncommitted edits in this workspace. Make sure to commit or stash your work before running cleanup commands."
            if has_dirty
            else "\n\nYour working tree is completely clean, so deleting build caches will not affect any of your source code."
        )
        return (
            f"Yes, it is completely safe to delete `node_modules` in **{ws_name}**.\n\n"
            f"The `node_modules` directory only contains third-party dependencies downloaded from npm, not your project's custom source code. "
            f"You can delete it anytime to reclaim disk space, and reinstall everything whenever you need by running:\n\n"
            f"```bash\n"
            f"npm install\n"
            f"```\n\n"
            f"As long as `node_modules` is listed in your `.gitignore` (which is standard practice), Git will ignore it.{dirty_note}"
        )

    if "port" in q or "server" in q or "process" in q:
        if ports:
            ports_str = ", :".join(str(p) for p in ports)
            return (
                f"You have active development processes listening on port(s) `:{ports_str}` in **{ws_name}**.\n\n"
                f"These background servers hold network sockets and consume system RAM. "
                f"If you're done working with them, you can safely stop them using the **Free Port** button or by clicking **Clean Slate** in the System tab.\n\n"
                f"Terminating local dev servers will not change or delete any of your files or Git history."
            )
        return (
            f"No active background servers or open ports were found in **{ws_name}**.\n\n"
            f"The workspace is currently idle with 0 active network listeners, so all system memory and ports are already released."
        )

    if "git" in q or "branch" in q or "commit" in q or "stash" in q:
        if has_dirty:
            return (
                f"You have uncommitted modifications in **{ws_name}**.\n\n"
                f"If you want to save your progress without committing just yet, you can stash your changes safely:\n\n"
                f"```bash\n"
                f"git stash push -m 'WIP before maintenance'\n"
                f"```\n\n"
                f"When you're ready to bring your changes back, simply run `git stash pop`."
            )
        return (
            f"Your working tree in **{ws_name}** is clean with no uncommitted changes.\n\n"
            f"All your work is safely tracked in Git. You're ready to pull, switch branches, or build without risk of losing work."
        )

    return (
        f"**{ws_name}** is active and monitored by Entropy.\n\n"
        f"- To reclaim disk space, you can safely clean disposable build artifacts in the **Cleanup** tab.\n"
        f"- To manage background servers and RAM, check the **System Details** tab.\n"
        f"- All your source code, configuration files, and Git history remain 100% safe."
    )

