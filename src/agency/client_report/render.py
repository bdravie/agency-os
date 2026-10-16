"""Render the report as an email-safe HTML page (tables and inline CSS only) and as a PDF."""

from __future__ import annotations

from dataclasses import dataclass
from html import escape
from pathlib import Path

from agency.client_report import metrics as m
from agency.client_report.summary import Commentary

GOOD, BAD, FLAT = "#1a7f4b", "#c0392b", "#6b7280"


@dataclass
class Brand:
    name: str = "Your Agency"
    colour: str = "#2f5bea"


def _tone(met: m.Metric, change: float | None) -> str:
    v = m.is_good(met, change)
    return FLAT if v is None else GOOD if v else BAD


def _arrow(change: float | None) -> str:
    return "–" if change is None or abs(change) < 0.01 else "▲" if change > 0 else "▼"


def html_email(a: dict, c: Commentary, client: str, brand: Brand) -> str:
    t = a["totals"]
    tiles = "".join(
        f'<td style="padding:12px;background:#f5f7fb;border-radius:8px;text-align:center;width:25%">'
        f'<div style="font-size:12px;color:#6b7280">{escape(met.label)}</div>'
        f'<div style="font-size:22px;font-weight:700">{escape(m.fmt(t[met.key]["cur"], met.kind))}</div>'
        f'<div style="font-size:12px;color:{_tone(met, t[met.key]["change"])}">{_arrow(t[met.key]["change"])} {m.fmt_change(t[met.key]["change"])}</div></td>'
        for met in [x for x in m.METRICS if x.key in ("spend_gbp", "revenue_gbp", "roas", "conversions")]
    )
    def channel_rows() -> str:
        rows = ""
        for ch, b in a["channels"].items():
            for met in m.METRICS:
                d = b[met.key]
                rows += (f'<tr><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">{escape(ch)} · {escape(met.label)}</td>'
                         f'<td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right">{escape(m.fmt(d["cur"], met.kind))}</td>'
                         f'<td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;color:{_tone(met, d["change"])}">{_arrow(d["change"])} {m.fmt_change(d["change"])}</td></tr>')
        return rows
    ul = lambda items: "<ul style='margin:6px 0 0;padding-left:20px'>" + "".join(f"<li style='margin-bottom:4px'>{escape(i)}</li>" for i in items) + "</ul>"
    top = max(x["roas"] or 0 for x in a["trend"]) or 1
    bars = "".join(
        f'<tr><td style="width:90px;font-size:12px;color:#6b7280">{escape(x["week"])}</td><td>'
        f'<div style="background:{brand.colour};height:10px;width:{int(100 * (x["roas"] or 0) / top)}%;border-radius:5px"></div></td>'
        f'<td style="width:60px;text-align:right;font-size:12px">{escape(m.fmt(x["roas"], "ratio"))}</td></tr>'
        for x in a["trend"]
    )
    return f"""<!doctype html><html lang="en-GB"><body style="margin:0;background:#eef1f6;font-family:Arial,Helvetica,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden">
<tr><td style="background:{brand.colour};color:#fff;padding:20px 28px"><div style="font-size:13px;opacity:.85">{escape(brand.name)}</div>
<div style="font-size:22px;font-weight:700">Weekly report: {escape(client)}</div>
<div style="font-size:13px;opacity:.85">Week starting {escape(a["week"])} · compared with {escape(a["prev_week"])}</div></td></tr>
<tr><td style="padding:24px 28px">
<p style="font-size:15px;line-height:1.5;margin:0 0 16px">{escape(c.summary)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="8"><tr>{tiles}</tr></table>
<h3 style="margin:20px 0 0;color:{GOOD}">Wins</h3>{ul(c.wins)}
<h3 style="margin:20px 0 0;color:{BAD}">Concerns</h3>{ul(c.concerns)}
<h3 style="margin:20px 0 0">Next actions</h3>{ul(c.actions)}
<h3 style="margin:24px 0 8px">ROAS by week</h3><table role="presentation" width="100%" cellpadding="2" cellspacing="0">{bars}</table>
<h3 style="margin:24px 0 8px">By channel</h3>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px">{channel_rows()}</table>
</td></tr>
<tr><td style="padding:16px 28px;background:#f5f7fb;font-size:12px;color:#6b7280">Prepared by {escape(brand.name)}. Figures are calculated directly from your ad platform exports.</td></tr>
</table></td></tr></table></body></html>"""


def pdf(a: dict, c: Commentary, client: str, brand: Brand, path: Path) -> None:
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import mm
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    except ImportError as err:  # pragma: no cover
        raise RuntimeError("PDF output needs reportlab: run `uv sync`") from err

    ss = getSampleStyleSheet()
    accent = colors.HexColor(brand.colour)
    h = ParagraphStyle("h", parent=ss["Heading2"], textColor=accent, spaceBefore=12, spaceAfter=4)
    body = ParagraphStyle("b", parent=ss["BodyText"], fontSize=10, leading=14)
    title = ParagraphStyle("t", parent=ss["Title"], alignment=0, textColor=accent, fontSize=20)
    esc = lambda s: escape(s)
    story = [Paragraph(esc(f"Weekly report: {client}"), title),
             Paragraph(esc(f"{brand.name} · week starting {a['week']} (vs {a['prev_week']})"), body), Spacer(1, 8),
             Paragraph(esc(c.summary), body)]

    t = a["totals"]
    kpi = [["Metric", "This week", "Last week", "Change"]]
    for met in m.METRICS:
        d = t[met.key]
        kpi.append([met.label, m.fmt(d["cur"], met.kind), m.fmt(d["prev"], met.kind), m.fmt_change(d["change"])])
    table = Table(kpi, colWidths=[60 * mm, 38 * mm, 38 * mm, 30 * mm])
    style = [("BACKGROUND", (0, 0), (-1, 0), accent), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
             ("FONTSIZE", (0, 0), (-1, -1), 9), ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
             ("GRID", (0, 0), (-1, -1), 0.25, colors.lightgrey)]
    for i, met in enumerate(m.METRICS, start=1):
        style.append(("TEXTCOLOR", (3, i), (3, i), colors.HexColor(_tone(met, t[met.key]["change"]))))
    table.setStyle(TableStyle(style))
    story += [Spacer(1, 10), table]

    for heading, items in (("Wins", c.wins), ("Concerns", c.concerns), ("Next actions", c.actions)):
        story.append(Paragraph(heading, h))
        story += [Paragraph("• " + esc(i), body) for i in items]

    story.append(Paragraph("By channel", h))
    rows = [["Channel", "Spend", "Revenue", "ROAS", "Conv.", "Cost / conv."]]
    for ch, b in a["channels"].items():
        rows.append([ch, m.fmt(b["spend_gbp"]["cur"], "gbp"), m.fmt(b["revenue_gbp"]["cur"], "gbp"),
                     m.fmt(b["roas"]["cur"], "ratio"), m.fmt(b["conversions"]["cur"], "int"), m.fmt(b["cpa"]["cur"], "gbp2")])
    ct = Table(rows)
    ct.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), accent), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                            ("FONTSIZE", (0, 0), (-1, -1), 9), ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
                            ("GRID", (0, 0), (-1, -1), 0.25, colors.lightgrey)]))
    story.append(ct)
    SimpleDocTemplate(str(path), pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm,
                      bottomMargin=16 * mm, title=f"Weekly report: {client}", author=brand.name).build(story)
