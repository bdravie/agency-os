"""Usage: uv run python -m agency.client_report demos/client-report/sample-data/harbour_metrics.csv --client "Harbour & Co Interiors"

Writes report.html and report.pdf into output/client-report/<client>/. Nothing is emailed: you send it.
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

from agency import config
from agency.client_report import metrics as m, render, summary
from agency.config import ROOT


def main() -> None:
    p = argparse.ArgumentParser(description="Build a weekly client report from an ad-metrics CSV.")
    p.add_argument("csv", type=Path)
    p.add_argument("--client", required=True, help="Client name shown on the report")
    p.add_argument("--out", type=Path, help="Output folder (default output/client-report/<client>)")
    p.add_argument("--no-llm", action="store_true", help="Use rule-based commentary: free and offline")
    p.add_argument("--fresh", action="store_true", help="Ignore the cached model reply")
    p.add_argument("--no-pdf", action="store_true")
    p.add_argument("--colour", default="#2f5bea", help="Brand colour as hex")
    args = p.parse_args()

    analysis = m.analyse(m.load_csv(args.csv))
    commentary = summary.fallback(analysis) if args.no_llm else summary.write(analysis, use_cache=not args.fresh)
    brand = render.Brand(config.get("BUSINESS_NAME", "Your Agency") or "Your Agency", args.colour)

    slug = re.sub(r"[^a-z0-9]+", "-", args.client.lower()).strip("-")
    out = args.out or ROOT / "output" / "client-report" / slug
    out.mkdir(parents=True, exist_ok=True)
    (out / "report.html").write_text(render.html_email(analysis, commentary, args.client, brand), encoding="utf-8")
    if not args.no_pdf:
        render.pdf(analysis, commentary, args.client, brand, out / "report.pdf")

    stray = summary.unverified_figures(" ".join([commentary.summary, *commentary.wins, *commentary.concerns, *commentary.actions]),
                                       m.facts_text(analysis))
    print(f"Commentary: {commentary.source}. Wrote {out}/report.html" + ("" if args.no_pdf else " and report.pdf"))
    if stray:
        print(f"WARNING: figures in the commentary not found in the numbers, check before sending: {', '.join(stray)}")


if __name__ == "__main__":
    main()
