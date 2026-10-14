"""Draft an Upwork proposal from a job post and save it to the proposals table.

Usage: uv run python -m agency.proposal job.txt [--url URL] [--title TITLE]
       echo "job text" | uv run python -m agency.proposal -
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

from agency import config, llm
from agency.config import ROOT
from agency.core import db
from agency.core.niches import offers as load_offers

MAX_WORDS = 145
NO_PORTFOLIO = "(No portfolio items yet. Do NOT mention any past project or Loom link.)"


def read_portfolio() -> str:
    """Return the portfolio text with HTML comments (templates) removed."""
    text = (ROOT / "portfolio" / "portfolio.md").read_text()
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    body = text.split("\n", 1)[-1].strip() if text.strip() else ""
    has_entries = any(line.startswith("## ") for line in body.splitlines())
    return body if has_entries else NO_PORTFOLIO


def parse_fit(reply: str) -> tuple[int, str]:
    """Parse '7|reason' into (7, 'reason'). Falls back to 1 if the model strays."""
    match = re.match(r"\s*(\d{1,2})\s*\|\s*(.+)", reply, flags=re.S)
    if not match:
        return 1, f"Could not parse score: {reply[:80]}"
    return max(1, min(10, int(match.group(1)))), match.group(2).strip()


def score_fit(job_text: str) -> tuple[int, str]:
    prompt = (ROOT / "prompts" / "proposal-fit.md").read_text()
    reply = llm.ask(f"{prompt}\n\nJOB POST:\n{job_text}", model="haiku", max_tokens=100)
    return parse_fit(reply)


def draft(job_text: str) -> str:
    style = (ROOT / "prompts" / "proposal.md").read_text()
    offer_lines = "\n".join(
        f"- {o['name']}: {o.get('outcome', '')}" for o in load_offers()
    )
    prompt = (
        f"{style}\n\nMY PORTFOLIO (the only projects you may mention):\n{read_portfolio()}\n\n"
        f"MY OFFERS:\n{offer_lines}\n\nJOB POST:\n{job_text}\n\n"
        "Write the proposal only, under 150 words. Never invent a project, client or result. "
        "If there is no portfolio item, simply leave out the Loom line; do not mention that "
        "you have no portfolio."
    )
    text = llm.ask(prompt, model="sonnet", max_tokens=600)
    if len(text.split()) > MAX_WORDS:
        text = llm.ask(
            f"Shorten this to under {MAX_WORDS} words, keeping the problem, approach, "
            f"timeline and final question. Return only the proposal.\n\n{text}",
            model="sonnet", max_tokens=600,
        )
    sender = config.get("SENDER_NAME")
    return text.replace("[Your name]", sender) if sender else text


def save(job_text: str, text: str, score: int, title: str | None, url: str | None) -> int:
    with db.connect() as conn:
        row = conn.execute(
            """INSERT INTO proposals (job_title, job_url, job_text, draft, fit_score, status)
               VALUES (%s, %s, %s, %s, %s, 'Draft') RETURNING id""",
            (title, url, job_text, text, score),
        ).fetchone()
        db.log_activity(conn, "proposal_drafted", channel="upwork",
                        body=title, meta={"proposal_id": row["id"], "fit_score": score})
        return row["id"]


def main() -> None:
    parser = argparse.ArgumentParser(description="Draft an Upwork proposal.")
    parser.add_argument("job", help="Path to a .txt file with the job post, or - for stdin")
    parser.add_argument("--url")
    parser.add_argument("--title")
    parser.add_argument("--force", action="store_true", help="Draft even if fit score is below 6")
    parser.add_argument("--no-save", action="store_true")
    args = parser.parse_args()

    job_text = (sys.stdin.read() if args.job == "-" else Path(args.job).read_text()).strip()
    if not job_text:
        sys.exit("Job post is empty.")

    score, reason = score_fit(job_text)
    print(f"Fit score: {score}/10 - {reason}")
    if score < 6 and not args.force:
        print("Below 6: skipping. Use --force to draft anyway.")
        return

    text = draft(job_text)
    print(f"\n{text}\n\n({len(text.split())} words)")
    if not args.no_save:
        print(f"Saved as proposal #{save(job_text, text, score, args.title, args.url)} (Draft).")


if __name__ == "__main__":
    main()
