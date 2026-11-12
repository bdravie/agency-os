"""Local stand-ins kept as JSON files in output/event-social/: the sheet tabs (Queue, Posted log, Failures),
the directory's publish switches and the mock test Page. In the real build these are Google Sheets and Meta."""

from __future__ import annotations

import json
import threading
from datetime import datetime
from pathlib import Path

from agency.config import ROOT

DEMO = ROOT / "demos" / "event-listing-to-social-post-queue"
OUT = ROOT / "output" / "event-social"
DRIVE = OUT / "drive"
_lock = threading.Lock()
EMPTY = {"queue": [], "posted": [], "failures": [], "page_posts": [], "went_live": []}


def _path() -> Path:
    return OUT / "state.json"


def now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def load() -> dict:
    if not _path().exists():
        return json.loads(json.dumps(EMPTY))
    return {**json.loads(json.dumps(EMPTY)), **json.loads(_path().read_text())}


def change(fn):
    """Read, change and save under one lock, so two workflow runs cannot interleave."""
    with _lock:
        state = load()
        result = fn(state)
        OUT.mkdir(parents=True, exist_ok=True)
        _path().write_text(json.dumps(state, indent=2))
        return result


def reset() -> None:
    DRIVE.mkdir(parents=True, exist_ok=True)
    for f in DRIVE.glob("*.jpg"):
        f.unlink()
    change(lambda s: (s.clear(), s.update(json.loads(json.dumps(EMPTY)))))


def listings() -> list[dict]:
    """The sample listings, with any 'went live' switch from the board applied (post_status 1 = published)."""
    rows = json.loads((DEMO / "sample-data" / "listings.json").read_text())["listings"]
    live = set(load()["went_live"])
    return [{**r, "post_status": 1 if r["post_id"] in live else r["post_status"]} for r in rows]
