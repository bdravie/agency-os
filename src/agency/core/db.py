"""Database access for every Python tool. Parameterised queries only."""

from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Iterator

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from agency import config


@contextmanager
def connect() -> Iterator[psycopg.Connection]:
    """Open a connection that commits on success and rolls back on error."""
    with psycopg.connect(config.require("DATABASE_URL"), row_factory=dict_row) as conn:
        yield conn


def log_activity(
    conn: psycopg.Connection,
    type: str,
    *,
    company_id: int | None = None,
    contact_id: int | None = None,
    deal_id: int | None = None,
    channel: str | None = None,
    body: str | None = None,
    meta: dict[str, Any] | None = None,
) -> int:
    """The one function every tool uses to record tracking events."""
    row = conn.execute(
        """INSERT INTO activities (company_id, contact_id, deal_id, type, channel, body, meta)
           VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id""",
        (company_id, contact_id, deal_id, type, channel, body, Jsonb(meta or {})),
    ).fetchone()
    return row["id"]
