"""Loads settings from .env. Never print or log secret values."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import dotenv_values, load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")
# load_dotenv never overrides an existing variable, even an empty one (Codespaces creates empty variables for declared secrets
# that are not set), so fill any empty ones from the file.
for _k, _v in dotenv_values(ROOT / ".env").items():
    if _v and not os.environ.get(_k):
        os.environ[_k] = _v


def get(name: str, default: str | None = None) -> str | None:
    """Return an environment value, or the default if missing/empty."""
    value = os.getenv(name)
    return value if value else default


def require(name: str) -> str:
    """Return an environment value or raise a clear error (without echoing secrets)."""
    value = get(name)
    if not value:
        raise RuntimeError(f"{name} is not set. Add it to .env (see .env.example).")
    return value


def demo_mode() -> bool:
    return (get("DEMO_MODE", "false") or "false").lower() in {"1", "true", "yes"}


DATABASE_URL = get("DATABASE_URL")
ANTHROPIC_API_KEY = get("ANTHROPIC_API_KEY")
