"""Words for the posts: Haiku writes them from one listing (cached); code checks them and adds the link and hashtags."""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from datetime import datetime

from agency import llm
from agency.config import ROOT

CACHE = ROOT / ".cache" / "event-social"
SECTIONS = ["FACEBOOK", "INSTAGRAM", "HASHTAGS"]
FACEBOOK_MAX, INSTAGRAM_MAX = 400, 180
LINKISH = re.compile(r"https?://|www\.|\b[\w-]+\.(?:com|co\.uk|org|net|uk|io)\b|@\w|\b0\d{9,10}\b", re.IGNORECASE)


@dataclass
class Posts:
    facebook_text: str
    instagram_text: str
    hashtags: list[str]
    source: str = "model"


def when(start: str) -> str:
    """Brilliant Directories dates are YYYYMMDDHHmmss. Returns e.g. 'Saturday 17 April 2027, 7:30am'."""
    d = datetime.strptime(start[:14], "%Y%m%d%H%M%S")
    hour = d.hour % 12 or 12
    clock = f"{hour}{'' if d.minute == 0 else f':{d.minute:02d}'}{'am' if d.hour < 12 else 'pm'}"
    return f"{d.strftime('%A')} {d.day} {d.strftime('%B %Y')}, {clock}"


def card_date(start: str) -> str:
    d = datetime.strptime(start[:14], "%Y%m%d%H%M%S")
    return f"{d.strftime('%a')} {d.day} {d.strftime('%b %Y')}"


def facts(listing: dict) -> str:
    return (f"DIRECTORY: motorcycle events (context for tone and hashtags only, do not repeat it)\nEVENT: {listing['post_title']}\nWHEN: {when(listing['post_start_date'])}\n"
            f"WHERE: {listing['post_location']}\nDESCRIPTION: {listing['post_content']}")


def parse(reply: str) -> Posts:
    """Parse the FACEBOOK/INSTAGRAM/HASHTAGS format. Raises ValueError if a section is missing."""
    parts: dict[str, list[str]] = {}
    current = None
    for line in reply.splitlines():
        head = re.match(r"^\W*(FACEBOOK|INSTAGRAM|HASHTAGS)\W*:?\s*(.*)$", line.strip())
        if head:
            current = head.group(1)
            parts[current] = [head.group(2)] if head.group(2) else []
        elif current and line.strip():
            parts[current].append(line.strip())
    missing = [s for s in SECTIONS if not parts.get(s)]
    if missing:
        raise ValueError(f"Reply missing sections: {', '.join(missing)}")
    tags = list(dict.fromkeys(re.findall(r"#[A-Za-z][A-Za-z0-9]{1,29}", " ".join(parts["HASHTAGS"]))))[:5]
    return Posts(" ".join(parts["FACEBOOK"]), " ".join(parts["INSTAGRAM"]), tags)


def problems(p: Posts, listing: dict) -> list[str]:
    """What stops a model reply being used. The same idea as client-report: code checks what the AI wrote."""
    out = []
    known = facts(listing)
    for name, text, limit in (("Facebook", p.facebook_text, FACEBOOK_MAX), ("Instagram", p.instagram_text, INSTAGRAM_MAX)):
        if len(text) > limit:
            out.append(f"{name} text is over {limit} characters")
        if LINKISH.search(text):
            out.append(f"{name} text contains a link, handle or contact detail (code adds the link)")
        if "#" in text:
            out.append(f"{name} text contains a hashtag (they are listed separately)")
        stray = [n for n in re.findall(r"\d+(?:[.:]\d+)?", text) if n not in known]
        if stray:
            out.append(f"{name} text has a figure that is not in the listing: {', '.join(stray)}")
    if len(p.hashtags) < 3:
        out.append("fewer than 3 usable hashtags")
    return out


def fallback(listing: dict) -> Posts:
    """Rule-based wording, used with --no-llm: free, offline and the same every time."""
    title, place, day = listing["post_title"], listing["post_location"], when(listing["post_start_date"])
    first = re.split(r"(?<=[.!?])\s", listing["post_content"].strip())[0]
    area = re.sub(r"[^A-Za-z]", "", place.split(",")[-1]) or "UK"
    return Posts(f"{title} is now listed: {day} at {place}. {first}", f"{title}, {day}. {place}."[:INSTAGRAM_MAX],
                 ["#motorcycleevents", "#bikelife", f"#{area}"], source="rules")


def assemble(p: Posts, listing: dict) -> dict:
    """The link and hashtags are put on by code, never by the model, so the link is always the listing's own."""
    link, tags = listing["post_url"], " ".join(p.hashtags)
    return {
        "facebook_post": f"{p.facebook_text}\n\nFull details: {link}\n\n{tags}",
        "instagram_caption": f"{p.instagram_text}\n\nDetails: {link}\n\n{tags}",
        "hashtags": tags,
        "written_by": "Claude Haiku" if p.source == "model" else "rules (no AI)",
    }


def write(listing: dict, use_llm: bool = True, use_cache: bool = True) -> dict:
    if not use_llm:
        return assemble(fallback(listing), listing)
    prompt = f"{(ROOT / 'prompts' / 'event-social-post.md').read_text()}\n\nLISTING:\n{facts(listing)}"
    key = CACHE / (hashlib.sha256(prompt.encode()).hexdigest()[:16] + ".txt")
    if use_cache and key.exists():
        try:
            cached = parse(key.read_text())
            if not problems(cached, listing):
                return assemble(cached, listing)
        except ValueError:
            pass  # stale or broken cache entry: ask again
    found: list[str] = []
    for attempt in (1, 2):
        ask = prompt if not found else f"{prompt}\n\nYour last reply was refused: {'; '.join(found)}. Write it again."
        reply = llm.ask(ask, model="haiku", max_tokens=1200)  # headroom: reasoning counts towards the limit
        try:
            p = parse(reply)
            found = problems(p, listing)
        except ValueError as err:
            found = [str(err)]
        if not found:
            CACHE.mkdir(parents=True, exist_ok=True)
            key.write_text(reply)  # only replies that pass the checks are cached
            return assemble(p, listing)
    raise ValueError(f"The AI's post was refused twice: {'; '.join(found)}")
