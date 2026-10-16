"""Restore a backup into a SCRATCH database and compare row counts. Never touches the live database.

Usage: uv run python -m agency.restore /path/to/agency-YYYYmmdd-HHMMSS.tar.gz

Needs SCRATCH_DATABASE_URL in .env: a second, empty database (see docs/backup.md). Refuses to run if it
points at the live database or if the scratch database already holds data.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tarfile
from pathlib import Path

import psycopg
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict

from agency import config
from agency.config import ROOT


def _where(url: str) -> tuple[str, str]:
    d = conninfo_to_dict(url)
    return (d.get("host", ""), d.get("dbname", ""))


def guard(live_url: str, scratch_url: str) -> None:
    if _where(live_url) == _where(scratch_url):
        sys.exit("Refusing: SCRATCH_DATABASE_URL points at the live database.")


def set_triggers(conn: psycopg.Connection, tables: list[str], enabled: bool) -> None:
    """Switch user triggers (not constraints) off while loading a backup, and on again after.

    Triggers such as the stage-history recorder and the lost-reason rule would otherwise fire for every restored row and
    collide with the backup's own rows. The backup already contains exactly what those triggers produced.
    """
    word = "ENABLE" if enabled else "DISABLE"
    for t in tables:
        conn.execute(sql.SQL("ALTER TABLE {} " + word + " TRIGGER USER").format(sql.Identifier(t)))


def scratch_has_data(conn: psycopg.Connection) -> bool:
    tables = [r[0] for r in conn.execute(
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name <> 'schema_migrations'")]
    return any(conn.execute(sql.SQL("SELECT EXISTS (SELECT 1 FROM {})").format(sql.Identifier(t))).fetchone()[0] for t in tables)


def main() -> None:
    p = argparse.ArgumentParser(description="Restore a backup into the scratch database and verify counts.")
    p.add_argument("backup", type=Path)
    a = p.parse_args()

    live, scratch = config.require("DATABASE_URL"), config.require("SCRATCH_DATABASE_URL")
    guard(live, scratch)

    with psycopg.connect(scratch) as conn:
        if scratch_has_data(conn):
            sys.exit("Refusing: the scratch database already has data. In the Neon console, delete and recreate the scratch database, then retry.")

    dbmate = ROOT / "node_modules" / ".bin" / "dbmate"
    if not dbmate.exists():
        sys.exit("dbmate not found: run `npm install` in the project root first.")
    subprocess.run([str(dbmate), "--migrations-dir", str(ROOT / "db" / "migrations"), "--no-dump-schema", "up"],
                   check=True, env={**os.environ, "DATABASE_URL": scratch}, stdout=subprocess.DEVNULL)

    with tarfile.open(a.backup, "r:gz") as tar, psycopg.connect(scratch) as conn:
        manifest = json.load(tar.extractfile("manifest.json"))
        set_triggers(conn, manifest["order"], enabled=False)
        for t in manifest["order"]:
            ident = sql.Identifier(t)
            with conn.cursor().copy(sql.SQL("COPY {} FROM STDIN").format(ident)) as copy:
                src = tar.extractfile(f"{t}.copy")
                while chunk := src.read(1 << 20):
                    copy.write(chunk)
            has_id = conn.execute("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=%s AND column_name='id'", (t,)).fetchone()
            if has_id and conn.execute("SELECT pg_get_serial_sequence(%s, 'id')", (f"public.{t}",)).fetchone()[0]:
                conn.execute(sql.SQL("SELECT setval(pg_get_serial_sequence(%s, 'id'), COALESCE(max(id), 1), max(id) IS NOT NULL) FROM {}").format(ident), (f"public.{t}",))
        set_triggers(conn, manifest["order"], enabled=True)
        conn.commit()

        bad = 0
        print(f"{'table':<20}{'backup':>8}{'restored':>10}")
        for t in manifest["order"]:
            n = conn.execute(sql.SQL("SELECT count(*) FROM {}").format(sql.Identifier(t))).fetchone()[0]
            flag = "" if n == manifest["rows"][t] else "  <-- MISMATCH"
            bad += bool(flag)
            print(f"{t:<20}{manifest['rows'][t]:>8}{n:>10}{flag}")
    print("\nAll row counts match." if not bad else f"\n{bad} table(s) do not match.")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
