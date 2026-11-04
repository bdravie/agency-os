"""Back up the whole database to a dated, encrypted file in BACKUP_DIR.

Usage: uv run python -m agency.backup [--dir PATH]
       uv run python -m agency.backup --new-key   (once: creates BACKUP_ENCRYPTION_KEY in .env, never shown)

Read-only against the database: one consistent snapshot, every table exported with PostgreSQL COPY
(exact round trip of every column type). Keeps the newest 14 backups plus the newest one from each of
the last 8 weeks, and deletes only files named agency-YYYYmmdd-HHMMSS.tar.gz[.enc] in the backup folder.

Files are encrypted before they reach the backup folder, so a cloud-synced copy is useless without the key. Plain data
only ever sits in a temporary folder on this computer. Older unencrypted .tar.gz files can still be restored.
"""

from __future__ import annotations

import argparse
import io
import json
import re
import sys
import tarfile
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import psycopg
from cryptography.fernet import Fernet, InvalidToken
from psycopg import IsolationLevel, sql

from agency import config
from agency.core import db

NAME_RE = re.compile(r"^agency-(\d{8})-(\d{6})\.tar\.gz(?:\.enc)?$")
KEEP_RECENT = 14
KEEP_WEEKS = 8


def fernet(key: str | None = None) -> Fernet:
    """The cipher for backups, or a clear message if the key is missing or damaged. Never echoes the key."""
    key = key or config.get("BACKUP_ENCRYPTION_KEY")
    if not key:
        sys.exit("BACKUP_ENCRYPTION_KEY is not set. Run: uv run python -m agency.backup --new-key")
    try:
        return Fernet(key.encode())
    except ValueError:
        sys.exit("BACKUP_ENCRYPTION_KEY is not a valid key. Restore it from your password manager.")


def add_key_to_env(env_file: Path) -> None:
    """Create a key and write it to .env without ever displaying it. Refuses to replace one: that would lock out older backups."""
    lines = env_file.read_text().splitlines() if env_file.exists() else []
    if any(re.fullmatch(r"\s*BACKUP_ENCRYPTION_KEY\s*=\s*\S+.*", line) for line in lines):
        sys.exit("BACKUP_ENCRYPTION_KEY already exists, so it was left alone: replacing it would make older backups unreadable.")
    entry = f"BACKUP_ENCRYPTION_KEY={Fernet.generate_key().decode()}"
    blank = [i for i, line in enumerate(lines) if re.fullmatch(r"\s*BACKUP_ENCRYPTION_KEY\s*=\s*", line)]
    if blank:
        lines[blank[0]] = entry
    else:
        lines.append(entry)
    env_file.write_text("\n".join(lines) + "\n")


def open_backup(path: Path, key: str | None = None) -> io.BytesIO:
    """A backup's .tar.gz contents, decrypted if needed, ready for tarfile. Reads the whole file: backups are small."""
    data = path.read_bytes()
    if path.name.endswith(".enc"):
        try:
            data = fernet(key).decrypt(data)
        except InvalidToken:
            sys.exit(f"{path.name} could not be decrypted: BACKUP_ENCRYPTION_KEY is not the key it was made with.")
    return io.BytesIO(data)


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
    cipher = fernet()  # before anything is written: no key, no backup
    dest.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc)
    final = dest / f"agency-{now:%Y%m%d-%H%M%S}.tar.gz.enc"
    partial = dest / f"{final.name}.partial"

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
        plain = Path(tmp) / "backup.tar.gz"
        with tarfile.open(plain, "w:gz") as tar:
            tar.add(Path(tmp) / "manifest.json", arcname="manifest.json")
            for t in order:
                tar.add(Path(tmp) / f"{t}.copy", arcname=f"{t}.copy")
        partial.write_bytes(cipher.encrypt(plain.read_bytes()))
    with tarfile.open(fileobj=io.BytesIO(cipher.decrypt(partial.read_bytes())), mode="r:gz") as check:
        if json.load(check.extractfile("manifest.json"))["rows"] != counts:  # prove it can be read back before trusting it
            sys.exit("The encrypted backup did not read back correctly, so it was not kept.")
    partial.rename(final)  # only a finished file ever has the real name

    for old in files_to_delete(list(dest.glob("agency-*.tar.gz*"))):
        old.unlink()

    with db.connect() as conn:
        db.log_activity(conn, "backup_completed", channel="backup", body=final.name,
                        meta={"bytes": final.stat().st_size, "rows": sum(counts.values()), "encrypted": True})
    print(f"Encrypted backup written: {final} ({final.stat().st_size / 1024:.0f} KB, {sum(counts.values())} rows in {len(order)} tables)")
    return final


def backup_folder(raw: str, platform: str = sys.platform) -> Path:
    """Check the backup folder before anything is written or recorded. A backup in the wrong place must fail
    loudly, because a recorded backup turns the Dashboard's warning off."""
    folder = Path(raw.strip()).expanduser()
    if raw.strip().startswith("BACKUP_DIR="):
        sys.exit("BACKUP_DIR in .env has its name typed twice. The line should read BACKUP_DIR=<folder>, once.")
    if not folder.is_absolute():
        sys.exit(f"The backup folder must be a full path (starting with / or ~), not: {raw}")
    if folder.resolve().is_relative_to(config.ROOT):
        sys.exit("The backup folder must be outside the project: backups hold real business data and must never reach git.")
    if folder.parts[:3] == ("/", "Library", "Mobile Documents"):
        sys.exit("BACKUP_DIR is missing the ~ at the start. iCloud Drive is in your home folder: ~/Library/Mobile Documents/...")
    if "Library" in folder.parts and platform != "darwin":
        sys.exit("BACKUP_DIR is a Mac folder, and this is not the Mac (probably the dev container). Run this in the Mac's Terminal app.")
    return folder


def main() -> None:
    p = argparse.ArgumentParser(description="Back up the database to BACKUP_DIR.")
    p.add_argument("--dir", type=Path, help="Backup folder (default: BACKUP_DIR from .env)")
    p.add_argument("--new-key", action="store_true", help="Create BACKUP_ENCRYPTION_KEY in .env (never shown), then stop")
    a = p.parse_args()
    if a.new_key:
        add_key_to_env(config.ROOT / ".env")
        print("Key added to .env as BACKUP_ENCRYPTION_KEY. Copy it into your password manager now: backups can't be restored without it.")
        return
    fernet()  # say so now if the key is missing, before touching the folder
    folder = backup_folder(str(a.dir) if a.dir else config.require("BACKUP_DIR"))
    try:
        folder.mkdir(parents=True, exist_ok=True)
    except OSError as err:
        sys.exit(f"Could not use the backup folder {folder}: {err.strerror}. Check BACKUP_DIR in .env.")
    run(folder)


if __name__ == "__main__":
    main()
