from agency import restore


class FakeConn:
    def __init__(self):
        self.statements: list[str] = []

    def execute(self, query):
        self.statements.append(query.as_string(None) if hasattr(query, "as_string") else str(query))


def test_triggers_are_switched_off_for_every_table_and_on_again():
    # Regression: restoring deals fired the stage-history trigger, which collided with the backup's own stage_history rows.
    c = FakeConn()
    restore.set_triggers(c, ["deals", "stage_history"], enabled=False)
    restore.set_triggers(c, ["deals", "stage_history"], enabled=True)
    assert [("DISABLE" in s, '"deals"' in s or '"stage_history"' in s) for s in c.statements[:2]] == [(True, True)] * 2
    assert all("ENABLE" in s and "DISABLE" not in s for s in c.statements[2:])
    assert all("TRIGGER USER" in s for s in c.statements)


def test_restore_refuses_the_live_database():
    import pytest
    with pytest.raises(SystemExit):
        restore.guard("postgresql://u:p@host/live?sslmode=require", "postgresql://u:p@host/live")
