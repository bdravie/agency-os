from pathlib import Path

import pytest

from agency.client_report import metrics as m, render, summary

SAMPLE = Path(__file__).resolve().parents[1] / "demos/client-report/sample-data/harbour_metrics.csv"


@pytest.fixture(scope="module")
def analysis() -> dict:
    return m.analyse(m.load_csv(SAMPLE))


def test_week_on_week_maths(analysis):
    t = analysis["totals"]
    assert analysis["week"] == "2026-10-05" and analysis["prev_week"] == "2026-09-28"
    assert t["spend_gbp"]["cur"] == 1615 and t["spend_gbp"]["prev"] == 1450
    assert round(t["spend_gbp"]["change"], 4) == round(165 / 1450, 4)
    assert round(t["roas"]["cur"], 2) == 5.10
    meta = analysis["channels"]["Meta Ads"]
    assert round(meta["cpa"]["cur"], 2) == 30.21 and round(meta["conversions"]["change"], 2) == -0.20


def test_zero_division_gives_none():
    assert m.pct_change(5, 0) is None
    assert m.derive({"spend_gbp": 0, "impressions": 0, "clicks": 0, "conversions": 0, "revenue_gbp": 0})["roas"] is None


def test_direction_of_good(analysis):
    cpa = next(x for x in m.METRICS if x.key == "cpa")
    assert m.is_good(cpa, 0.5) is False and m.is_good(cpa, -0.5) is True and m.is_good(cpa, 0.001) is None


def test_bad_csv_is_rejected(tmp_path):
    p = tmp_path / "x.csv"
    p.write_text("week_start,channel\n2026-01-05,Google Ads\n")
    with pytest.raises(ValueError, match="missing columns"):
        m.load_csv(p)


def test_parse_commentary():
    c = summary.parse("SUMMARY:\nOk week.\n\nWINS:\n- a\n- b\n- c\n\nCONCERNS:\n- d\n- e\n\nACTIONS:\n- f\n- g\n- h\n")
    assert (len(c.wins), len(c.concerns), len(c.actions)) == (3, 2, 3)
    with pytest.raises(ValueError):
        summary.parse("SUMMARY:\ntruncated")


def test_invented_figures_are_flagged(analysis):
    facts = m.facts_text(analysis)
    assert summary.unverified_figures("Spend was £1,615 (+11.4%), ROAS 5.10x.", facts) == []
    assert "£9,999" in summary.unverified_figures("Revenue hit £9,999.", facts)


def test_fallback_and_render(analysis, tmp_path):
    c = summary.fallback(analysis)
    html = render.html_email(analysis, c, "Harbour & Co <Interiors>", render.Brand("Test Agency"))
    assert "Harbour &amp; Co &lt;Interiors&gt;" in html and "£1,615" in html
    out = tmp_path / "r.pdf"
    render.pdf(analysis, c, "Harbour", render.Brand(), out)
    assert out.read_bytes().startswith(b"%PDF")
