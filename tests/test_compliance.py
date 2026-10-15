import pytest

from agency import compliance


@pytest.mark.parametrize("raw", ["+44 7700 900123", "+44 (0)7700 900123", "0044 7700 900123", "07700 900-123", "(07700) 900123", "07700900123"])
def test_phone_numbers_normalise_the_same_way_as_the_crm_and_database(raw):
    assert compliance.normalise_phone(raw) == "07700900123"


def test_phone_normalise_handles_empty_and_junk():
    assert compliance.normalise_phone("") is None and compliance.normalise_phone("abc") is None and compliance.normalise_phone(None) is None


@pytest.mark.parametrize("t", ["ltd", "llp", "plc", "LTD"])
def test_active_ltd_llp_plc_are_eligible(t):
    assert compliance.classify(t, "active") == ("eligible", None)


@pytest.mark.parametrize("t,s", [("ltd", "dissolved"), ("ltd", "liquidation"), ("ltd", "active-proposal-to-strike-off"),
                                 ("limited-partnership", "active"), ("private-unlimited", "active"), ("private-limited-guarant-nsc", "active"), (None, "active"), ("", "active")])
def test_everything_else_is_not_eligible_with_a_reason(t, s):
    status, reason = compliance.classify(t, s)
    assert status == "not_eligible" and reason


class Conn:
    def __init__(self): self.sql, self.params = [], []

    def execute(self, sql, params=None):
        self.sql.append(sql); self.params.append(params)
        return self


def test_apply_profile_marks_a_struck_off_company_not_eligible():
    c = Conn()
    assert compliance.apply_profile(c, "01234567", "ltd", "dissolved") == "not_eligible"
    assert c.params[0][4] == "not_eligible"
    assert compliance.apply_profile(c, "01234567", "ltd", "active") == "eligible"


def test_settings_are_trimmed(monkeypatch):
    from agency import config
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@host/db?sslmode=require\n")
    assert config.require("DATABASE_URL").endswith("sslmode=require")
    monkeypatch.setenv("SOME_KEY", "  \n")
    assert config.get("SOME_KEY", "fallback") == "fallback"
