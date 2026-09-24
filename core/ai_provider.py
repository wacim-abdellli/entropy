"""
AI Intelligence Provider for Entropy Workstation Orchestrator.

Supports:
1. Deterministic Local Rules (100% offline, zero-dependency, instant fallback)
2. Groq Cloud (Free Tier, ultra-fast Llama-3.3-70b / Llama-3.1-8b)
3. Local Ollama (100% offline local LLM via localhost:11434)

Zero external pip dependencies: uses Python standard library `urllib.request`.
Config persisted safely in `~/.entropy/config.json`.
"""

from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

CONFIG_DIR = Path.home() / ".entropy"
CONFIG_FILE = CONFIG_DIR / "config.json"

DEFAULT_CONFIG: Dict[str, Any] = {
    "provider": "rules",  # 'rules' | 'groq' | 'ollama'
    "groq_api_key": "",
    "groq_model": "llama-3.3-70b-versatile",
    "ollama_url": "http://localhost:11434",
    "ollama_model": "llama3.2",
}

SYSTEM_PROMPT = """You are Entropy Workspace Advisor, an expert developer environment assistant.
Your job is to provide concise, actionable, and 100% safe advice to software developers managing their machines.
Guidelines:
- Never recommend deleting source code, .git repositories, or unversioned work.
- Always recommend safe non-destructive commands (e.g. git stash, git branch -d, npm install).
- Explain technical consequences simply without synthetic AI jargon (no 'cognitive audit', 'substrate matrix').
- Keep responses short, direct, and structured with clear markdown bullet points.
"""


def get_ai_config() -> Dict[str, Any]:
    """Load AI provider settings from ~/.entropy/config.json."""
    if not CONFIG_FILE.exists():
        return dict(DEFAULT_CONFIG)
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            saved = json.load(f)
            merged = dict(DEFAULT_CONFIG)
            merged.update(saved)
            return merged
    except Exception as e:
        logger.warning("Failed to read AI config, using defaults: %s", e)
        return dict(DEFAULT_CONFIG)


def save_ai_config(updates: Dict[str, Any]) -> Dict[str, Any]:
    """Save updated AI provider settings to ~/.entropy/config.json."""
    current = get_ai_config()
    current.update(updates)
    try:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(current, f, indent=2)
        return {"success": True, "config": current}
    except Exception as e:
        logger.error("Failed to save AI config: %s", e)
        return {"success": False, "error": str(e), "config": current}


def test_ai_connection(provider: Optional[str] = None) -> Dict[str, Any]:
    """Test connectivity to the selected AI backend."""
    cfg = get_ai_config()
    target_provider = provider or cfg.get("provider", "rules")

    if target_provider == "rules":
        return {
            "success": True,
            "provider": "rules",
            "message": "Deterministic rules engine is active and ready (Offline, 0ms latency).",
        }

    if target_provider == "groq":
        api_key = cfg.get("groq_api_key", "").strip()
        if not api_key:
            return {
                "success": False,
                "provider": "groq",
                "error": "No Groq API key configured. Please enter your free API key in Settings.",
            }
        try:
            req_data = {
                "model": cfg.get("groq_model", "llama-3.1-8b-instant"),
                "messages": [{"role": "user", "content": "Reply with 'OK'."}],
                "max_tokens": 10,
            }
            req = urllib.request.Request(
                "https://api.groq.com/openai/v1/chat/completions",
                data=json.dumps(req_data).encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {api_key}",
                    "User-Agent": "Entropy-Advisor/0.1.0",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=8) as resp:
                if resp.status == 200:
                    return {
                        "success": True,
                        "provider": "groq",
                        "message": f"Connected to Groq Cloud ({cfg.get('groq_model')}). Latency is optimal.",
                    }
        except urllib.error.HTTPError as e:
            return {"success": False, "provider": "groq", "error": f"Groq API Error ({e.code}): {e.reason}"}
        except Exception as e:
            return {"success": False, "provider": "groq", "error": f"Connection failed: {e}"}

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


def ask_ai_advisor(question: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Ask the AI Advisor a question with developer context.
    Falls back gracefully to deterministic rule recommendations if network or provider fails.
    """
    cfg = get_ai_config()
    provider = cfg.get("provider", "rules")

    context_str = ""
    if context:
        ctx_parts = []
        if context.get("workspace_name"):
            ctx_parts.append(f"Workspace: {context['workspace_name']}")
        if context.get("project_type"):
            ctx_parts.append(f"Type: {context['project_type']}")
        if context.get("git_branch"):
            ctx_parts.append(f"Git Branch: {context['git_branch']}")
        if context.get("has_uncommitted_changes") is not None:
            ctx_parts.append(f"Uncommitted Changes: {context['has_uncommitted_changes']}")
        if context.get("ports"):
            ctx_parts.append(f"Active Ports: {context['ports']}")
        if context.get("artifacts"):
            ctx_parts.append(f"Artifact Folders: {context['artifacts']}")
        context_str = "\n".join(ctx_parts)

    user_message = question
    if context_str:
        user_message = f"Developer Context:\n{context_str}\n\nQuestion: {question}"

    # Provider 1: Groq Cloud
    if provider == "groq" and cfg.get("groq_api_key"):
        try:
            req_data = {
                "model": cfg.get("groq_model", "llama-3.3-70b-versatile"),
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_message},
                ],
                "temperature": 0.3,
                "max_tokens": 800,
            }
            req = urllib.request.Request(
                "https://api.groq.com/openai/v1/chat/completions",
                data=json.dumps(req_data).encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {cfg['groq_api_key']}",
                    "User-Agent": "Entropy-Advisor/0.1.0",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                res = json.loads(resp.read().decode("utf-8"))
                reply = res["choices"][0]["message"]["content"]
                return {
                    "success": True,
                    "answer": reply.strip(),
                    "provider": "groq",
                    "model": cfg.get("groq_model"),
                }
        except Exception as e:
            logger.warning("Groq request failed, falling back to local advisor: %s", e)

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
                return {
                    "success": True,
                    "answer": reply.strip(),
                    "provider": "ollama",
                    "model": cfg.get("ollama_model"),
                }
        except Exception as e:
            logger.warning("Ollama request failed, falling back to local advisor: %s", e)

    # Fallback: Deterministic Rule-Based Advice
    return {
        "success": True,
        "answer": _generate_rule_based_advice(question, context),
        "provider": "rules",
        "model": "offline-rules-engine",
    }


def _generate_rule_based_advice(question: str, context: Optional[Dict[str, Any]] = None) -> str:
    """Generate high-density rule-based advice when offline or no API key is provided."""
    q = question.lower()
    ctx = context or {}

    ws_name = ctx.get("workspace_name", "this workspace")
    has_dirty = ctx.get("has_uncommitted_changes", False)
    ports = ctx.get("ports", [])

    if "delete" in q or "node_modules" in q or "clean" in q:
        dirty_warning = (
            "\n- **Caution:** Uncommitted files detected in working tree. Run `git stash` before deleting to preserve your edits."
            if has_dirty
            else "\n- **Safe:** Working tree is clean. Deleting will not affect uncommitted code."
        )
        return (
            f"### Safety Verdict for `{ws_name}`\n"
            f"- **Build Artifacts:** Disposable dependencies (`node_modules`, `target`, `.venv`) can be safely deleted to reclaim space.{dirty_warning}\n"
            f"- **Rebuild:** You can recreate dependencies at any time using your standard package manager (`npm install`, `pnpm install`, or `cargo build`).\n"
            f"- **Recommendation:** If you are not actively developing in this workspace, clean build targets via the Entropy **Cleanup** tab."
        )

    if "port" in q or "server" in q or "process" in q:
        if ports:
            ports_str = ", :".join(str(p) for p in ports)
            return (
                f"### Active Dev Server Notice\n"
                f"- **Active Ports:** Workspace `{ws_name}` has active dev servers listening on `:{ports_str}`.\n"
                f"- **Recommendation:** If this server was left running unintentionally, click **Free Port** or use **Clean Slate** to reclaim RAM."
            )
        return (
            f"### Process Status for `{ws_name}`\n"
            f"- 0 active background processes or listening ports detected in this directory.\n"
            f"- The workspace is idle and safe for maintenance."
        )

    if "git" in q or "branch" in q or "commit" in q:
        return (
            f"### Version Control Health\n"
            f"- **Dirty Files:** {'Uncommitted changes need review.' if has_dirty else 'Clean working tree.'}\n"
            f"- **Best Practice:** Keep commits small and push to remote regularly. Stash work-in-progress before testing destructive package operations."
        )

    return (
        f"### Workspace Optimization for `{ws_name}`\n"
        f"- **Reclaim RAM:** Run **Clean Slate** from the Overview tab to terminate orphaned dev servers.\n"
        f"- **Disk Hygiene:** Clear stale build caches in the **Cleanup** tab (`node_modules`, `.next`, `target`).\n"
        f"- **Secret Protection:** Ensure all `.env` files are tracked in `.gitignore` to prevent accidental credential leaks."
    )
