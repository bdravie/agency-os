"""Add an Icebreaker column to a lead list: the personalisation step that fills leads/enriched/.

Usage: uv run python -m agency.icebreakers "leads/unenriched/<list>.csv"
       [--output PATH] [--concurrency 10] [--model MODEL] [--force] [--skip-suppression]

The AI only tidies two names per lead (Nicholas -> Nick, "CROFTS ESTATE AGENTS LIMITED" -> Crofts); the
sentence around them is TEMPLATE below, placed by code, so every line reads the same. Calls run side by
side. Leads on the CRM's suppression list are left out. Nothing is sent and nothing is saved to the CRM.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import json
import re
from collections.abc import Awaitable, Callable
from pathlib import Path

import anthropic
import psycopg

from agency import config, llm
from agency.config import ROOT

# The words every lead gets. Edit here to change the line; {nickname} and {company} are filled in.
TEMPLATE = (
    "Hey {nickname}. Been keeping tabs on {company} for a hot minute, "
    "love what you guys are up to and the broader mission."
)
COLUMN = "Icebreaker"
DEFAULT_MODEL = "claude-sonnet-4-6"  # the owner's choice; ICEBREAKER_MODEL or --model changes it
ENRICHED = ROOT / "leads" / "enriched"

# Headers are compared with spaces, case and punctuation removed, so "First Name" matches "first_name".
FIRST_NAME = ("firstname", "first", "givenname", "contactfirstname")
FULL_NAME = ("fullname", "name", "contactname")
COMPANY = (
    "companyname",
    "company",
    "organizationname",
    "organization",
    "organisationname",
    "organisation",
    "accountname",
    "account",
    "businessname",
    "business",
)
EMAIL = ("emailaddress", "email", "workemail")
DOMAIN = ("domain", "companydomain", "website", "companywebsite")

Names = tuple[str, str]  # (nickname, company)
Asker = Callable[[str, str], Awaitable[Names | None]]


def find_column(
    headers: list[str], candidates: tuple[str, ...], override: str | None = None
) -> str | None:
    """The header that holds a field: the one named with a flag, else the first known spelling."""
    if override:
        if override not in headers:
            raise SystemExit(f'No column called "{override}". Columns: {", ".join(headers)}')
        return override
    by_key = {re.sub(r"[^a-z0-9]", "", h.lower()): h for h in reversed(headers)}
    return next((by_key[c] for c in candidates if c in by_key), None)


def tidy(value: object) -> str:
    return " ".join(str(value or "").split())


def bare_domain(value: str) -> str:
    """'https://www.Example.co.uk/about' -> 'example.co.uk'."""
    return re.sub(r"^(https?://)?(www\.)?", "", tidy(value).lower()).split("/")[0]


def is_suppressed(email: str, domain: str, emails: set[str], domains: set[str]) -> bool:
    email, domain = tidy(email).lower(), bare_domain(domain)
    return bool(
        (email and (email in emails or email.rpartition("@")[2] in domains))
        or (domain and domain in domains)
    )


def load_suppressed() -> tuple[set[str], set[str]]:
    """Every suppressed email and domain, in one read. Nothing is written."""
    from agency.core import db

    with db.connect() as conn:
        rows = conn.execute(
            "SELECT lower(email) AS email, lower(domain) AS domain FROM suppression"
        ).fetchall()
    return {r["email"] for r in rows if r["email"]}, {r["domain"] for r in rows if r["domain"]}


def parse_reply(text: str) -> Names | None:
    """Read {"nickname": ..., "company": ...} out of the AI's reply; None if it is not usable."""
    match = re.search(r"\{.*\}", text, flags=re.DOTALL)
    if not match:
        return None
    try:
        data = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    nickname, company = data.get("nickname"), data.get("company")
    if not isinstance(nickname, str) or not isinstance(company, str):
        return None
    nickname, company = tidy(nickname), tidy(company)
    usable = all(0 < len(v) <= 60 and not re.search(r"[{}<>]", v) for v in (nickname, company))
    return (nickname, company) if usable else None


def icebreaker(names: Names | None) -> str:
    return TEMPLATE.format(nickname=names[0], company=names[1]) if names else ""


async def name_all(
    pairs: list[tuple[str, str]], ask: Asker, concurrency: int
) -> dict[tuple[str, str], Names | None]:
    """Ask about every (first name, company) pair, at most `concurrency` at a time."""
    gate = asyncio.Semaphore(max(1, concurrency))

    async def one(pair: tuple[str, str]) -> tuple[tuple[str, str], Names | None]:
        async with gate:
            return pair, await ask(*pair)

    return dict(await asyncio.gather(*(one(p) for p in pairs)))


def claude_asker(model: str, usage: dict[str, int]) -> Asker:
    """One call per pair. A bad key or model stops the run; a busy or unreachable API leaves that lead blank."""
    client = llm.async_client()
    system = (ROOT / "prompts" / "icebreaker.md").read_text()

    async def ask(first: str, company: str) -> Names | None:
        for _ in range(2):  # a reply that is not usable gets one more go
            try:
                reply = await client.messages.create(
                    model=model,
                    max_tokens=1000,
                    system=system,
                    messages=[
                        {
                            "role": "user",
                            "content": json.dumps({"first_name": first, "company_name": company}),
                        }
                    ],
                )
            except (
                anthropic.RateLimitError,
                anthropic.InternalServerError,
                anthropic.APIConnectionError,
            ):
                return None  # the SDK has already retried with a growing wait
            usage["calls"] += 1
            usage["in"] += reply.usage.input_tokens
            usage["out"] += reply.usage.output_tokens
            names = parse_reply("".join(b.text for b in reply.content if b.type == "text"))
            if names:
                return names
        return None

    return ask


def default_output(source: Path) -> Path:
    return ENRICHED / source.name


def main() -> None:
    p = argparse.ArgumentParser(
        description="Add an AI-written Icebreaker column to a CSV of leads."
    )
    p.add_argument("csv", type=Path, help="The lead list, e.g. a file in leads/unenriched/")
    p.add_argument(
        "--output", type=Path, help="Where to save (default: leads/enriched/<same file name>)"
    )
    p.add_argument("--concurrency", type=int, default=10, help="Calls running at once (default 10)")
    p.add_argument(
        "--model", help=f"Model alias or id (default: ICEBREAKER_MODEL, else {DEFAULT_MODEL})"
    )
    p.add_argument(
        "--first-name-col", help="Header of the first name column, if it is not found by itself"
    )
    p.add_argument(
        "--company-col", help="Header of the company name column, if it is not found by itself"
    )
    p.add_argument(
        "--force", action="store_true", help="Replace the output file if it already exists"
    )
    p.add_argument(
        "--skip-suppression", action="store_true", help="Do not check the CRM's suppression list"
    )
    a = p.parse_args()

    out = a.output or default_output(a.csv)
    if out.exists() and not a.force:
        raise SystemExit(
            f"{out} already exists. Add --force to replace it, or --output to save elsewhere."
        )

    with a.csv.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        headers, rows = list(reader.fieldnames or []), list(reader)
    first_col = find_column(headers, FIRST_NAME, a.first_name_col)
    # A list with only a full name column ("Name") still works: its first word is the first name.
    full_name_col = None if first_col else find_column(headers, FULL_NAME)
    company_col = find_column(headers, COMPANY, a.company_col)
    if not (first_col or full_name_col) or not company_col:
        raise SystemExit(
            "Could not find the first name or company column. Name them with --first-name-col and "
            f"--company-col. Columns: {', '.join(headers)}"
        )

    left_out = 0
    if not a.skip_suppression:
        try:
            emails, domains = load_suppressed()
        except (psycopg.Error, RuntimeError, OSError) as e:  # no list beats an unchecked one
            raise SystemExit(
                f"Could not read the CRM's suppression list ({type(e).__name__}), so no list was made. "
                "Fix the connection, or add --skip-suppression to go ahead without the check."
            ) from None
        email_col, domain_col = find_column(headers, EMAIL), find_column(headers, DOMAIN)
        kept = [
            r
            for r in rows
            if not is_suppressed(
                r.get(email_col) or "" if email_col else "",
                r.get(domain_col) or "" if domain_col else "",
                emails,
                domains,
            )
        ]
        left_out, rows = len(rows) - len(kept), kept

    def pair_of(row: dict) -> tuple[str, str]:
        first = (
            tidy(row.get(first_col)) if first_col else tidy(row.get(full_name_col)).split(" ")[0]
        )
        return first, tidy(row.get(company_col))

    pairs = sorted({pair_of(r) for r in rows if all(pair_of(r))})
    model = llm.resolve_model(a.model or config.get("ICEBREAKER_MODEL") or DEFAULT_MODEL)
    usage = {"calls": 0, "in": 0, "out": 0}
    print(
        f"{len(rows)} leads, {len(pairs)} different name and company pairs. Asking {model}, {a.concurrency} at a time..."
    )
    try:
        names = (
            asyncio.run(name_all(pairs, claude_asker(model, usage), a.concurrency)) if pairs else {}
        )
    except anthropic.APIStatusError as e:
        raise SystemExit(
            f"The AI refused the request ({e.status_code}): {e.message}. Nothing was saved."
        ) from None

    for row in rows:
        row[COLUMN] = icebreaker(names.get(pair_of(row)))
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f, fieldnames=headers + ([] if COLUMN in headers else [COLUMN]), extrasaction="ignore"
        )
        writer.writeheader()
        writer.writerows(rows)

    written = sum(1 for r in rows if r[COLUMN])
    print(f"Saved {out}")
    print(
        f"  {written} icebreakers written, {len(rows) - written} left blank (no name, no company, or the AI gave nothing usable)."
    )
    if a.skip_suppression:
        print("  Suppression list NOT checked (--skip-suppression).")
    else:
        print(f"  {left_out} left out because they are on the suppression list.")
    print(f"  {usage['calls']} AI calls: {usage['in']:,} tokens in, {usage['out']:,} tokens out.")


if __name__ == "__main__":
    main()
