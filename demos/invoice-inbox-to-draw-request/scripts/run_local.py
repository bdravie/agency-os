"""Invoice inbox to draw request (demo): run the whole flow on this Mac, with local stand-ins for Google.

    uv run python demos/invoice-inbox-to-draw-request/scripts/run_local.py reset
    uv run python demos/invoice-inbox-to-draw-request/scripts/run_local.py inbox      # the Make.com part
    uv run python demos/invoice-inbox-to-draw-request/scripts/run_local.py approve    # demo stand-in for the admin
    uv run python demos/invoice-inbox-to-draw-request/scripts/run_local.py draw --project MILL --month 2026-10
    uv run python demos/invoice-inbox-to-draw-request/scripts/run_local.py show

What is real here: the Claude extraction (Haiku reads each PDF; replies cached in .cache/invoice-extract/)
and every rule (apps-script/Logic.gs, run through Node). What stands in: the Gmail inbox is
sample-data/emails.json, the Drive is output/invoice-draw/drive/, and the Sheet is output/invoice-draw/.
Nothing is sent anywhere except the PDF to the Claude API.
"""

from __future__ import annotations

import argparse
import base64
import csv
import hashlib
import json
import re
import shutil
import subprocess
import sys
from datetime import date, datetime
from pathlib import Path

DEMO = Path(__file__).resolve().parent.parent
ROOT = DEMO.parent.parent
SAMPLE = DEMO / "sample-data"
OUT = ROOT / "output" / "invoice-draw"
CACHE = ROOT / ".cache" / "invoice-extract"
PROMPT = ROOT / "prompts" / "invoice-extract.md"
BRIDGE = DEMO / "scripts" / "sheet_logic.mjs"
MODEL = "haiku"

# The JSON the model must return. Make.com sends the same schema (make/claude-request-body.json).
SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": [
        "vendor",
        "invoice_number",
        "invoice_date",
        "amount",
        "currency",
        "project",
        "unclear",
    ],
    "properties": {
        "vendor": {"type": ["string", "null"]},
        "invoice_number": {"type": ["string", "null"]},
        "invoice_date": {"type": ["string", "null"], "description": "YYYY-MM-DD"},
        "amount": {"type": ["number", "null"], "description": "Total payable including VAT"},
        "currency": {"type": ["string", "null"]},
        "project": {"type": ["string", "null"]},
        "unclear": {"type": "array", "items": {"type": "string"}},
    },
}


# ---------------------------------------------------------------- the rules (Logic.gs)


def logic(fn: str, *args):
    """Call one function in apps-script/Logic.gs and return its result."""
    res = subprocess.run(
        ["node", str(BRIDGE)],
        input=json.dumps({"fn": fn, "args": list(args)}),
        capture_output=True,
        text=True,
        check=False,
    )
    if res.returncode != 0:
        sys.exit(f"Logic.gs {fn} failed: {res.stderr.strip()}")
    return json.loads(res.stdout)


def projects() -> list[dict]:
    return logic("DEMO_PROJECTS")


# ---------------------------------------------------------------- the local "sheet"


def load_tracker() -> list[dict]:
    f = OUT / "tracker.json"
    return json.loads(f.read_text()) if f.exists() else []


def save_tracker(rows: list[dict]) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "tracker.json").write_text(json.dumps(rows, indent=2) + "\n")
    headers = logic("TRACKER_HEADERS")
    fields = logic("TRACKER_FIELDS")
    with open(OUT / "Tracker.csv", "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(headers)
        for r in rows:
            w.writerow([r.get(fields[h], "") for h in headers])


def write_grid(name: str, grid: list[list]) -> Path:
    path = OUT / f"{name}.csv"
    with open(path, "w", newline="") as fh:
        csv.writer(fh).writerows(grid)
    return path


# ---------------------------------------------------------------- Claude


def prompt_text() -> str:
    lines = [f"- {p['code']}: {p['name']}, site {p['site']}" for p in projects()]
    return PROMPT.read_text().replace("{{PROJECTS}}", "\n".join(lines))


def request_body(pdf: bytes, text: str, model_id: str) -> dict:
    """The Messages API request. The Make.com HTTP module sends this same body."""
    return {
        "model": model_id,
        "max_tokens": 2000,
        "output_config": {"format": {"type": "json_schema", "schema": SCHEMA}},
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "document",
                        "source": {
                            "type": "base64",
                            "media_type": "application/pdf",
                            "data": base64.standard_b64encode(pdf).decode(),
                        },
                    },
                    {"type": "text", "text": text},
                ],
            }
        ],
    }


def extract(pdf_path: Path, fresh: bool = False) -> tuple[dict, str]:
    """Return (fields, where it came from). Replies are cached so re-running the demo is free."""
    from agency import llm

    pdf = pdf_path.read_bytes()
    text = prompt_text()
    model_id = llm.resolve_model(MODEL)
    key = hashlib.sha256(
        pdf + text.encode() + model_id.encode() + json.dumps(SCHEMA).encode()
    ).hexdigest()[:24]
    cached = CACHE / f"{key}.json"
    if cached.exists() and not fresh:
        return json.loads(cached.read_text()), "cache"

    msg = llm.client().messages.create(**request_body(pdf, text, model_id))
    if msg.stop_reason == "refusal":
        raise RuntimeError(f"Claude declined {pdf_path.name}")
    reply = "".join(b.text for b in msg.content if b.type == "text").strip()
    m = re.search(r"\{.*\}", reply, re.DOTALL)
    if not m:
        raise RuntimeError(f"No JSON in the reply for {pdf_path.name}: {reply[:200]}")
    fields = json.loads(m.group(0))
    CACHE.mkdir(parents=True, exist_ok=True)
    cached.write_text(json.dumps(fields, indent=2))
    u = msg.usage
    return fields, f"Claude {model_id}, {u.input_tokens} in / {u.output_tokens} out"


def from_answer_key(pdf_name: str) -> dict:
    """--no-llm: read the fields from the answer key instead (free, offline; shows the rules only)."""
    data = json.loads((SAMPLE / "invoices.json").read_text())
    inv = next(i for i in data["invoices"] if pdf_name.startswith(i["id"] + "-"))
    net = sum(round(q * p, 2) for _, q, p in inv["lines"])
    return {
        "vendor": data["suppliers"][inv["supplier"]]["name"],
        "invoice_number": inv["number"] or None,
        "invoice_date": inv["date"],
        "amount": round(net * 1.2, 2),
        "currency": "GBP",
        "project": inv["expect"]["project"] or inv["project_text"],
        "unclear": [] if inv["number"] else ["no invoice number printed"],
    }


# ---------------------------------------------------------------- the Make.com part


def safe(s: str) -> str:
    return re.sub(r"[^\w .&-]+", "", s).strip()


def cmd_inbox(args) -> None:
    emails = json.loads((SAMPLE / "emails.json").read_text())["emails"]
    rows = load_tracker()
    done = {r.get("msg_id") for r in rows}
    plist = projects()
    new = [e for e in emails if e["id"] not in done][: args.limit or None]
    if not new:
        print("No new emails under the label. (Run `reset` to start again.)")
        return
    print(f"Watch emails: {len(new)} new email(s) under the 'invoices-demo' label\n")
    for e in new:
        for att in e["attachments"]:
            pdf_path = SAMPLE / att
            fields, source = (
                (from_answer_key(pdf_path.name), "answer key (--no-llm)")
                if args.no_llm
                else extract(pdf_path, fresh=args.fresh)
            )
            code = logic("matchProject", fields.get("project"), plist)
            folder = next(
                (f"{p['code']} - {p['name']}" for p in plist if p["code"] == code), "_Needs review"
            )
            fname = (
                safe(
                    f"{fields.get('invoice_date') or 'no date'} {fields.get('vendor') or 'unknown'} "
                    f"{fields.get('invoice_number') or 'no number'}"
                )
                + ".pdf"
            )
            dest = OUT / "drive" / folder / fname
            dest.parent.mkdir(parents=True, exist_ok=True)
            n = 2
            while dest.exists():  # Drive keeps both copies of a resent PDF; so does the stand-in
                fname = f"{Path(fname).stem.rsplit(' (', 1)[0]} ({n}).pdf"
                dest, n = dest.with_name(fname), n + 1
            shutil.copyfile(pdf_path, dest)

            rows.append(
                {
                    "msg_id": e["id"],
                    "received": e["received"][:16].replace("T", " "),
                    "from": e["from"],
                    "subject": e["subject"],
                    "file": fname,
                    "drive_link": f"drive/{folder}/{fname}",
                    "vendor": fields.get("vendor") or "",
                    "invoice_number": fields.get("invoice_number") or "",
                    "invoice_date": fields.get("invoice_date") or "",
                    "amount": fields.get("amount") if fields.get("amount") is not None else "",
                    "project": fields.get("project") or "",
                    "extraction_notes": "; ".join(fields.get("unclear") or []),
                    "status": "New",
                    "notes": "",
                    "draw_no": "",
                    "checked_at": "",
                }
            )
            # Make then calls the sheet's web address, which runs checkNewRows (Code.gs doGet).
            for u in logic("checkNewRows", rows, plist, date.today().isoformat()):
                r = rows[u["index"]]
                r.update(
                    status=u["status"],
                    notes=u["notes"],
                    project=u["project"],
                    checked_at=datetime.now().strftime("%Y-%m-%d %H:%M"),
                )
            r = rows[-1]
            print(f"  {e['subject'][:38]:<38} -> {folder}/  [{source}]")
            print(
                f"      {r['vendor']} | {r['invoice_number'] or '(none)'} | {r['invoice_date']} | "
                f"{'£{:,.2f}'.format(float(r['amount'])) if r['amount'] != '' else '(no amount)'} | {r['project']} => {r['status']}{'  ' + r['notes'] if r['notes'] else ''}"
            )
    save_tracker(rows)
    compare_with_answer_key(rows)
    print(f"\nTracker: {OUT / 'Tracker.csv'}\nDrive:   {OUT / 'drive'}")


def compare_with_answer_key(rows: list[dict]) -> None:
    data = json.loads((SAMPLE / "invoices.json").read_text())
    by_id = {f"msg-{i['id']}": i for i in data["invoices"]}
    misses = []
    for r in rows:
        inv = by_id.get(r["msg_id"])
        if not inv:
            continue
        net = sum(round(q * p, 2) for _, q, p in inv["lines"])
        want = {
            "invoice_number": inv["number"],
            "invoice_date": inv["date"],
            "amount": round(net * 1.2, 2),
            "status": inv["expect"]["status"],
        }
        if inv["expect"]["project"]:
            want["project"] = inv["expect"]["project"]
        for k, v in want.items():
            got = r[k]
            if k == "amount":
                ok = got != "" and abs(float(got) - v) < 0.005
            else:
                ok = str(got or "") == str(v or "")
            if not ok:
                misses.append(f"  {inv['id']} {k}: got {got!r}, expected {v!r}")
    print(f"\nAnswer key: {len(rows)} invoice(s) checked, {len(misses)} difference(s)")
    for m in misses:
        print(m)


# ---------------------------------------------------------------- the Apps Script part


def cmd_approve(_args) -> None:
    rows = load_tracker()
    n = 0
    for r in rows:
        if r["status"] == "Ready":
            r["status"] = "Approved"
            n += 1
    save_tracker(rows)
    print(f"{n} Ready row(s) set to Approved (demo stand-in for the admin approving by hand).")


def cmd_draw(args) -> None:
    rows = load_tracker()
    for i, r in enumerate(rows):
        r["_row"] = i + 2  # the sheet row number, for the exceptions list
    code, month = args.project.upper(), args.month
    plan = logic("planDraw", rows, projects(), code, month)
    exc = write_grid("Draw exceptions", logic("exceptionRows", plan, code, month))
    if not plan["ok"]:
        print(plan["message"])
        print(f"Exceptions: {exc}")
        return
    template = logic("DEMO_TEMPLATE")
    lay = logic("layoutDraw", template, plan, date.today().isoformat())
    name = f"Draw {plan['draw_no']}"
    if (OUT / f"{name}.csv").exists():
        sys.exit(f'"{name}" already exists.')
    path = write_grid(name, lay["grid"])
    for line in plan["lines"]:
        rows[line["index"]]["draw_no"] = plan["draw_no"]
    for r in rows:
        r.pop("_row", None)
    save_tracker(rows)

    print(
        f"{name}: {len(plan['lines'])} invoice(s), total {logic('poundsText', plan['total_pence'])}"
    )
    for line in plan["lines"]:
        print(
            f"  {line['invoice_date']}  {line['vendor']:<30} {line['invoice_number']:<10} "
            f"{logic('poundsText', line['amount_pence']):>11}"
        )
    print(f"Rows stamped {plan['draw_no']}; they will not appear in a later draw.")
    print(f"\n{len(plan['exceptions'])} exception(s):")
    for e in plan["exceptions"]:
        print(f"  row {e['row']}: {e['vendor']} {e['invoice_number'] or '(none)'}: {e['reason']}")
    print(f"\nDraw tab: {path}\nExceptions tab: {exc}")


def cmd_show(_args) -> None:
    rows = load_tracker()
    if not rows:
        print("Tracker is empty.")
        return
    print(
        f"{'#':>2}  {'Vendor':<31}{'Invoice no':<13}{'Date':<11}{'Amount':>11}  {'Proj':<14}{'Status':<10}{'Draw':<9}Notes"
    )
    for i, r in enumerate(rows, start=2):
        amt = f"£{float(r['amount']):,.2f}" if r["amount"] != "" else ""
        print(
            f"{i:>2}  {r['vendor'][:30]:<31}{(r['invoice_number'] or '(none)'):<13}{r['invoice_date']:<11}{amt:>11}  "
            f"{r['project'][:13]:<14}{r['status']:<10}{r['draw_no']:<9}{r['notes']}"
        )


def cmd_make_body(_args) -> None:
    """Write the exact request body for Make.com's Claude 'Make an API Call' module."""
    from agency import llm

    body = request_body(b"", prompt_text(), llm.resolve_model(MODEL))
    # The scenario's variable holding the PDF as standard base64 (module 10, see make/scenario.md).
    body["messages"][0]["content"][0]["source"]["data"] = "{{10.pdf_base64}}"
    out = DEMO / "make" / "claude-request-body.json"
    out.write_text(json.dumps(body, indent=2, ensure_ascii=False) + "\n")
    print(
        f"Wrote {out} (the PDF goes where the {{{{...}}}} placeholder is; see make/scenario.md step 3)."
    )


def cmd_reset(_args) -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    print(f"Cleared {OUT} (the cached Claude replies in {CACHE} are kept).")


def main() -> None:
    ap = argparse.ArgumentParser(description="Invoice inbox to draw request (demo), run locally.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("inbox", help="read new emails, extract, file and log each PDF")
    p.add_argument(
        "--no-llm", action="store_true", help="use the answer key instead of Claude (free, offline)"
    )
    p.add_argument("--fresh", action="store_true", help="ignore cached Claude replies")
    p.add_argument("--limit", type=int, default=0, help="only this many emails")
    p.set_defaults(fn=cmd_inbox)
    sub.add_parser("approve", help="demo: set every Ready row to Approved").set_defaults(
        fn=cmd_approve
    )
    p = sub.add_parser("draw", help="generate a draw for one project and month")
    p.add_argument("--project", required=True)
    p.add_argument("--month", required=True, help="YYYY-MM")
    p.set_defaults(fn=cmd_draw)
    sub.add_parser("show", help="print the tracker").set_defaults(fn=cmd_show)
    sub.add_parser("reset", help="empty the local sheet and drive").set_defaults(fn=cmd_reset)
    sub.add_parser("make-body", help="write make/claude-request-body.json").set_defaults(
        fn=cmd_make_body
    )
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
