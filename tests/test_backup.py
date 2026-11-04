import io
import json
import tarfile
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from cryptography.fernet import Fernet

from agency import backup, config


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


@pytest.mark.parametrize("raw, platform", [
    ("BACKUP_DIR=~/Library/Mobile Documents/com~apple~CloudDocs/agency-os-backups", "darwin"),  # name typed twice
    ("backups", "darwin"),  # relative, so it would land inside the project
    (str(config.ROOT / "backups"), "darwin"),  # inside the project
    ("/Library/Mobile Documents/com~apple~CloudDocs/agency-os-backups", "darwin"),  # the ~ left off
    ("~/Library/Mobile Documents/com~apple~CloudDocs/agency-os-backups", "linux"),  # Mac folder, in the container
])
def test_a_bad_backup_folder_is_refused(raw: str, platform: str):
    with pytest.raises(SystemExit):
        backup.backup_folder(raw, platform)


def test_a_good_backup_folder_is_accepted():
    good = "~/Library/Mobile Documents/com~apple~CloudDocs/agency-os-backups"
    assert backup.backup_folder(good, "darwin") == Path(good).expanduser()
    assert backup.backup_folder("/mnt/backups", "linux") == Path("/mnt/backups")


def make_tar(rows: dict) -> bytes:
    buf, body = io.BytesIO(), json.dumps({"rows": rows}).encode()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        info = tarfile.TarInfo("manifest.json")
        info.size = len(body)
        tar.addfile(info, io.BytesIO(body))
    return buf.getvalue()


def test_encrypted_and_older_plain_backups_can_both_be_opened(tmp_path: Path):
    key, data = Fernet.generate_key().decode(), make_tar({"companies": 3})
    enc = tmp_path / "agency-20261104-020000.tar.gz.enc"
    enc.write_bytes(Fernet(key).encrypt(data))
    plain = tmp_path / "agency-20261103-020000.tar.gz"
    plain.write_bytes(data)
    assert b"companies" not in enc.read_bytes() and enc.read_bytes()[:2] != data[:2]
    for f, k in ((enc, key), (plain, None)):
        with tarfile.open(fileobj=backup.open_backup(f, k), mode="r:gz") as tar:
            assert json.load(tar.extractfile("manifest.json"))["rows"] == {"companies": 3}


def test_the_wrong_key_stops_with_a_message_that_does_not_show_a_key(tmp_path: Path):
    right, wrong = Fernet.generate_key().decode(), Fernet.generate_key().decode()
    f = tmp_path / "agency-20261104-020000.tar.gz.enc"
    f.write_bytes(Fernet(right).encrypt(b"data"))
    with pytest.raises(SystemExit) as err:
        backup.open_backup(f, wrong)
    assert "could not be decrypted" in str(err.value) and wrong not in str(err.value) and right not in str(err.value)
    with pytest.raises(SystemExit):
        backup.fernet("not-a-real-key")


def test_a_new_key_fills_a_blank_line_keeps_the_rest_and_never_replaces_one(tmp_path: Path):
    env = tmp_path / "settings"
    env.write_text("OTHER=1\nBACKUP_ENCRYPTION_KEY=\nLAST=2\n")
    backup.add_key_to_env(env)
    lines = env.read_text().splitlines()
    assert lines[0] == "OTHER=1" and lines[2] == "LAST=2"
    Fernet(lines[1].split("=", 1)[1])  # a valid key
    before = env.read_text()
    with pytest.raises(SystemExit):
        backup.add_key_to_env(env)
    assert env.read_text() == before


def test_clean_up_counts_encrypted_files_and_ignores_unfinished_ones():
    days = [Path(f"agency-202601{d:02d}-020000.tar.gz.enc") for d in range(1, 29)]
    assert backup.stamp(days[0]) is not None
    assert backup.stamp(Path("agency-20260101-020000.tar.gz.enc.partial")) is None
    assert sorted(days)[-1] not in backup.files_to_delete(days)
    assert len(backup.files_to_delete(days)) > 0
