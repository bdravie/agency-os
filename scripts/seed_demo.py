"""Fill the CRM with fake demo data (insert-only, every company tagged source='demo').

Usage:
  uv run python scripts/seed_demo.py              # insert demo companies, contacts, deals, tasks, activity
  uv run python scripts/seed_demo.py --dry-run    # show what would be inserted
  uv run python scripts/seed_demo.py --write-csv data/sample_companies.csv   # 50-row CSV for import testing

Fake data only: example.com domains and emails, 07700 900xxx phone numbers.
"""

from __future__ import annotations

import argparse
import csv
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

from agency.core import db

PREFIX = ["Northside", "Riverside", "Oakwood", "Brightway", "Castle", "Meridian", "Hartley", "Greenfield", "Summit", "Kingsway",
          "Ashford", "Beacon", "Clearview", "Dalton", "Elm", "Fairview", "Granite", "Harbour", "Ivy", "Juniper"]
TRADE = {"hvac": ["Heating", "Air Conditioning", "Boilers"], "roofing": ["Roofing", "Roofline"], "pest_control": ["Pest Control"],
         "marketing_agencies": ["Digital", "Marketing"], "ecommerce": ["Goods", "Supplies"]}
ROLES = ["Owner", "Office manager", "Director"]
FIRST = ["Alex", "Sam", "Jo", "Priya", "Tom", "Aisha", "Dan", "Maya"]
LAST = ["Example", "Sample", "Demo", "Testerson", "Placeholder"]
STAGES = ["New", "Contacted", "Replied", "Call booked", "Audit sold", "Proposal sent", "Won", "Lost"]


def companies(n: int, seed: int = 7) -> list[dict]:
    rng = random.Random(seed)
    out, used = [], set()
    while len(out) < n:
        niche = rng.choice(list(TRADE))
        name = f"{rng.choice(PREFIX)} {rng.choice(TRADE[niche])}"
        slug = name.lower().replace(" ", "-")
        if slug in used:
            slug += f"-{len(out)}"
            name += f" {len(out)}"
        used.add(slug)
        out.append({"name": name, "domain": f"{slug}.example.com", "phone": f"07700 900{rng.randint(100, 999)}",
                    "niche": niche, "postcode": f"SW{rng.randint(1, 20)} {rng.randint(1, 9)}AA"})
    return out


def write_csv(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    rows = companies(50, seed=11)
    # Two deliberate duplicates (same domain, different name) to prove merging works.
    rows += [{**rows[0], "name": rows[0]["name"] + " Ltd"}, {**rows[1], "name": rows[1]["name"].upper()}]
    with path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["name", "domain", "phone", "postcode", "niche", "source"])
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in w.fieldnames} | {"source": "demo"})
    print(f"Wrote {len(rows)} rows ({len(rows) - 2} unique) to {path}")


def seed(dry_run: bool) -> None:
    rng = random.Random(3)
    rows = companies(12)
    now = datetime.now(timezone.utc)
    if dry_run:
        for r in rows:
            print("would insert", r["name"], r["domain"])
        return
    with db.connect() as conn:
        for i, r in enumerate(rows):
            c = conn.execute(
                """INSERT INTO companies (name, domain, phone, postcode, niche, is_ltd, status, source)
                   VALUES (%s,%s,%s,%s,%s,true,'New','demo')
                   ON CONFLICT (lower(domain)) WHERE domain IS NOT NULL DO NOTHING RETURNING id""",
                (r["name"], r["domain"], r["phone"], r["postcode"], r["niche"]),
            ).fetchone()
            if not c:
                continue  # already seeded
            cid = c["id"]
            contact = conn.execute(
                """INSERT INTO contacts (company_id, name, role, email, phone, consent_basis)
                   VALUES (%s,%s,%s,%s,%s,'replied') RETURNING id""",
                (cid, f"{rng.choice(FIRST)} {rng.choice(LAST)}", rng.choice(ROLES),
                 f"hello{i}@example.com", f"07700 900{rng.randint(100, 999)}"),
            ).fetchone()
            stage = STAGES[i % len(STAGES)]
            deal = conn.execute(
                """INSERT INTO deals (company_id, contact_id, title, stage, setup_value_gbp, monthly_value_gbp, source, channel, lost_reason, lost_note)
                   VALUES (%s,%s,%s,%s,%s,%s,'demo',%s,%s,%s) RETURNING id""",
                (cid, contact["id"], f"{r['name']}: weekly digest", stage, rng.choice([500, 600, 750, 900]), rng.choice([150, 200, 250]),
                 rng.choice(["email", "social_dm", "upwork", "referral"]),
                 "timing" if stage == "Lost" else None, "Demo data: bad timing" if stage == "Lost" else None),
            ).fetchone()
            db.log_activity(conn, "company_added", company_id=cid, body=r["name"])
            db.log_activity(conn, "email_logged", company_id=cid, contact_id=contact["id"], channel="email",
                            body="Sent intro email", meta={"demo": True})
            db.log_activity(conn, "stage_changed", company_id=cid, deal_id=deal["id"], body=f"Moved to {stage}")
            conn.execute(
                "INSERT INTO tasks (title, due_at, company_id, deal_id) VALUES (%s,%s,%s,%s)",
                (f"Follow up with {r['name']}", now + timedelta(days=rng.randint(-2, 5)), cid, deal["id"]),
            )
    print("Demo data inserted (source='demo').")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--write-csv", type=Path, metavar="PATH")
    a = p.parse_args()
    write_csv(a.write_csv) if a.write_csv else seed(a.dry_run)


if __name__ == "__main__":
    main()
