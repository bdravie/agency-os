"""Who may be contacted. The `lead_gate` database view is the single source of truth for "sendable"; this module classifies
Companies House results, normalises phone numbers the same way the database does, and checks the suppression list.

Usage:
  uv run python -m agency.compliance --unverified          # verify every lead that has a company number but no check yet
  uv run python -m agency.compliance --stale 90            # re-check leads last checked more than 90 days ago
  uv run python -m agency.compliance --number 01234567     # one company
Free API (600 requests per 5 minutes); this respects that.
"""

from __future__ import annotations

import argparse
import re
import time

import httpx

from agency import config
from agency.core import db

API = "https://api.company-information.service.gov.uk"
ELIGIBLE_TYPES = ("ltd", "llp", "plc")
DEFAULT_CONSENT_BASIS = "PECR corporate subscriber + legitimate interest"  # keep in step with crm/lib/compliance.ts
DELAY_S = 0.55


def normalise_phone(p: str | None) -> str | None:
    """Same rule as normalise_phone() in the database and normalisePhone() in the CRM: UK numbers as national digits."""
    t = re.sub(r"^(\+44|0044)0?", "0", re.sub(r"[^0-9+]", "", p or ""))
    return t or None


def classify(company_type: str | None, status: str | None) -> tuple[str, str | None]:
    """('eligible', None) for an active ltd, llp or plc; otherwise ('not_eligible', the reason in plain words)."""
    t, s = (company_type or "").lower(), (status or "").lower()
    if t not in ELIGIBLE_TYPES:
        return "not_eligible", f"Not a limited company or LLP ({company_type or 'unknown type'})."
    if s != "active":
        return "not_eligible", f"Company status is '{status or 'unknown'}', not active."
    return "eligible", None


def is_suppressed(conn, *, domain: str | None = None, email: str | None = None, phone: str | None = None, company_number: str | None = None) -> bool:
    """True if any identifier is on the global suppression list. Every list-building tool calls this before saving or enriching."""
    row = conn.execute(
        """SELECT 1 FROM suppression s
            WHERE (%(d)s::text IS NOT NULL AND lower(s.domain) = lower(%(d)s))
               OR (%(e)s::text IS NOT NULL AND lower(s.email) = lower(%(e)s))
               OR (%(p)s::text IS NOT NULL AND s.phone = %(p)s)
               OR (%(n)s::text IS NOT NULL AND s.company_number = %(n)s) LIMIT 1""",
        {"d": domain, "e": email, "p": normalise_phone(phone), "n": company_number}).fetchone()
    return row is not None


def apply_profile(conn, number: str, company_type: str | None, status: str | None, detail: str | None = None) -> str:
    """Store what Companies House says about a company number on its lead. Returns the new compliance_status."""
    verdict, _ = classify(company_type, status)
    conn.execute(
        """UPDATE companies SET company_type = %s, company_status = %s, is_ltd = %s, ch_status_detail = COALESCE(%s, ch_status_detail),
                  compliance_status = %s, compliance_checked_at = now(),
                  consent_basis = COALESCE(consent_basis, CASE WHEN %s = 'eligible' THEN %s END)
            WHERE company_number = %s""",
        (company_type, status, (company_type or "").lower() in ELIGIBLE_TYPES, detail, verdict, verdict, DEFAULT_CONSENT_BASIS, number))
    return verdict


def verify(numbers: list[str]) -> tuple[int, int, int]:
    """Look each number up (free API) and store the result. Returns (eligible, blocked, not_found)."""
    eligible = blocked = missing = 0
    with httpx.Client(base_url=API, auth=(config.require("COMPANIES_HOUSE_API_KEY"), ""), timeout=30) as client, db.connect() as conn:
        for number in numbers:
            resp = client.get(f"/company/{number}")
            if resp.status_code == 429:
                time.sleep(30)
                resp = client.get(f"/company/{number}")
            if resp.status_code == 404:
                missing += 1
            else:
                resp.raise_for_status()
                p = resp.json()
                verdict = apply_profile(conn, number, p.get("type"), p.get("company_status"), p.get("company_status_detail"))
                eligible, blocked = eligible + (verdict == "eligible"), blocked + (verdict != "eligible")
                print(f"{'ok ' if verdict == 'eligible' else 'NO '}{number} {str(p.get('company_name'))[:40]:<40} {p.get('type')} / {p.get('company_status')}")
            time.sleep(DELAY_S)
        db.log_activity(conn, "compliance_checked", channel="companies_house", body=f"{eligible} eligible, {blocked} blocked, {missing} not found")
    return eligible, blocked, missing


def main() -> None:
    p = argparse.ArgumentParser(description="Verify leads against Companies House (active ltd/llp/plc only may be contacted).")
    p.add_argument("--unverified", action="store_true", help="Leads with a company number that have never been checked")
    p.add_argument("--stale", type=int, metavar="DAYS", help="Leads last checked more than DAYS days ago")
    p.add_argument("--number", help="One company number")
    p.add_argument("--limit", type=int, default=200)
    a = p.parse_args()
    if not (a.unverified or a.stale or a.number):
        p.error("choose --unverified, --stale DAYS or --number")
    with db.connect() as conn:
        if a.number:
            numbers = [a.number.upper().zfill(8) if a.number.isdigit() else a.number.upper()]
        elif a.unverified:
            numbers = [r["company_number"] for r in conn.execute(
                "SELECT company_number FROM companies WHERE compliance_status = 'unchecked' AND company_number IS NOT NULL ORDER BY id LIMIT %s", (a.limit,))]
        else:
            numbers = [r["company_number"] for r in conn.execute(
                "SELECT company_number FROM companies WHERE company_number IS NOT NULL AND compliance_checked_at < now() - make_interval(days => %s) ORDER BY compliance_checked_at LIMIT %s", (a.stale, a.limit))]
    if not numbers:
        print("Nothing to check.")
        return
    eligible, blocked, missing = verify(numbers)
    print(f"\nChecked {len(numbers)}: {eligible} eligible, {blocked} blocked, {missing} not found. API requests: {len(numbers)}. Cost: £0.")


if __name__ == "__main__":
    main()
