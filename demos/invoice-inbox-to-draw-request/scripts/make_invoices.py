"""Draw the 12 made-up invoice PDFs and the fake emails that carry them.

    uv run python demos/invoice-inbox-to-draw-request/scripts/make_invoices.py

Reads sample-data/invoices.json and writes sample-data/pdfs/*.pdf and sample-data/emails.json.
Three layouts (classic, banded, minimal) so extraction cannot rely on one position for each field.
Every PDF says in its footer that it is a made-up sample for a demo.
"""

from __future__ import annotations

import argparse
import json
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

HERE = Path(__file__).resolve().parent.parent
DATA = HERE / "sample-data"
W, H = A4
FOOTER = "Made-up sample invoice for a software demo. Not a real company, person or transaction."


def money(v: Decimal) -> str:
    return f"£{v:,.2f}"


def totals(lines: list) -> tuple[Decimal, Decimal, Decimal]:
    net = sum((Decimal(str(q)) * Decimal(str(p))).quantize(Decimal("0.01")) for _, q, p in lines)
    vat = (net * Decimal("0.20")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return net, vat, net + vat


def uk_date(iso: str) -> str:
    y, m, d = iso.split("-")
    months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
    return f"{int(d)} {months[int(m) - 1]} {y}"


def line_table(c: canvas.Canvas, top: float, lines: list, accent, banded: bool) -> float:
    x0, x1, x2, x3 = 20 * mm, 120 * mm, 145 * mm, W - 20 * mm
    c.setFillColor(accent if banded else colors.black)
    if banded:
        c.rect(x0 - 2 * mm, top - 2 * mm, x3 - x0 + 4 * mm, 8 * mm, fill=1, stroke=0)
        c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(x0, top, "Description")
    c.drawRightString(x2 - 5 * mm, top, "Qty")
    c.drawRightString(x2 + 18 * mm, top, "Unit price")
    c.drawRightString(x3, top, "Line total")
    c.setFillColor(colors.black)
    if not banded:
        c.line(x0, top - 3 * mm, x3, top - 3 * mm)
    y = top - 9 * mm
    c.setFont("Helvetica", 9)
    for desc, q, p in lines:
        lt = (Decimal(str(q)) * Decimal(str(p))).quantize(Decimal("0.01"))
        c.drawString(x0, y, desc)
        c.drawRightString(x2 - 5 * mm, y, str(q))
        c.drawRightString(x2 + 18 * mm, y, money(Decimal(str(p))))
        c.drawRightString(x3, y, money(lt))
        y -= 7 * mm
    _ = x1
    return y


def totals_block(c: canvas.Canvas, y: float, inv: dict, label_total: str) -> None:
    net, vat, total = totals(inv["lines"])
    x = W - 20 * mm
    c.line(115 * mm, y + 3 * mm, x, y + 3 * mm)
    c.setFont("Helvetica", 9)
    for label, v in (("Subtotal", net), ("VAT at 20%", vat)):
        y -= 6 * mm
        c.drawString(120 * mm, y, label)
        c.drawRightString(x, y, money(v))
    y -= 9 * mm
    c.setFont("Helvetica-Bold", 12)
    c.drawString(120 * mm, y, label_total)
    c.drawRightString(x, y, money(total))


def footer(c: canvas.Canvas, sup: dict) -> None:
    c.setFont("Helvetica", 7.5)
    c.setFillColor(colors.grey)
    c.drawString(
        20 * mm,
        22 * mm,
        f"Pay by bank transfer within 30 days. {sup['name']} · VAT reg {sup['vat']} · Company no. 00000000",
    )
    c.drawString(20 * mm, 17 * mm, FOOTER)
    c.setFillColor(colors.black)


def draw_classic(c, inv, sup, builder):
    accent = colors.HexColor(sup["colour"])
    c.setFillColor(accent)
    c.setFont("Helvetica-Bold", 20)
    c.drawString(20 * mm, H - 28 * mm, sup["name"])
    c.setFillColor(colors.black)
    c.setFont("Helvetica", 9)
    c.drawString(20 * mm, H - 35 * mm, sup["address"])
    c.drawString(20 * mm, H - 40 * mm, f"{sup['email']}  ·  {sup['phone']}")
    c.setFont("Helvetica-Bold", 16)
    c.drawRightString(W - 20 * mm, H - 28 * mm, "INVOICE")
    c.setFont("Helvetica", 9)
    rows = [
        ("Invoice no.", inv["number"] or ""),
        ("Invoice date", uk_date(inv["date"])),
        ("Terms", "30 days"),
    ]
    y = H - 36 * mm
    for k, v in rows:
        c.drawRightString(W - 50 * mm, y, k)
        c.drawRightString(W - 20 * mm, y, v)
        y -= 5 * mm
    c.setFont("Helvetica-Bold", 9)
    c.drawString(20 * mm, H - 58 * mm, "Invoice to")
    c.drawString(110 * mm, H - 58 * mm, f"{inv['project_label']}")
    c.setFont("Helvetica", 9)
    c.drawString(20 * mm, H - 63 * mm, builder["name"])
    c.drawString(20 * mm, H - 68 * mm, builder["address"])
    c.drawString(110 * mm, H - 63 * mm, inv["project_text"])
    y = line_table(c, H - 85 * mm, inv["lines"], accent, banded=False)
    totals_block(c, y - 2 * mm, inv, "Total due")


def draw_banded(c, inv, sup, builder):
    accent = colors.HexColor(sup["colour"])
    c.setFillColor(accent)
    c.rect(0, H - 45 * mm, W, 45 * mm, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(20 * mm, H - 22 * mm, sup["name"].upper())
    c.setFont("Helvetica", 9)
    c.drawString(20 * mm, H - 30 * mm, sup["address"])
    c.drawString(20 * mm, H - 35 * mm, f"{sup['phone']}  ·  {sup['email']}")
    c.setFont("Helvetica-Bold", 11)
    c.drawRightString(W - 20 * mm, H - 22 * mm, "TAX INVOICE")
    c.setFont("Helvetica", 9)
    c.drawRightString(W - 20 * mm, H - 30 * mm, f"No. {inv['number']}")
    c.drawRightString(
        W - 20 * mm, H - 35 * mm, f"Dated {inv['date'][8:10]}/{inv['date'][5:7]}/{inv['date'][0:4]}"
    )
    c.setFillColor(colors.black)
    c.setFont("Helvetica", 9)
    c.drawString(20 * mm, H - 58 * mm, f"Customer: {builder['name']}, {builder['address']}")
    c.drawString(20 * mm, H - 64 * mm, f"{inv['project_label']}: {inv['project_text']}")
    y = line_table(c, H - 80 * mm, inv["lines"], accent, banded=True)
    totals_block(c, y - 2 * mm, inv, "Amount payable")


def draw_minimal(c, inv, sup, builder):
    c.setFont("Helvetica-Bold", 13)
    c.drawString(20 * mm, H - 25 * mm, sup["name"])
    c.setFont("Helvetica", 8.5)
    c.drawString(20 * mm, H - 31 * mm, f"{sup['address']} | {sup['email']}")
    c.setFont("Helvetica", 9)
    y = H - 48 * mm
    fields = [
        ("Bill to", builder["name"]),
        (inv["project_label"], inv["project_text"]),
        ("Our ref", inv["number"]),
        ("Tax point", uk_date(inv["date"])),
    ]
    if inv.get("remark"):
        fields.append(("Note", inv["remark"]))
    for k, v in fields:
        c.setFillColor(colors.grey)
        c.drawString(20 * mm, y, k.upper())
        c.setFillColor(colors.black)
        c.drawString(50 * mm, y, v)
        y -= 6 * mm
    y = line_table(c, y - 8 * mm, inv["lines"], colors.black, banded=False)
    totals_block(c, y - 2 * mm, inv, "Balance due")


LAYOUTS = {"classic": draw_classic, "banded": draw_banded, "minimal": draw_minimal}


def file_name(inv: dict, sup_key: str) -> str:
    ref = (inv["number"] or "no-number").replace("/", "-")
    return f"{inv['id']}-{sup_key}-{ref}.pdf"


def build(data: dict, out_dir: Path) -> list[dict]:
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("*.pdf"):
        old.unlink()
    emails = []
    for inv in data["invoices"]:
        sup = data["suppliers"][inv["supplier"]]
        name = file_name(inv, inv["supplier"])
        c = canvas.Canvas(str(out_dir / name), pagesize=A4, invariant=1)
        c.setTitle(f"Invoice {inv['number'] or ''} (demo)")
        c.setAuthor("Demo data")
        LAYOUTS[sup["layout"]](c, inv, sup, data["builder"])
        footer(c, sup)
        c.showPage()
        c.save()
        reminder = inv.get("copy_of")
        subject = (
            f"Reminder: invoice {inv['number']} still unpaid"
            if reminder
            else f"Invoice {inv['number']}".strip()
            if inv["number"]
            else "Invoice attached"
        )
        emails.append(
            {
                "id": f"msg-{inv['id']}",
                "received": f"{inv['date']}T09:{int(inv['id']):02d}:00Z"
                if not reminder
                else "2026-10-27T08:15:00Z",
                "from": sup["email"],
                "to": data["builder"]["accounts_email"],
                "subject": subject,
                "body": "Please find our invoice attached. (Made-up email for a demo.)",
                "attachments": [f"pdfs/{name}"],
            }
        )
    emails.sort(key=lambda e: e["received"])
    return emails


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--data", default=str(DATA / "invoices.json"))
    args = ap.parse_args()
    data = json.loads(Path(args.data).read_text())
    emails = build(data, DATA / "pdfs")
    (DATA / "emails.json").write_text(
        json.dumps(
            {"_note": "Made-up emails for a demo; example.com addresses only.", "emails": emails},
            indent=2,
        )
        + "\n"
    )
    print(f"Wrote {len(emails)} PDFs to {DATA / 'pdfs'} and {DATA / 'emails.json'}")
    for inv in data["invoices"]:
        print(
            f"  {inv['id']}  {data['suppliers'][inv['supplier']]['name']:<32} {inv['number'] or '(no number)':<12} {money(totals(inv['lines'])[2]):>11}  expect {inv['expect']['status']}"
        )


if __name__ == "__main__":
    main()
