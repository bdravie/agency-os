"""Loaders for config/niches.yaml and config/offers.yaml. Never hard-code niches or prices."""

from __future__ import annotations

import re
from typing import Any

import yaml

from agency.config import ROOT


def _load(name: str) -> dict[str, Any]:
    return yaml.safe_load((ROOT / "config" / name).read_text()) or {}


def niches() -> dict[str, Any]:
    return _load("niches.yaml")


def offers() -> list[dict[str, Any]]:
    return _load("offers.yaml").get("offers", [])


def custom_niches() -> dict[str, dict[str, Any]]:
    """Niches added in the CRM (custom_niches table). Empty if there is no database or the table does not exist yet."""
    try:
        from agency.core import db  # imported here so reading the yaml never needs a database

        with db.connect() as conn:
            rows = conn.execute("SELECT key, label, sic_codes, search_terms, offer, status FROM custom_niches").fetchall()
    except Exception:
        return {}
    return {r["key"]: {"label": r["label"], "sic_codes": list(r["sic_codes"]), "search_terms": list(r["search_terms"]), "offer": r["offer"], "status": r["status"]} for r in rows}


def all_niches() -> dict[str, dict[str, Any]]:
    """config/niches.yaml niches plus the ones added in the CRM. The yaml wins if a key exists in both."""
    return {**custom_niches(), **(niches().get("niches") or {})}


STATUSES = ("active", "seeding", "audience", "parked")


def niche_status(table: dict[str, dict[str, Any]], key: str | None) -> str:
    """The same rule as crm/lib/nicheStatus.ts: a missing or unknown status, or an unknown key, is parked."""
    status = (table.get(key or "") or {}).get("status")
    return status if status in STATUSES else "parked"


def source_block(table: dict[str, dict[str, Any]], key: str | None) -> str | None:
    """Why lead search may not run for this niche, or None. Active niches only (docs/NICHE_FOCUS_PLAN.md, N2)."""
    status = niche_status(table, key)
    if status == "active":
        return None
    reason = {"seeding": "is seeding: LinkedIn content and a few connection notes only",
              "audience": "is an audience niche: content only"}.get(status, "is parked")
    return f"Niche '{key}' {reason}, so no lead searches. Only active niches are searched; change the status in config/niches.yaml."


# Off-niche check, the same rule as crm/lib/nicheRelevance.ts (both are tested against tests/fixtures/niche_relevance_cases.json).
# A name or category holding one of the niche's name_excludes words and none of its name_includes words is flagged, never hidden in the CRM.

def _words(s: str) -> list[str]:
    return [w for w in re.split(r"[^a-z0-9]+", (s or "").lower()) if w]


def relevance_rules(niche: dict[str, Any] | None) -> dict[str, list[str]]:
    """name_includes, name_excludes and name_excludes_always from a niche in config/niches.yaml; anything that is not a list means no rule."""
    def as_list(v: Any) -> list[str]:
        return [str(x).strip().lower() for x in v if _words(str(x))][:60] if isinstance(v, list) else []
    n = niche or {}
    return {"include": as_list(n.get("name_includes")), "exclude": as_list(n.get("name_excludes")), "always": as_list(n.get("name_excludes_always"))}


def has_keyword(text: str, keyword: str) -> bool:
    """Each keyword word must match the start of consecutive words in the text: "hair" matches "Hairdressing", not "Chair"."""
    t, k = _words(text), _words(keyword)
    if not k:
        return False
    return any(all(t[i + j].startswith(w) for j, w in enumerate(k)) for i in range(len(t) - len(k) + 1))


def _reason_from(name: str, categories: list[str], keywords: list[str]) -> str | None:
    in_name = next((k for k in keywords if has_keyword(name, k)), None)
    if in_name:
        return f'Looks off-niche: the name says "{in_name}"'
    cat = next((c for c in categories if any(has_keyword(c, k) for k in keywords)), None)
    return f'Looks off-niche: Google lists it as "{cat}"' if cat else None


def off_niche_reason(name: str, categories: list[str], rules: dict[str, list[str]]) -> str | None:
    """Why a result looks like another industry, or None. An "always" word flags it outright; otherwise any include word clears it."""
    always = _reason_from(name, categories, rules.get("always", []))
    if always:
        return always
    if not rules.get("exclude"):
        return None
    if any(has_keyword(t, k) for k in rules.get("include", []) for t in [name, *categories]):
        return None
    return _reason_from(name, categories, rules["exclude"])
