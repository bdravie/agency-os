"""Load ad metrics from CSV and compute week-on-week changes. No model involved."""

from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path

REQUIRED = ["week_start", "channel", "spend_gbp", "impressions", "clicks", "conversions", "revenue_gbp"]
RAW = ["spend_gbp", "impressions", "clicks", "conversions", "revenue_gbp"]


@dataclass(frozen=True)
class Metric:
    key: str
    label: str
    kind: str          # gbp | int | pct | ratio
    higher_is_better: bool


METRICS = [
    Metric("spend_gbp", "Spend", "gbp", False),
    Metric("revenue_gbp", "Revenue", "gbp", True),
    Metric("roas", "ROAS", "ratio", True),
    Metric("conversions", "Conversions", "int", True),
    Metric("cpa", "Cost per conversion", "gbp2", False),
    Metric("clicks", "Clicks", "int", True),
    Metric("ctr", "Click-through rate", "pct", True),
    Metric("cvr", "Conversion rate", "pct", True),
]


def _div(a: float, b: float) -> float | None:
    return a / b if b else None


def derive(raw: dict[str, float]) -> dict[str, float | None]:
    """Add ratios to a dict of summed raw numbers."""
    out: dict[str, float | None] = dict(raw)
    out["ctr"] = _div(raw["clicks"], raw["impressions"])
    out["cvr"] = _div(raw["conversions"], raw["clicks"])
    out["cpa"] = _div(raw["spend_gbp"], raw["conversions"])
    out["roas"] = _div(raw["revenue_gbp"], raw["spend_gbp"])
    return out


def pct_change(cur: float | None, prev: float | None) -> float | None:
    if cur is None or prev is None or prev == 0:
        return None
    return (cur - prev) / prev


def load_csv(path: str | Path) -> list[dict]:
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        missing = [c for c in REQUIRED if c not in (reader.fieldnames or [])]
        if missing:
            raise ValueError(f"CSV is missing columns: {', '.join(missing)}")
        rows = []
        for n, r in enumerate(reader, start=2):
            try:
                rows.append({"week_start": r["week_start"].strip(), "channel": r["channel"].strip(),
                             **{k: float(r[k]) for k in RAW}})
            except (ValueError, TypeError) as err:
                raise ValueError(f"Bad number on CSV line {n}: {err}") from err
    if not rows:
        raise ValueError("CSV has no data rows")
    return rows


def _sum(rows: list[dict]) -> dict[str, float | None]:
    return derive({k: sum(r[k] for r in rows) for k in RAW})


def analyse(rows: list[dict]) -> dict:
    """Return the latest week vs the week before, overall and per channel, plus the weekly trend."""
    weeks = sorted({r["week_start"] for r in rows})
    if len(weeks) < 2:
        raise ValueError("Need at least two weeks of data for week-on-week changes")
    cur_w, prev_w = weeks[-1], weeks[-2]

    def block(subset_cur: list[dict], subset_prev: list[dict]) -> dict:
        cur, prev = _sum(subset_cur), _sum(subset_prev)
        return {m.key: {"cur": cur[m.key], "prev": prev[m.key], "change": pct_change(cur[m.key], prev[m.key])}
                for m in METRICS}

    channels = sorted({r["channel"] for r in rows})
    by = lambda w, ch=None: [r for r in rows if r["week_start"] == w and (ch is None or r["channel"] == ch)]
    return {
        "week": cur_w, "prev_week": prev_w, "weeks": len(weeks),
        "totals": block(by(cur_w), by(prev_w)),
        "channels": {ch: block(by(cur_w, ch), by(prev_w, ch)) for ch in channels},
        "trend": [{"week": w, **{k: _sum(by(w))[k] for k in ("spend_gbp", "revenue_gbp", "conversions", "roas")}} for w in weeks],
    }


def fmt(value: float | None, kind: str) -> str:
    if value is None:
        return "n/a"
    return {
        "gbp": f"£{value:,.0f}", "gbp2": f"£{value:,.2f}", "int": f"{value:,.0f}",
        "pct": f"{value * 100:.2f}%", "ratio": f"{value:.2f}x",
    }[kind]


def fmt_change(change: float | None) -> str:
    return "n/a" if change is None else f"{change * 100:+.1f}%"


def is_good(metric: Metric, change: float | None) -> bool | None:
    """True if the change is an improvement, False if worse, None if flat/unknown (under 1%)."""
    if change is None or abs(change) < 0.01:
        return None
    return (change > 0) == metric.higher_is_better


def facts_text(a: dict) -> str:
    """Plain-text table of finished numbers: the only source the model may quote."""
    lines = [f"Week starting {a['week']} compared with week starting {a['prev_week']}."]
    def block(title: str, b: dict) -> None:
        lines.append(f"\n{title}")
        for m in METRICS:
            d = b[m.key]
            lines.append(f"- {m.label}: {fmt(d['cur'], m.kind)} (previous {fmt(d['prev'], m.kind)}, change {fmt_change(d['change'])})")
    block("ALL CHANNELS", a["totals"])
    for ch, b in a["channels"].items():
        block(ch.upper(), b)
    lines.append("\nWEEKLY TREND (spend, revenue, ROAS)")
    for t in a["trend"]:
        lines.append(f"- {t['week']}: {fmt(t['spend_gbp'], 'gbp')}, {fmt(t['revenue_gbp'], 'gbp')}, {fmt(t['roas'], 'ratio')}")
    return "\n".join(lines)
