import asyncio

from agency import icebreakers as ib


def test_finds_columns_however_they_are_spelt():
    headers = ["First Name", "Last Name", "Email Address", "Company Name", "Domain"]
    assert ib.find_column(headers, ib.FIRST_NAME) == "First Name"
    assert ib.find_column(headers, ib.COMPANY) == "Company Name"
    assert ib.find_column(headers, ib.EMAIL) == "Email Address"
    assert ib.find_column(["first_name", "organization_name"], ib.COMPANY) == "organization_name"
    assert ib.find_column(["Name", "Company"], ib.FIRST_NAME) is None
    assert ib.find_column(["Name", "Company"], ib.FULL_NAME) == "Name"
    assert ib.find_column(headers, ib.COMPANY, override="Domain") == "Domain"


def test_the_line_follows_the_template_exactly():
    assert ib.icebreaker(("Nick", "Acme")) == (
        "Hey Nick. Been keeping tabs on Acme for a hot minute, "
        "love what you guys are up to and the broader mission."
    )
    assert ib.icebreaker(None) == ""


def test_reads_the_reply_and_refuses_an_unusable_one():
    assert ib.parse_reply('{"nickname": "Nick", "company": "Acme"}') == ("Nick", "Acme")
    assert ib.parse_reply('```json\n{"nickname": " Nick ", "company": "Acme\\n Data"}\n```') == (
        "Nick",
        "Acme Data",
    )
    assert ib.parse_reply("Nick at Acme") is None
    assert ib.parse_reply('{"nickname": "", "company": "Acme"}') is None
    assert ib.parse_reply('{"nickname": "Nick", "company": 7}') is None
    assert ib.parse_reply('{"nickname": "Nick", "company": "{company}"}') is None
    assert ib.parse_reply('{"nickname": "Nick", "company": "' + "A" * 61 + '"}') is None
    assert ib.parse_reply("[1, 2]") is None


def test_suppressed_by_email_its_domain_or_the_company_domain():
    emails, domains = {"jo@blocked.example"}, {"optedout.example"}
    assert ib.is_suppressed("Jo@Blocked.example", "", emails, domains)
    assert ib.is_suppressed("sam@optedout.example", "", emails, domains)
    assert ib.is_suppressed("", "https://www.OptedOut.example/about", emails, domains)
    assert not ib.is_suppressed("sam@fine.example", "fine.example", emails, domains)
    assert not ib.is_suppressed("", "", emails, domains)


def test_asks_about_every_pair_and_never_more_than_the_limit_at_once():
    running = peak = 0

    async def ask(first: str, company: str):
        nonlocal running, peak
        running += 1
        peak = max(peak, running)
        await asyncio.sleep(0.01)
        running -= 1
        return None if first == "Bad" else (first[:3], company.title())

    pairs = [(f"Name{i}", "ACME") for i in range(12)] + [("Bad", "ACME")]
    result = asyncio.run(ib.name_all(pairs, ask, concurrency=4))
    assert len(result) == 13
    assert result[("Name0", "ACME")] == ("Nam", "Acme")
    assert result[("Bad", "ACME")] is None
    assert 1 < peak <= 4


def test_saves_to_the_enriched_folder_under_the_same_name(tmp_path):
    source = tmp_path / "Blitz, Estate Agents, Nov 27 2026.csv"
    assert ib.default_output(source) == ib.ENRICHED / "Blitz, Estate Agents, Nov 27 2026.csv"
