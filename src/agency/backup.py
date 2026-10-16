"""Back up the whole database to a dated .tar.gz in BACKUP_DIR.

Usage: uv run python -m agency.backup [--dir PATH]

Read-only against the database: one consistent snapshot, every table exported with PostgreSQL COPY
(exact round trip of every column type). Keeps the newest 14 backups plus the newest one from each of
the last 8 weeks, and deletes only files named agency-YYYYmmdd-HHMMSS.tar.gz in the backup folder.
"""

from __future__ import annotations

import argparse
import json
import re
import tarfile
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import psycopg
from psycopg import IsolationLevel, sql

from agency import config
from agency.core import db

NAME_RE = re.compile(r"^agency-(\d{8})-(\d{6})\.tar\.gz$")
KEEP_RECENT = 14
KEEP_WEEKS = 8


def tables_in_dependency_order(conn: psycopg.Connection) -> list[str]:
    """Public tables, parents before children (so foreign keys load cleanly on restore)."""
    names = [r["table_name"] for r in conn.execute(
        """SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> 'schema_migrations'""")]
    deps: dict[str, set[str]] = {n: set() for n in names}
    for r in conn.execute(
        """SELECT cl.relname AS child, pl.relname AS parent FROM pg_constraint c
             JOIN pg_class cl ON cl.oid = c.conrelid JOIN pg_class pl ON pl.oid = c.confrelid
            WHERE c.contype = 'f' AND cl.relnamespace = 'public'::regnamespace"""):
        if r["child"] != r["parent"] and r["child"] in deps and r["parent"] in deps:
            deps[r["child"]].add(r["parent"])
    order: list[str] = []
    while deps:
        ready = sorted(n for n, d in deps.items() if d <= set(order))
        if not ready:
            raise RuntimeError(f"Circular foreign keys between: {sorted(deps)}")
        order += ready
        for n in ready:
            del deps[n]
    return order


def stamp(path: Path) -> datetime | None:
    m = NAME_RE.match(path.name)
    return datetime.strptime(m.group(1) + m.group(2), "%Y%m%d%H%M%S") if m else None


def files_to_delete(files: list[Path]) -> list[Path]:
    """Keep the newest KEEP_RECENT files and the newest file of each of the last KEEP_WEEKS ISO weeks."""
    dated = sorted(((stamp(f), f) for f in files if stamp(f)), reverse=True)
    keep = {f for _, f in dated[:KEEP_RECENT]}
    seen_weeks: list[tuple[int, int]] = []
    for ts, f in dated:
        week = ts.isocalendar()[:2]
        if week not in seen_weeks:
            seen_weeks.append(week)
            if len(seen_weeks) <= KEEP_WEEKS:
                keep.add(f)
    return [f for _, f in dated if f not in keep]


def run(dest: Path) -> Path:
    dest.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc)
    final = dest / f"agency-{now:%Y%m%d-%H%M%S}.tar.gz"
    partial = final.with_suffix(".partial")

    with tempfile.TemporaryDirectory() as tmp, psycopg.connect(config.require("DATABASE_URL"), row_factory=psycopg.rows.dict_row) as conn:
        conn.isolation_level = IsolationLevel.REPEATABLE_READ  # one consistent snapshot of every table
        conn.read_only = True
        order = tables_in_dependency_order(conn)
        counts: dict[str, int] = {}
        for t in order:
            ident = sql.Identifier(t)
            counts[t] = conn.execute(sql.SQL("SELECT count(*) AS n FROM {}").format(ident)).fetchone()["n"]
            with open(Path(tmp) / f"{t}.copy", "wb") as f, conn.cursor().copy(sql.SQL("COPY {} TO STDOUT").format(ident)) as copy:
                for chunk in copy:
                    f.write(bytes(chunk))
        versions = [r["version"] for r in conn.execute("SELECT version FROM schema_migrations ORDER BY version")]
        manifest = {"format": 1, "created_at": now.isoformat(), "order": order, "rows": counts, "migrations": versions}
        (Path(tmp) / "manifest.json").write_text(json.dumps(manifest, indent=2))
        with tarfile.open(partial, "w:gz") as tar:
            tar.add(Path(tmp) / "manifest.json", arcname="manifest.json")
            for t in order:
                tar.add(Path(tmp) / f"{t}.copy", arcname=f"{t}.copy")
    partial.rename(final)  # only a finished file ever has the real name

    for old in files_to_delete(list(dest.glob("agency-*.tar.gz"))):
        old.unlink()

    with db.connect() as conn:
        db.log_activity(conn, "backup_completed", channel="backup", body=final.name,
                        meta={"bytes": final.stat().st_size, "rows": sum(counts.values())})
    print(f"Backup written: {final} ({final.stat().st_size / 1024:.0f} KB, {sum(counts.values())} rows in {len(order)} tables)")
    return final


def main() -> None:
    p = argparse.ArgumentParser(description="Back up the database to BACKUP_DIR.")
    p.add_argument("--dir", type=Path, help="Backup folder (default: BACKUP_DIR from .env)")
    a = p.parse_args()
    folder = a.dir or (Path(config.require("BACKUP_DIR")).expanduser())
    run(folder)


if __name__ == "__main__":
    main()
