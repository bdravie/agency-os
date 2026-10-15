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
import json
import re
import time
from datetime import date, timedelta
from urllib import robotparser
from urllib.parse import urljoin

from psycopg.types.json import Jsonb

import httpx

from agency import ch_health, compliance, config
from agency.core import db
from agency.core.niches import all_niches

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
        "company_type": item.get("company_type"), "company_status": item.get("company_status"),
    }


def save(companies: list[dict], niche: str, facts: dict[str, dict] | None = None) -> tuple[int, int]:
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
                if c.get("company_type") and c.get("company_status"):  # the search only returns active ltd/llp/plc; record that as the verified result
                    compliance.apply_profile(conn, c["company_number"], c["company_type"], c["company_status"])
                    conn.execute("UPDATE companies SET contact_source = COALESCE(contact_source, 'Companies House register (company details only)') WHERE id = %s", (row["id"],))
                if facts and c["company_number"] in facts:
                    ch_health.store(conn, c["company_number"], facts[c["company_number"]])
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
            """SELECT c.id, c.domain, c.company_number, c.phone FROM companies c JOIN lead_gate g ON g.company_id = c.id
                WHERE c.domain IS NOT NULL AND c.generic_email IS NULL AND g.sendable ORDER BY c.id LIMIT %s""", (limit,)
        ).fetchall()
        for r in rows:
            checked += 1
            if compliance.is_suppressed(conn, domain=r["domain"], company_number=r["company_number"], phone=r["phone"]):
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
            emails = [e for e in emails if not compliance.is_suppressed(conn, email=e)]
            if emails:
                conn.execute("UPDATE companies SET generic_email = %s, contact_source = 'Company website (homepage or contact page)' WHERE id = %s", (emails[0], r["id"]))
                found += 1
    return checked, found


def stage(search_id: int, companies: list[dict], facts: dict[str, dict], niche: str) -> tuple[int, int]:
    """Keep what a search found so you can choose which companies to add. Nothing is written to companies. Returns (rows, skipped)."""
    skipped = 0
    with db.connect() as conn:
        have = {r["company_number"] for r in conn.execute("SELECT company_number FROM companies WHERE company_number IS NOT NULL")}
        for c in companies:
            f = facts.get(c["company_number"]) or {}
            reason = ("Already in the CRM" if c["company_number"] in have
                      else "On your suppression list" if compliance.is_suppressed(conn, company_number=c["company_number"]) else None)
            skipped += bool(reason)
            conn.execute(
                """INSERT INTO lead_search_results (search_id, company_number, name, address, postcode, sic_codes, company_type, company_status,
                                                    fit_score, fit_notes, est_revenue_gbp, facts, skip_reason)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (search_id, company_number) DO NOTHING""",
                (search_id, c["company_number"], c["name"], c["address"], c["postcode"], c["sic_codes"], c.get("company_type"), c.get("company_status"),
                 f.get("fit_score"), f.get("fit_notes"), f.get("est_revenue_gbp"), Jsonb(f, dumps=lambda o: json.dumps(o, default=str)) if f else None, reason))
    return len(companies), skipped


def add_staged(search_id: int, numbers: list[str]) -> tuple[int, int]:
    """Add the chosen companies from a search to the CRM, using the facts already fetched (no new API calls). Returns (added, skipped)."""
    with db.connect() as conn:
        s = conn.execute("SELECT niche FROM lead_searches WHERE id = %s", (search_id,)).fetchone()
        rows = conn.execute("SELECT * FROM lead_search_results WHERE search_id = %s AND company_number = ANY(%s) AND added_at IS NULL", (search_id, numbers)).fetchall()
    if not s:
        raise SystemExit(f"No search {search_id}.")
    companies, facts, blocked = [], {}, 0
    with db.connect() as conn:
        for r in rows:
            if r["skip_reason"] or compliance.is_suppressed(conn, company_number=r["company_number"]):
                blocked += 1
                continue
            companies.append({"name": r["name"], "company_number": r["company_number"], "address": r["address"], "postcode": r["postcode"],
                              "sic_codes": r["sic_codes"], "company_type": r["company_type"], "company_status": r["company_status"]})
            if r["facts"]:
                facts[r["company_number"]] = r["facts"]
    new, existed = save(companies, s["niche"], facts)
    with db.connect() as conn:
        conn.execute("UPDATE lead_search_results SET added_at = now() WHERE search_id = %s AND company_number = ANY(%s) AND skip_reason IS NULL", (search_id, [c["company_number"] for c in companies]))
    return new, existed + blocked


def main() -> None:
    p = argparse.ArgumentParser(description="Companies House lead list (active ltd/llp/plc only).")
    p.add_argument("--niche", help="Key from config/niches.yaml, e.g. marketing_agencies")
    p.add_argument("--location", help="Town or area in the registered address, e.g. London")
    p.add_argument("--limit", type=int, default=50)
    p.add_argument("--min-age-years", type=int, default=2, help="Skip newly formed companies (default 2)")
    p.add_argument("--dry-run", action="store_true", help="Show results, do not save")
    p.add_argument("--include-unhealthy", action="store_true", help="Also keep companies with overdue filings, strike-off notices or dormant accounts")
    p.add_argument("--min-fit", type=int, default=0, help="Only keep companies with a fit score at least this high (after the health check)")
    p.add_argument("--enrich", action="store_true", help="Find generic emails for companies that have a domain")
    p.add_argument("--stage", type=int, metavar="SEARCH_ID", help="Keep the results for the CRM to show (used by the Find companies panel); saves nothing to companies")
    p.add_argument("--add", type=int, metavar="SEARCH_ID", help="Add chosen companies from a staged search")
    p.add_argument("--numbers", help="Comma-separated company numbers to add (with --add)")
    a = p.parse_args()

    if a.enrich:
        checked, found = enrich(a.limit)
        print(f"Enrich: checked {checked} companies, found {found} generic emails. Cost: £0.")
        return
    if a.add:
        new, skipped = add_staged(a.add, [n for n in (a.numbers or "").split(",") if n.strip()])
        print(f"Added {new} to the CRM, {skipped} skipped (already there or suppressed). Cost: £0.")
        return
    if not a.niche:
        p.error("--niche is required")
    sics = (all_niches().get(a.niche) or {}).get("sic_codes")
    if not sics:
        p.error(f"No sic_codes for niche '{a.niche}' in config/niches.yaml or the niches added in the CRM")

    cfg = ch_health.settings()
    facts: dict[str, dict] = {}
    dropped = 0
    with make_client() as client:
        companies, n = search(client, sics, a.location, a.limit, a.min_age_years)
        with db.connect() as conn:  # do not spend API calls on companies already in the CRM
            have = {r["company_number"] for r in conn.execute("SELECT company_number FROM companies WHERE company_number IS NOT NULL")}
        kept = []
        for c in companies:
            if c["company_number"] in have:
                kept.append(c)
                continue
            f = ch_health.assess(client, c["company_number"], cfg)
            n += 3
            if f is None or (not a.include_unhealthy and not f["filing_ok"]) or f["fit_score"] < a.min_fit and f["filing_ok"]:
                dropped += 1
                continue
            facts[c["company_number"]] = f
            kept.append(c)
        companies = kept
    if a.stage:
        rows, skipped = stage(a.stage, companies, facts, a.niche)
        print(f"Found {rows} companies ({skipped} already in the CRM or suppressed), {dropped} dropped for filing problems or low fit. Nothing added yet. API requests: about {n}. Cost: £0.")
        return
    if a.dry_run:
        for c in companies[:20]:
            f = facts.get(c["company_number"], {})
            print(f"{c['company_number']}  {c['name']}  {c['postcode'] or ''}  fit {f.get('fit_score', '-')}")
        print(f"Dry run: {len(companies)} kept, {dropped} dropped for filing problems or low fit, nothing saved. API requests: about {n}. Cost: £0.")
        return
    new, skipped = save(companies, a.niche, facts)
    print(f"Saved {new} new companies, {skipped} already in the CRM, {dropped} dropped for filing problems or low fit. API requests: about {n}. Cost: £0.")


if __name__ == "__main__":
    main()
