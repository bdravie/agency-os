"""Demo: event listing to social post queue. Words are checked in code; sample data is made up and business-only."""

import json
import re

import pytest

from agency.config import ROOT
from agency.event_social import posts

DEMO = ROOT / "demos" / "event-listing-to-social-post-queue"
LISTING = {"post_id": 1, "post_title": "Spring Autojumble", "post_start_date": "20270410090000",
           "post_location": "Showground, Builth Wells, Powys", "post_content": "Stalls of parts and kit. Bring cash.",
           "post_url": "https://directory.example.com/events/spring-autojumble"}
GOOD = "FACEBOOK:\nThe Spring Autojumble is on Saturday 10 April 2027, 9am.\n\nINSTAGRAM:\nAutojumble in Builth Wells.\n\nHASHTAGS:\n#autojumble #Powys #bikes"


def test_dates_read_from_directory_format():
    assert posts.when("20270417073000") == "Saturday 17 April 2027, 7:30am"
    assert posts.when("20270619200000") == "Saturday 19 June 2027, 8pm"
    assert posts.card_date("20270417073000") == "Sat 17 Apr 2027"


def test_parse_and_code_adds_link_and_hashtags():
    p = posts.parse(GOOD)
    assert posts.problems(p, LISTING) == []
    out = posts.assemble(p, LISTING)
    assert out["facebook_post"].count(LISTING["post_url"]) == 1 and out["instagram_caption"].count(LISTING["post_url"]) == 1
    assert out["facebook_post"].endswith("#autojumble #Powys #bikes")


def test_parse_needs_every_section():
    with pytest.raises(ValueError):
        posts.parse("FACEBOOK:\nHello\n\nHASHTAGS:\n#a")


@pytest.mark.parametrize("bad, why", [
    ("Book at https://tickets.example.com today.", "link"),
    ("See tickets.example.com for more.", "link"),
    ("Message @someone to book.", "link"),
    ("Entry is 5 pounds on the day.", "figure"),
    ("A great day out #bikes", "hashtag"),
    ("x" * 401, "over 400"),
])
def test_refuses_links_invented_figures_hashtags_and_long_text(bad, why):
    p = posts.Posts(bad, "Autojumble in Builth Wells.", ["#a1", "#b2", "#c3"])
    assert any(why in problem for problem in posts.problems(p, LISTING))


def test_too_few_hashtags_refused():
    assert "fewer than 3 usable hashtags" in posts.problems(posts.Posts("Fine.", "Fine.", ["#one"]), LISTING)


def test_fallback_passes_its_own_checks():
    for listing in json.loads((DEMO / "sample-data" / "listings.json").read_text())["listings"]:
        assert posts.problems(posts.fallback(listing), listing) == []


def test_sample_data_is_what_the_demo_promises():
    rows = json.loads((DEMO / "sample-data" / "listings.json").read_text())["listings"]
    ids = [r["post_id"] for r in rows]
    published = {r["post_id"] for r in rows if r["post_status"] == 1}
    photos = {f.name for f in (DEMO / "sample-data" / "photos").glob("*.jpg")}
    broken = [r for r in rows if r["post_image"].rsplit("/", 1)[-1] not in photos]
    assert len(published) == 9 and len([r for r in rows if r["post_status"] == 0]) == 2
    assert len(ids) - len(set(ids)) == 1            # one listing repeated with the same ID
    assert len(broken) == 1 and broken[0]["post_status"] == 1  # one published listing with a broken photo
    text = json.dumps(rows)
    assert all("example.com" in r["post_url"] for r in rows)
    assert not re.search(r"@|\b0\d{9,10}\b", text)  # no emails, handles or phone numbers: business data only


def test_workflows_are_demo_only_and_never_hold_a_real_address():
    for f in (DEMO / "n8n").glob("*.json"):
        wf = json.loads(f.read_text())
        text = json.dumps(wf)
        assert wf["name"].startswith("Event social demo") and wf["active"] is False
        assert "graph.facebook.com/v" not in text.replace("`https://graph.facebook.com/v27.0`", "")  # only named in a note
        urls = [n["parameters"].get("url", "") for n in wf["nodes"]]
        assert all("127.0.0.1" in u or u.startswith("={{ $('Settings')") for u in urls if u)
