from agency import seed_offers as s
from agency.core.niches import offers

CORE = ["AI Opportunity Audit", "Build", "Team Enablement", "Optimise Retainer"]


def test_yaml_offers_are_all_valid():
    for o in offers():
        assert s.validate(o) == [], (o.get("name"), s.validate(o))


def test_the_four_core_offers_exist_with_the_right_billing():
    by_name = {o["name"]: o for o in offers()}
    assert [by_name[n]["billing"] for n in CORE] == ["one_off", "setup", "one_off", "monthly"]
    for n in CORE:
        o = by_name[n]
        assert o["price_min_gbp"] < o["price_max_gbp"] and o["default_duration_days"] > 0 and len(o["deliverables"]) >= 5


def test_validation_catches_bad_offers():
    assert s.validate({"name": "x", "billing": "weekly"})
    assert any("above" in p for p in s.validate({"name": "x", "billing": "setup", "price_min_gbp": 9, "price_max_gbp": 1, "deliverables": ["a"]}))
    assert any("outside" in p for p in s.validate({"name": "x", "billing": "setup", "price_min_gbp": 1, "price_max_gbp": 5, "setup_price_gbp": 50, "deliverables": ["a"]}))
    assert any("deliverables" in p for p in s.validate({"name": "x", "billing": "monthly"}))
    assert s.validate({"name": "older package", "setup_price_gbp": 600}) == []   # older niche packages stay valid
