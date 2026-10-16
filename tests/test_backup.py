from datetime import datetime, timedelta
from pathlib import Path

from agency import backup


def names(start: datetime, days: int) -> list[Path]:
    return [Path(f"agency-{(start + timedelta(days=i)):%Y%m%d}-020000.tar.gz") for i in range(days)]


def test_keeps_newest_fourteen_and_a_weekly_history():
    files = names(datetime(2026, 1, 1), 120)  # about four months of daily backups
    gone = set(backup.files_to_delete(files))
    kept = [f for f in files if f not in gone]
    newest14 = sorted(files)[-14:]
    assert all(f in kept for f in newest14)
    weeks = {backup.stamp(f).isocalendar()[:2] for f in kept}
    assert len(kept) <= 14 + 8
    assert len(weeks) >= 8  # the last eight weeks are all represented


def test_ignores_files_it_did_not_create():
    other = Path("notes.txt")
    assert other not in backup.files_to_delete([other, *names(datetime(2026, 1, 1), 3)])


def test_few_files_are_all_kept():
    assert backup.files_to_delete(names(datetime(2026, 1, 1), 5)) == []
