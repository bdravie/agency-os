from datetime import date

from agency import ch_health as h

PROFILE_OK = {
    "company_status": "active", "type": "ltd", "date_of_creation": "2020-02-13", "can_file": True,
    "has_insolvency_history": False, "confirmation_statement": {"next_due": "2027-02-26", "overdue": False},
    "accounts": {"overdue": False, "next_due": "2026-11-30", "last_accounts": {"type": "micro-entity", "made_up_to": "2025-02-28"}},
}


def test_healthy_profile():
    r = h.health_from_profile(PROFILE_OK)
    assert r["filing_ok"] and r["problems"] == [] and r["accounts_type"] == "micro-entity"


def test_overdue_and_dormant_are_flagged():
    bad = {**PROFILE_OK, "confirmation_statement": {"overdue": True}, "accounts": {"overdue": True, "last_accounts": {"type": "dormant"}}}
    r = h.health_from_profile(bad)
    assert not r["filing_ok"]
    assert {"confirmation statement overdue", "accounts overdue", "dormant accounts"} <= set(r["problems"])


def test_strike_off_and_insolvency():
    r = h.health_from_profile({**PROFILE_OK, "company_status_detail": "active-proposal-to-strike-off", "has_insolvency_history": True})
    assert not r["filing_ok"] and "insolvency history" in r["problems"]


IXBRL = """
<xbrli:context id="c1"><xbrli:entity/><xbrli:period><xbrli:instant>2025-02-28</xbrli:instant></xbrli:period></xbrli:context>
<xbrli:context id="p1"><xbrli:entity/><xbrli:period><xbrli:instant>2024-02-29</xbrli:instant></xbrli:period></xbrli:context>
<xbrli:context id="d1"><xbrli:entity><xbrli:segment><xbrldi:explicitMember>x</xbrldi:explicitMember></xbrli:segment></xbrli:entity><xbrli:period><xbrli:instant>2025-02-28</xbrli:instant></xbrli:period></xbrli:context>
<ix:nonFraction name="core:NetAssetsLiabilities" contextRef="c1" scale="0">151,230</ix:nonFraction>
<ix:nonFraction name="core:NetAssetsLiabilities" contextRef="p1">99,000</ix:nonFraction>
<ix:nonFraction name="core:NetAssetsLiabilities" contextRef="d1">5</ix:nonFraction>
<ix:nonFraction name="core:AverageNumberEmployeesDuringPeriod" contextRef="c1">4</ix:nonFraction>
<ix:nonFraction name="core:CashBankOnHand" contextRef="c1" scale="3">12</ix:nonFraction>
<ix:nonFraction name="core:TurnoverRevenue" contextRef="c1" sign="-">1,000</ix:nonFraction>
"""


def test_parse_ixbrl_uses_latest_period_and_scale():
    r = h.parse_ixbrl(IXBRL)
    assert r["net_assets_gbp"] == 151230 and r["employees"] == 4 and r["cash_gbp"] == 12000
    assert r["turnover_gbp"] == -1000  # sign attribute respected


def test_parse_ixbrl_without_data():
    assert h.parse_ixbrl("<html>nothing</html>") == {}


def test_estimate_revenue():
    assert h.estimate_revenue(120000, 2, [50000, 100000]) == (120000, "reported turnover")
    est, basis = h.estimate_revenue(None, 4, [50000, 100000])
    assert est == 300000 and "4 employee" in basis
    assert h.estimate_revenue(None, None, [50000, 100000]) == (None, None)


def test_fit_score_ranks_sensibly():
    today = date(2026, 10, 15)
    solo = {"filing_ok": True, "incorporated_on": "2020-02-13", "accounts_type": "micro-entity", "employees": 1, "net_assets_gbp": 151230}
    team = {"filing_ok": True, "incorporated_on": "2015-01-01", "accounts_type": "small", "employees": 12, "net_assets_gbp": 300000, "cash_gbp": 80000}
    assert h.fit_score(solo, today)[0] < 40 < h.fit_score(team, today)[0]
    s, notes = h.fit_score({"filing_ok": False, "problems": ["accounts overdue"]}, today)
    assert s == 0 and "accounts overdue" in notes[0]
