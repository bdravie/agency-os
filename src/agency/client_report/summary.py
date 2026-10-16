"""Commentary for the report: Sonnet writes it from finished numbers (cached), or a rule-based fallback."""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field

from agency import llm
from agency.config import ROOT
from agency.client_report import metrics as m

CACHE = ROOT / ".cache" / "client-report"
SECTIONS = ["SUMMARY", "WINS", "CONCERNS", "ACTIONS"]


@dataclass
class Commentary:
    summary: str
    wins: list[str] = field(default_factory=list)
    concerns: list[str] = field(default_factory=list)
    actions: list[str] = field(default_factory=list)
    source: str = "model"


def parse(reply: str) -> Commentary:
    """Parse the SUMMARY/WINS/CONCERNS/ACTIONS format. Raises ValueError if a section is missing."""
    parts: dict[str, list[str]] = {}
    current = None
    for line in reply.splitlines():
        head = re.match(r"^\W*(SUMMARY|WINS|CONCERNS|ACTIONS)\W*:?\s*$", line.strip(), flags=re.I)
        if head:
            current = head.group(1).upper()
            parts[current] = []
        elif current and line.strip():
            parts[current].append(line.strip())
    missing = [s for s in SECTIONS if not parts.get(s)]
    if missing:
        raise ValueError(f"Reply missing sections: {', '.join(missing)}")
    bullets = lambda lines: [re.sub(r"^[-*•]\s*", "", l) for l in lines if re.match(r"^[-*•]", l)]
    return Commentary(" ".join(parts["SUMMARY"]), bullets(parts["WINS"]), bullets(parts["CONCERNS"]), bullets(parts["ACTIONS"]))


def unverified_figures(text: str, facts: str) -> list[str]:
    """Figures in the commentary that do not appear in the finished numbers (a guard against invented maths)."""
    found = re.findall(r"£\d{1,3}(?:,\d{3})*(?:\.\d+)?|[+-]?\d+(?:\.\d+)?(?:%|x)", text)
    return sorted({f for f in found if f not in facts and f.lstrip("+") not in facts})


def fallback(a: dict) -> Commentary:
    """Rule-based commentary, used with --no-llm: free, offline and deterministic."""
    t = a["totals"]
    good, bad = [], []
    for ch, b in a["channels"].items():
        for met in m.METRICS:
            d = b[met.key]
            verdict = m.is_good(met, d["change"])
            if verdict is None:
                continue
            line = f"{ch}: {met.label} {m.fmt(d['cur'], met.kind)} ({m.fmt_change(d['change'])} on last week)"
            (good if verdict else bad).append((abs(d["change"]), line))
    good = [l for _, l in sorted(good, reverse=True)][:3]
    bad = [l for _, l in sorted(bad, reverse=True)][:2]
    return Commentary(
        f"Spend was {m.fmt(t['spend_gbp']['cur'], 'gbp')} and revenue {m.fmt(t['revenue_gbp']['cur'], 'gbp')} "
        f"(ROAS {m.fmt(t['roas']['cur'], 'ratio')}, {m.fmt_change(t['roas']['change'])} on last week).",
        good, bad,
        ["Review the weakest channel's targeting and creative.", "Shift budget towards the channel with the best ROAS if the trend holds.",
         "Check tracking is firing correctly on all conversion events."],
        source="rules",
    )


def write(a: dict, use_cache: bool = True) -> Commentary:
    facts = m.facts_text(a)
    prompt = f"{(ROOT / 'prompts' / 'client-report.md').read_text()}\n\nNUMBERS:\n{facts}"
    key = CACHE / (hashlib.sha256(prompt.encode()).hexdigest()[:16] + ".txt")
    if use_cache and key.exists():
        try:
            return parse(key.read_text())
        except ValueError:
            pass  # stale or broken cache entry: ask again
    for attempt in (1, 2):
        reply = llm.ask(prompt, model="sonnet", max_tokens=3000)  # headroom: reasoning counts towards the limit
        try:
            c = parse(reply)
        except ValueError:
            if attempt == 2:
                raise
            continue
        CACHE.mkdir(parents=True, exist_ok=True)
        key.write_text(reply)  # only well-formed replies are cached
        return c
    raise RuntimeError("unreachable")
