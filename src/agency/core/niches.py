"""Loaders for config/niches.yaml and config/offers.yaml. Never hard-code niches or prices."""

from __future__ import annotations

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
