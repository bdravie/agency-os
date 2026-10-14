"""Build a lead list of active UK limited companies from Companies House.

Usage:
  uv run python -m agency.companies_house --niche marketing_agencies --location London --limit 50 --dry-run
  uv run python -m agency.companies_house --niche marketing_agencies --location London --limit 50
  uv run python -m agency.companies_house --enrich            # generic emails for companies that have a domain

Company-level data only: name, number, registered address, SIC codes. No directors or named people are read or stored.
Free API; limit is 600 requests per 5 minutes, which this respects. Each run prints how many requests it made.
"""

from __future__ import annotations

import argparse
import re
import time
from datetime import date, timedelta
from urllib import robotparser
from urllib.parse import urljoin

import httpx

from agency import config
from agency.core import db
from agency.core.niches import niches

API = "https://api.company-information.service.gov.uk"
PAGE = 100
DELAY_S = 0.55  # about 109 requests per minute, well inside 600 per 5 minutes
GENERIC = {"info", "hello", "contact", "enquiries", "enquiry", "office", "admin", "team", "sales", "support"}
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")


def make_client() -> httpx.Client:
    key = config.require("COMPANIES_HOUSE_API_KEY")
    return httpx.Client(base_url=API, auth=(key, ""), timeout=30)


def search(client: httpx.Client, sic_codes: list[str], location: str | None, limit: int,
           min_age_years: int, sleep=time.sleep) -> tuple[list[dict], int]:
    """Return (companies, requests_made). Only active ltd/llp/plc companies older than min_age_years."""
    params = {
        "sic_codes": ",".join(sic_codes), "company_status": "active", "company_type": "ltd,llp,plc",
        "incorporated_to": (date.today() - timedelta(days=365 * min_age_years)).isoformat(), "size": min(PAGE, limit),
    }
    if location:
        params["location"] = location
    found: list[dict] = []
    requests_made = 0
    while len(found) < limit:
        resp = client.get("/advanced-search/companies", params={**params, "start_index": len(found)})
        requests_made += 1
        if resp.status_code == 429:
            sleep(30)
            continue
        resp.raise_for_status()
        items = resp.json().get("items", [])
        if not items:
            break
        found += [parse_item(i) for i in items]
        sleep(DELAY_S)
    return found[:limit], requests_made


def parse_item(item: dict) -> dict:
    addr = item.get("registered_office_address") or {}
    street = ", ".join(x for x in [addr.get("address_line_1"), addr.get("locality"), addr.get("region")] if x)
    return {
        "name": (item.get("company_name") or "").title() if (item.get("company_name") or "").isupper() else item.get("company_name"),
        "company_number": item.get("company_number"), "address": street or None,
        "postcode": addr.get("postal_code"), "sic_codes": item.get("sic_codes") or [],
    }


def save(companies: list[dict], niche: str) -> tuple[int, int]:
    """Insert new companies; skip any company number already present. Returns (new, skipped)."""
    new = 0
    with db.connect() as conn:
        for c in companies:
            if not c["name"] or not c["company_number"]:
                continue
            row = conn.execute(
                """INSERT INTO companies (name, company_number, is_ltd, sic_codes, address, postcode, niche, source, status)
                   VALUES (%s,%s,true,%s,%s,%s,%s,'Companies House','New')
                   ON CONFLICT (company_number) WHERE company_number IS NOT NULL DO NOTHING RETURNING id""",
                (c["name"], c["company_number"], c["sic_codes"], c["address"], c["postcode"], niche),
            ).fetchone()
            if row:
                new += 1
                db.log_activity(conn, "lead_added", company_id=row["id"], channel="companies_house", body=c["name"])
        db.log_activity(conn, "companies_house_run", body=f"{new} new of {len(companies)} for {niche}")
    return new, len(companies) - new


def generic_emails(html: str, domain: str) -> list[str]:
    """Only generic company addresses on the company's own domain; named people are ignored."""
    out = []
    for e in set(EMAIL_RE.findall(html)):
        local, _, host = e.lower().partition("@")
        if local in GENERIC and (host == domain or host.endswith("." + domain)):
            out.append(e.lower())
    return sorted(out)


def allowed(domain: str, path: str, client: httpx.Client) -> bool:
    rp = robotparser.RobotFileParser()
    try:
        resp = client.get(f"https://{domain}/robots.txt")
        rp.parse(resp.text.splitlines() if resp.status_code == 200 else [])
    except httpx.HTTPError:
        return False
    return rp.can_fetch("AgencyOSBot", f"https://{domain}{path}")


def enrich(limit: int = 50) -> tuple[int, int]:
    """Look for a generic email on the homepage and contact page of companies that have a domain."""
    found = checked = 0
    with db.connect() as conn, httpx.Client(timeout=15, follow_redirects=True, headers={"User-Agent": "AgencyOSBot"}) as web:
        rows = conn.execute(
            "SELECT id, domain FROM companies WHERE domain IS NOT NULL AND generic_email IS NULL AND is_ltd ORDER BY id LIMIT %s", (limit,)
        ).fetchall()
        for r in rows:
            checked += 1
            if conn.execute("SELECT 1 FROM suppression WHERE lower(domain) = lower(%s)", (r["domain"],)).fetchone():
                continue
            emails: list[str] = []
            for path in ("/", "/contact", "/contact-us"):
                if not allowed(r["domain"], path, web):
                    continue
                try:
                    emails += generic_emails(web.get(f"https://{r['domain']}{path}").text, r["domain"])
                except httpx.HTTPError:
                    pass
                time.sleep(1)
                if emails:
                    break
            emails = [e for e in emails if not conn.execute("SELECT 1 FROM suppression WHERE lower(email) = %s", (e,)).fetchone()]
            if emails:
                conn.execute("UPDATE companies SET generic_email = %s WHERE id = %s", (emails[0], r["id"]))
                found += 1
    return checked, found


def main() -> None:
    p = argparse.ArgumentParser(description="Companies House lead list (active ltd/llp/plc only).")
    p.add_argument("--niche", help="Key from config/niches.yaml, e.g. marketing_agencies")
    p.add_argument("--location", help="Town or area in the registered address, e.g. London")
    p.add_argument("--limit", type=int, default=50)
    p.add_argument("--min-age-years", type=int, default=2, help="Skip newly formed companies (default 2)")
    p.add_argument("--dry-run", action="store_true", help="Show results, do not save")
    p.add_argument("--enrich", action="store_true", help="Find generic emails for companies that have a domain")
    a = p.parse_args()

    if a.enrich:
        checked, found = enrich(a.limit)
        print(f"Enrich: checked {checked} companies, found {found} generic emails. Cost: £0.")
        return
    if not a.niche:
        p.error("--niche is required")
    sics = (niches().get("niches", {}).get(a.niche) or {}).get("sic_codes")
    if not sics:
        p.error(f"No sic_codes for niche '{a.niche}' in config/niches.yaml")

    with make_client() as client:
        companies, n = search(client, sics, a.location, a.limit, a.min_age_years)
    if a.dry_run:
        for c in companies[:20]:
            print(f"{c['company_number']}  {c['name']}  {c['postcode'] or ''}")
        print(f"Dry run: {len(companies)} companies found, nothing saved. API requests: {n}. Cost: £0.")
        return
    new, skipped = save(companies, a.niche)
    print(f"Saved {new} new companies, {skipped} already in the CRM. API requests: {n}. Cost: £0.")


if __name__ == "__main__":
    main()
