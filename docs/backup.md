# Backups

Your Neon database is the business's most valuable asset. Two layers protect it:

1. **Neon's built-in point-in-time restore** (Neon console > Restore). Good for "undo the last hour".
2. **Your own daily backup file**, kept outside Neon in a cloud-synced folder. Good if Neon or your account is ever the problem.

## One-off setup

1. Pick a synced folder and set it in `.env`, for example iCloud Drive:
   `BACKUP_DIR=~/Library/Mobile Documents/com~apple~CloudDocs/agency-os-backups`
2. Run the first backup by hand:
   `uv run python -m agency.backup`
   A file named `agency-YYYYmmdd-HHMMSS.tar.gz.enc` appears in that folder (small: a few hundred KB).
3. The Today page in the CRM now shows "Last backup", in red if it is over 36 hours old.

Run backups from the Mac's own Terminal app (`uname` says `Darwin`), not a VS Code terminal, which is inside the Linux container. The tool refuses a folder that is relative, inside the project, or a Mac folder when run in the container, because a recorded backup turns the Dashboard's warning off.

## Encryption

Backups hold real business data, so each file is encrypted before it reaches the synced folder and read back to check it before it is kept. **The key is `BACKUP_ENCRYPTION_KEY` in `.env`, and `.env` is not backed up, so keep a copy of the key in your password manager. Without it the backups cannot be restored by anyone.** `uv run python -m agency.backup --new-key` creates it once without displaying it, and refuses to replace an existing key, because that would lock out older backups. With no key the backup stops and records nothing, so the Dashboard's warning stays on. Older unencrypted `.tar.gz` backups can still be restored.

## Daily schedule (macOS launchd)

macOS will not let a background job read `~/Documents` or iCloud Drive (launchd exit code 126, `Operation not permitted`; the Terminal app has that permission, so a hand run works and proves nothing about the job). So `scripts/launchd/install-backup.sh` builds a tiny app, `~/Applications/AgencyOSBackup.app`, whose only job is to run `scripts/backup.sh`, and Full Disk Access goes to that app alone, never to `/bin/sh`. launchd opens it at 02:30 every day (if the Mac is asleep it runs on wake).

To switch it on, from the Mac's Terminal app in the project folder:

```
sh scripts/launchd/install-backup.sh
```

Then drag `AgencyOSBackup` into System Settings > Privacy & Security > Full Disk Access (the script opens both). To check it:

```
open -g -a ~/Applications/AgencyOSBackup.app; sleep 30
tail -5 ~/Library/Logs/agencyos-backup.log
```

Look for `Backup written` in the log. `launchctl list` always shows 0 for this job, because it only reports that the app was opened; the log, the new file and the Dashboard are the real checks.

To switch it off: `launchctl unload ~/Library/LaunchAgents/com.agencyos.backup.plist`, then remove the app from Full Disk Access and delete it.

**Running the install script again rebuilds the app, so remove it from Full Disk Access and add it again.** Run it again if the project moves. Output goes to `~/Library/Logs/agencyos-backup.log`. The job reads `.env` itself. The Mac must be logged in and able to reach the internet at that time. The Dashboard's red "Last backup" line is the warning to watch: until 4 Nov 2026 the nightly job failed silently from 21 Oct.

## What is kept

The newest 14 backups, plus the newest one from each of the last 8 weeks. Only files named `agency-YYYYmmdd-HHMMSS.tar.gz` or `.tar.gz.enc` in the backup folder are ever deleted.

## Test a restore (do this once a month)

Restores only ever go into a separate **scratch** database, never the live one.

1. `SCRATCH_DATABASE_URL` in `.env` points at an empty database called `agency_scratch` in the same Neon project.
2. Run: `uv run python -m agency.restore "<path to a backup file>"`
3. It creates the tables, loads every backup table, and prints the row counts side by side. "All row counts match" means the backup is good.
4. To run it again, the scratch database must be empty: in the Neon console, delete `agency_scratch` and create it again with the same name.

The restore refuses to run if the scratch URL points at the live database, or if the scratch database already has data.

## If the live database is ever lost

First try Neon's point-in-time restore. If that is not possible, create a new Neon database, point `DATABASE_URL` at it, run `npm run db:migrate`, then load the latest backup the same way the restore tool does (it can be pointed at any empty database).

## What is not covered

Code is on GitHub. Secrets (`.env`), including the backup key, are not backed up anywhere: keep a copy in a password manager.

## Scratch databases

`agency_scratch`, `agency_scratch2`, `agency_scratch3` and `agency_scratch4` exist in the same Neon project and are only for testing restores and migrations. `agency_scratch2` currently holds synthetic funnel test deals (not real data); `agency_scratch3` holds the 4 Nov 2026 restore test and `agency_scratch4` is also not empty. `SCRATCH_DATABASE_URL` in `.env` was blank on 4 Nov 2026: set it to an empty scratch database before the next test. A restore needs an empty scratch database, so to test again create a new one (for example `agency_scratch3`) and point `SCRATCH_DATABASE_URL` at it, or delete and recreate one in the Neon console.

The restore switches user triggers off while it loads data (and back on afterwards), so tables with triggers, such as `deals` and its stage history, restore exactly as backed up.
