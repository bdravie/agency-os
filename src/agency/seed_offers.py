"""Seed the offers table from config/offers.yaml. Insert-only: an offer that already exists is never overwritten,
so prices and checklists you have edited in the CRM are safe.

Usage: uv run python -m agency.seed_offers [--dry-run]
"""

from __future__ import annotations

import argparse
import json
from typing import Any

from agency.core import db
from agency.core.niches import offers

BILLING = {"one_off", "setup", "monthly"}


def validate(o: dict[str, Any]) -> list[str]:
    """Return a list of problems with one offer from the yaml (empty list = fine)."""
    problems: list[str] = []
    if not o.get("name"):
        return ["missing name"]
    b = o.get("billing")
    if b is not None and b not in BILLING:
        problems.append(f"billing must be one of {sorted(BILLING)}")
    lo, hi = o.get("price_min_gbp"), o.get("price_max_gbp")
    if (lo is None) != (hi is None):
        problems.append("set both price_min_gbp and price_max_gbp, or neither")
    if lo is not None and hi is not None:
        if lo > hi:
            problems.append("price_min_gbp is above price_max_gbp")
        default = o.get("monthly_price_gbp") if b == "monthly" else o.get("setup_price_gbp")
        if default is not None and not (lo <= default <= hi):
            problems.append(f"default price {default} is outside {lo}-{hi}")
    if b and not o.get("deliverables"):
        problems.append("a core offer needs a deliverables checklist")
    if o.get("default_duration_days") is not None and o["default_duration_days"] <= 0:
        problems.append("default_duration_days must be positive")
    return problems


def main() -> None:
    p = argparse.ArgumentParser(description="Seed offers from config/offers.yaml (insert-only).")
    p.add_argument("--dry-run", action="store_true")
    a = p.parse_args()
    items = offers()
    bad = {o.get("name", "?"): validate(o) for o in items if validate(o)}
    if bad:
        raise SystemExit("Fix config/offers.yaml first:\n" + "\n".join(f"  {n}: {', '.join(v)}" for n, v in bad.items()))
    if a.dry_run:
        print(f"{len(items)} offers in the yaml, all valid. Nothing written.")
        return
    added = 0
    with db.connect() as conn:
        for o in items:
            row = conn.execute(
                """INSERT INTO offers (name, niche, outcome, setup_price_gbp, monthly_price_gbp, loom_url, demo_path, billing,
                                       price_min_gbp, price_max_gbp, default_duration_days, deliverables, sort_order)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s) ON CONFLICT (name) DO NOTHING RETURNING id""",
                (o["name"], o.get("niche"), o.get("outcome"), o.get("setup_price_gbp", 0), o.get("monthly_price_gbp", 0),
                 o.get("loom_url") or None, o.get("demo_path") or None, o.get("billing"), o.get("price_min_gbp"), o.get("price_max_gbp"),
                 o.get("default_duration_days"), json.dumps(o.get("deliverables") or []), o.get("sort_order", 100)),
            ).fetchone()
            added += bool(row)
    print(f"Seeded {added} new offer(s); {len(items) - added} already existed and were left alone.")


if __name__ == "__main__":
    main()
