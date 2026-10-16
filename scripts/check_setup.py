"""Confirms the Anthropic API key works and the database is reachable and migrated.

Run: uv run python scripts/check_setup.py
"""

from __future__ import annotations

import sys

REQUIRED_TABLES = {
    "companies", "contacts", "deals", "tasks", "activities", "offers",
    "quotes", "client_services", "proposals", "content_items", "suppression",
}


def check_api() -> tuple[bool, str]:
    try:
        from agency import llm

        reply = llm.ask("Reply with the single word OK.", model="haiku", max_tokens=5)
        return True, f"Haiku replied: {reply!r}"
    except Exception as exc:  # noqa: BLE001 - report any failure plainly
        return False, f"{type(exc).__name__}: {exc}"


def check_db() -> tuple[bool, str]:
    try:
        import psycopg

        from agency import config

        url = config.require("DATABASE_URL")
        with psycopg.connect(url, connect_timeout=5) as conn:
            rows = conn.execute(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
            ).fetchall()
        found = {r[0] for r in rows}
        missing = REQUIRED_TABLES - found
        if missing:
            return False, f"reachable but not migrated; missing: {', '.join(sorted(missing))}"
        return True, f"reachable, {len(REQUIRED_TABLES)} tables present"
    except Exception as exc:  # noqa: BLE001
        return False, f"{type(exc).__name__}: {exc}"


def main() -> int:
    ok = True
    for name, fn in (("API", check_api), ("Database", check_db)):
        passed, detail = fn()
        ok &= passed
        print(f"{'OK  ' if passed else 'FAIL'} {name}: {detail}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
