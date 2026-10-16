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
