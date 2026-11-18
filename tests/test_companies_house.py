import httpx

from agency import companies_house as ch


def fake_page(n: int, start: int) -> dict:
    return {"items": [{"company_name": f"ACME DIGITAL {start + i} LTD", "company_number": f"{10000000 + start + i}",
                       "registered_office_address": {"address_line_1": "1 High St", "locality": "London", "postal_code": "N1 1AA"},
                       "sic_codes": ["73110"]} for i in range(n)]}


def test_search_pages_and_limits():
    calls = []

    def handler(req: httpx.Request) -> httpx.Response:
        calls.append(dict(req.url.params))
        start = int(req.url.params["start_index"])
        return httpx.Response(200, json=fake_page(min(100, 250 - start), start))

    client = httpx.Client(base_url=ch.API, transport=httpx.MockTransport(handler))
    found, n = ch.search(client, ["73110"], "London", 150, 2, sleep=lambda s: None)
    assert len(found) == 150 and n == 2
    assert calls[0]["company_status"] == "active" and calls[0]["company_type"] == "ltd,llp,plc"
    assert calls[0]["location"] == "London" and "incorporated_to" in calls[0]
    assert found[0]["name"] == "Acme Digital 0 Ltd" and found[0]["postcode"] == "N1 1AA"


def test_search_stops_when_no_more_results():
    client = httpx.Client(base_url=ch.API, transport=httpx.MockTransport(
        lambda req: httpx.Response(200, json=fake_page(3, 0) if req.url.params["start_index"] == "0" else {"items": []})))
    found, n = ch.search(client, ["73110"], None, 100, 2, sleep=lambda s: None)
    assert len(found) == 3 and n == 2


def test_only_generic_emails_on_own_domain():
    html = "Email info@acme.co.uk or jane.smith@acme.co.uk or hello@gmail.com or Contact@Acme.co.uk"
    assert ch.generic_emails(html, "acme.co.uk") == ["contact@acme.co.uk", "info@acme.co.uk"]


def test_only_active_niches_are_searched():
    from agency.core.niches import niche_status, source_block

    table = {"dental": {"status": "active"}, "property_developers": {"status": "seeding"}, "beauty": {"status": "audience"},
             "hvac": {"status": "parked"}, "old": {}, "odd": {"status": "live"}}
    assert source_block(table, "dental") is None
    assert "seeding" in source_block(table, "property_developers")
    assert "audience" in source_block(table, "beauty")
    for key in ("hvac", "old", "odd", "missing", None):   # no status, an unknown one or an unknown niche counts as parked
        assert niche_status(table, key) == "parked"
        assert "parked" in source_block(table, key)


def test_off_niche_matches_the_crm_rule():
    """Runs the shared cases in tests/fixtures/niche_relevance_cases.json, which crm/tests/nicheRelevance.test.mjs runs too."""
    import json
    from pathlib import Path

    from agency.core.niches import has_keyword, off_niche_reason, relevance_rules

    fx = json.loads((Path(__file__).parent / "fixtures" / "niche_relevance_cases.json").read_text())
    rules = relevance_rules({"name_includes": fx["rules"]["include"], "name_excludes": fx["rules"]["exclude"], "name_excludes_always": fx["rules"]["always"]})

    def expected(flag):
        if flag is None:
            return None
        return f'Looks off-niche: the name says "{flag[5:]}"' if flag.startswith("name:") else f'Looks off-niche: Google lists it as "{flag[9:]}"'

    for c in fx["cases"]:
        assert off_niche_reason(c["name"], c["categories"], rules) == expected(c["flag"]), c["name"]
    assert off_niche_reason(fx["no_rules"]["name"], [], relevance_rules(None)) is None
    assert relevance_rules({"name_excludes": "hair"}) == {"include": [], "exclude": [], "always": []}
    assert has_keyword("Chair Studio", "hair") is False
