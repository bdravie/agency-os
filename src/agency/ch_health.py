"""Companies House filing health and size signals. Company-level data only: no directors or named people.

Usage:
  uv run python -m agency.ch_health                 # check companies not checked in the last 30 days
  uv run python -m agency.ch_health --all           # re-check everything
  uv run python -m agency.ch_health --number 12461098

A company is `filing_ok` when it is active, not dormant, has no overdue confirmation statement or accounts, no
insolvency history and a deliverable registered office. Size comes from the latest filed accounts (iXBRL): employees,
net assets and cash, and turnover when the company files it (micro-entities usually do not). Revenue is therefore an
ESTIMATE; `est_revenue_basis` says how it was made. `fit_score` is a ranking aid, not a valuation.
Free API; each company costs 3 requests at most, paced inside the 600-per-5-minutes limit.
"""

from __future__ import annotations

import argparse
import re
import time
from datetime import date, datetime

import httpx

from agency import compliance, config
from agency.core import db
from agency.core.niches import niches

API = "https://api.company-information.service.gov.uk"
DELAY_S = 0.55
DORMANT = {"dormant"}
BIGGER_THAN_MICRO = {"small", "full", "medium", "group", "total-exemption-full"}

TURNOVER = {"TurnoverRevenue", "Turnover", "Revenue"}
CASH = {"CashBankOnHand", "CashBankInHand", "CashAndCashEquivalents"}


def health_from_profile(p: dict) -> dict:
    """Turn a /company/{number} profile into filing-health columns plus a list of problems."""
    cs, ac = p.get("confirmation_statement") or {}, p.get("accounts") or {}
    last = ac.get("last_accounts") or {}
    h = {
        "incorporated_on": p.get("date_of_creation"),
        "ch_status_detail": p.get("company_status_detail"),
        "company_type": p.get("type"),
        "company_status": p.get("company_status"),
        "confirmation_overdue": bool(cs.get("overdue")) if cs else None,
        "confirmation_next_due": cs.get("next_due"),
        "accounts_overdue": bool(ac.get("overdue")) if ac else None,
        "accounts_next_due": ac.get("next_due"),
        "accounts_type": last.get("type"),
        "last_accounts_date": last.get("made_up_to"),
        "has_insolvency_history": bool(p.get("has_insolvency_history")),
    }
    problems: list[str] = []
    if p.get("company_status") != "active":
        problems.append(f"status {p.get('company_status')}")
    if p.get("company_status_detail"):
        problems.append(str(p["company_status_detail"]))
    if h["confirmation_overdue"]:
        problems.append("confirmation statement overdue")
    if h["accounts_overdue"]:
        problems.append("accounts overdue")
    if h["has_insolvency_history"]:
        problems.append("insolvency history")
    if p.get("has_been_liquidated"):
        problems.append("liquidated")
    if p.get("undeliverable_registered_office_address"):
        problems.append("registered office undeliverable")
    if p.get("registered_office_is_in_dispute"):
        problems.append("registered office in dispute")
    if p.get("can_file") is False:
        problems.append("cannot file")
    if (h["accounts_type"] or "") in DORMANT:
        problems.append("dormant accounts")
    h["filing_ok"] = not problems
    h["problems"] = problems
    return h


def _num(text: str, attrs: str) -> float | None:
    inner = re.sub(r"<[^>]+>", "", text).strip()
    if inner in {"", "-", "–"} or "zerodash" in attrs or "fixed-zero" in attrs:
        value = 0.0
    else:
        try:
            value = float(inner.replace(",", ""))
        except ValueError:
            return None
    scale = re.search(r'\bscale="(-?\d+)"', attrs)
    value *= 10 ** int(scale.group(1)) if scale else 1
    return -value if 'sign="-"' in attrs else value


def parse_ixbrl(html: str) -> dict:
    """Pull turnover, employees, net assets and cash for the latest period out of an iXBRL accounts document."""
    ctx_end: dict[str, tuple[str | None, bool]] = {}
    for m in re.finditer(r'<xbrli:context\b[^>]*\bid="([^"]+)"[^>]*>(.*?)</xbrli:context>', html, re.S):
        end = re.search(r"<xbrli:(?:endDate|instant)>([^<]+)<", m.group(2))
        ctx_end[m.group(1)] = (end.group(1).strip() if end else None, "Member" in m.group(2))
    facts: list[tuple[str, str, float]] = []
    for m in re.finditer(r"<ix:nonFraction\b([^>]*)>(.*?)</ix:nonFraction>", html, re.S):
        name, ctx = re.search(r'\bname="([^"]+)"', m.group(1)), re.search(r'\bcontextRef="([^"]+)"', m.group(1))
        value = _num(m.group(2), m.group(1))
        if name and ctx and value is not None and ctx.group(1) in ctx_end and not ctx_end[ctx.group(1)][1]:
            facts.append((name.group(1).split(":")[-1], ctx_end[ctx.group(1)][0] or "", value))
    if not facts:
        return {}
    latest = max(end for _, end, _ in facts)
    now = {name: v for name, end, v in facts if end == latest}
    pick = lambda names: next((now[n] for n in names if n in now), None)
    employees = pick({"AverageNumberEmployeesDuringPeriod"})
    return {
        "turnover_gbp": pick(TURNOVER), "employees": int(employees) if employees is not None else None,
        "net_assets_gbp": pick(["NetAssetsLiabilities", "Equity"]), "cash_gbp": pick(CASH),
    }


def estimate_revenue(turnover: float | None, employees: int | None, per_employee: list[float]) -> tuple[float | None, str | None]:
    if turnover and turnover > 0:
        return turnover, "reported turnover"
    if employees:
        lo, hi = per_employee
        return employees * (lo + hi) / 2, f"{employees} employee(s) x GBP {lo / 1000:.0f}-{hi / 1000:.0f}k each (rough)"
    return None, None


def fit_score(f: dict, today: date | None = None) -> tuple[int, list[str]]:
    """A 0-100 ranking aid from filing health, age and size signals. Not a valuation."""
    today = today or date.today()
    if not f.get("filing_ok"):
        return 0, ["Filing problems: " + "; ".join(f.get("problems") or ["unknown"])]
    score, notes = 0, []
    if f.get("incorporated_on"):
        years = (today - date.fromisoformat(str(f["incorporated_on"]))).days / 365.25
        add = 15 if years >= 3 else 8 if years >= 2 else 0
        score += add
        notes.append(f"{years:.0f} years trading" + ("" if add else " (young)"))
    t = f.get("accounts_type") or ""
    if t in BIGGER_THAN_MICRO:
        score += 25
        notes.append(f"files {t} accounts (above micro size)")
    elif t:
        score += 5
        notes.append(f"files {t} accounts")
    e = f.get("employees")
    if e is not None:
        score += 30 if e >= 10 else 22 if e >= 5 else 15 if e >= 3 else 8 if e == 2 else 0
        notes.append(f"{e} employee(s)")
    else:
        notes.append("employees unknown")
    tv = f.get("turnover_gbp")
    if tv is not None:
        score += 30 if tv >= 250_000 else 25 if tv >= 100_000 else 15 if tv >= 50_000 else -10
        notes.append(f"turnover GBP {tv:,.0f}")
    na = f.get("net_assets_gbp")
    if na is not None:
        score += 10 if na >= 100_000 else 6 if na >= 25_000 else 3 if na >= 0 else -10
        notes.append(f"net assets GBP {na:,.0f}")
    if (f.get("cash_gbp") or 0) >= 25_000:
        score += 5
        notes.append(f"cash GBP {f['cash_gbp']:,.0f}")
    return max(0, min(100, score)), notes


# ---- network ----

def get_json(client: httpx.Client, path: str, params: dict | None = None, sleep=time.sleep) -> dict | None:
    for _ in range(3):
        r = client.get(path, params=params)
        if r.status_code == 429:
            sleep(30)
            continue
        if r.status_code == 404:
            return None
        r.raise_for_status()
        sleep(DELAY_S)
        return r.json()
    raise RuntimeError("Companies House kept rate-limiting; try again in a few minutes")


def latest_accounts_html(client: httpx.Client, number: str, sleep=time.sleep) -> str | None:
    items = (get_json(client, f"/company/{number}/filing-history", {"category": "accounts", "items_per_page": 1}, sleep) or {}).get("items") or []
    meta_url = ((items[0].get("links") or {}).get("document_metadata")) if items else None
    if not meta_url:
        return None
    meta = client.get(meta_url)
    meta.raise_for_status()
    sleep(DELAY_S)
    if "application/xhtml+xml" not in (meta.json().get("resources") or {}):
        return None  # paper or PDF-only filing: no machine-readable figures
    doc = client.get(f"{meta_url}/content", headers={"Accept": "application/xhtml+xml"})
    sleep(DELAY_S)
    return doc.text if doc.status_code == 200 else None


def assess(client: httpx.Client, number: str, cfg: dict, sleep=time.sleep) -> dict | None:
    """Everything we store for one company, or None if Companies House does not know the number."""
    profile = get_json(client, f"/company/{number}", sleep=sleep)
    if profile is None:
        return None
    facts = health_from_profile(profile)
    if facts["filing_ok"]:  # no point reading accounts of a company we will not contact
        html = latest_accounts_html(client, number, sleep)
        facts.update(parse_ixbrl(html) if html else {})
    est, basis = estimate_revenue(facts.get("turnover_gbp"), facts.get("employees"), cfg["est_revenue_per_employee_gbp"])
    facts["est_revenue_gbp"], facts["est_revenue_basis"] = est, basis
    score, notes = fit_score(facts)
    facts["fit_score"], facts["fit_notes"] = score, "; ".join(notes)
    return facts


COLUMNS = ["incorporated_on", "ch_status_detail", "company_type", "company_status", "confirmation_overdue", "confirmation_next_due", "accounts_overdue", "accounts_next_due",
           "accounts_type", "last_accounts_date", "has_insolvency_history", "filing_ok", "employees", "turnover_gbp", "net_assets_gbp",
           "cash_gbp", "est_revenue_gbp", "est_revenue_basis", "fit_score", "fit_notes"]


def store(conn, number: str, facts: dict) -> None:
    sets = ", ".join(f"{c} = %s" for c in COLUMNS)
    conn.execute(f"UPDATE companies SET {sets}, ch_checked_at = now() WHERE company_number = %s", [facts.get(c) for c in COLUMNS] + [number])
    if facts.get("company_type") and facts.get("company_status"):  # a company that has since been struck off becomes blocked automatically
        compliance.apply_profile(conn, number, facts["company_type"], facts["company_status"], facts.get("ch_status_detail"))


def settings() -> dict:
    d = niches().get("defaults", {})
    return {"min_est_revenue_gbp": d.get("min_est_revenue_gbp", 50_000), "min_company_age_years": d.get("min_company_age_years", 2),
            "est_revenue_per_employee_gbp": d.get("est_revenue_per_employee_gbp", [50_000, 100_000])}


def main() -> None:
    p = argparse.ArgumentParser(description="Check Companies House filing health and size for companies in the CRM.")
    p.add_argument("--all", action="store_true", help="Re-check companies even if checked in the last 30 days")
    p.add_argument("--number", help="Check one company number")
    p.add_argument("--limit", type=int, default=200)
    a = p.parse_args()
    cfg = settings()
    with db.connect() as conn:
        where = "company_number = %s" if a.number else ("company_number IS NOT NULL" + ("" if a.all else " AND (ch_checked_at IS NULL OR ch_checked_at < now() - interval '30 days')"))
        rows = conn.execute(f"SELECT company_number, name FROM companies WHERE {where} ORDER BY ch_checked_at NULLS FIRST LIMIT %s",
                            ([a.number] if a.number else []) + [a.limit]).fetchall()
    if not rows:
        print("Nothing to check.")
        return
    ok = bad = unknown = 0
    with httpx.Client(base_url=API, auth=(config.require("COMPANIES_HOUSE_API_KEY"), ""), timeout=40, follow_redirects=True) as client, db.connect() as conn:
        for r in rows:
            facts = assess(client, r["company_number"], cfg)
            if facts is None:
                unknown += 1
                continue
            store(conn, r["company_number"], facts)
            ok, bad = ok + bool(facts["filing_ok"]), bad + (not facts["filing_ok"])
            flag = "ok " if facts["filing_ok"] else "NO "
            print(f"{flag}{r['name'][:38]:<38} fit {facts['fit_score']:>3}  {facts['fit_notes'][:70]}")
        db.log_activity(conn, "ch_health_run", channel="companies_house", body=f"{ok} ok, {bad} with problems, {unknown} not found")
    print(f"\nChecked {ok + bad + unknown}: {ok} up to date, {bad} with filing problems, {unknown} not found. Cost: £0.")


if __name__ == "__main__":
    main()
