# Backups

Your Neon database is the business's most valuable asset. Two layers protect it:

1. **Neon's built-in point-in-time restore** (Neon console > Restore). Good for "undo the last hour".
2. **Your own daily backup file**, kept outside Neon in a cloud-synced folder. Good if Neon or your account is ever the problem.

## One-off setup

1. Pick a synced folder and set it in `.env`, for example iCloud Drive:
   `BACKUP_DIR=~/Library/Mobile Documents/com~apple~CloudDocs/agency-os-backups`
2. Run the first backup by hand:
   `uv run python -m agency.backup`
   A file named `agency-YYYYmmdd-HHMMSS.tar.gz` appears in that folder (small: a few hundred KB).
3. The Today page in the CRM now shows "Last backup", in red if it is over 36 hours old.

## Daily schedule (macOS launchd)

The file `scripts/launchd/com.agencyos.backup.plist` runs `scripts/backup.sh` at 02:30 every day (if the Mac is asleep it runs on wake). It contains this Mac's paths (`/Users/brad/Documents/agency-os`); `backup.sh` uses the repo's `.venv` only if it really runs on this system. The project folder is shared with a Linux dev container whose `.venv` will not run on the Mac, so on the Mac it normally uses `uv` (from Homebrew) with its own environment in `~/.venvs/agency-os`, and neither system rebuilds the other's `.venv`. To switch it on (or, after moving the project, to reload it):

```
launchctl unload ~/Library/LaunchAgents/com.agencyos.backup.plist 2>/dev/null
cp scripts/launchd/com.agencyos.backup.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.agencyos.backup.plist
launchctl start com.agencyos.backup   # run once now to check
```

**If the project moves** (for example off the T7), update the two paths in the plist and reload it. Until 4 Nov 2026 it still pointed at `/Volumes/T7/agency-os 2` and `~/.local/bin/uv`, so the nightly job failed silently from 21 Oct; the Dashboard's red "Last backup" line is the warning to watch.

To switch it off: `launchctl unload ~/Library/LaunchAgents/com.agencyos.backup.plist`. Output goes to `~/Library/Logs/agencyos-backup.log`.

The job reads `.env` itself. The Mac must be logged in and able to reach the internet at that time.

## What is kept

The newest 14 backups, plus the newest one from each of the last 8 weeks. Only files named `agency-*.tar.gz` in the backup folder are ever deleted.

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

Code is on GitHub. Secrets (`.env`) are not backed up anywhere: keep a copy in a password manager.

## Scratch databases

`agency_scratch`, `agency_scratch2`, `agency_scratch3` and `agency_scratch4` exist in the same Neon project and are only for testing restores and migrations. `agency_scratch2` currently holds synthetic funnel test deals (not real data); `agency_scratch3` holds the 4 Nov 2026 restore test and `agency_scratch4` is also not empty. `SCRATCH_DATABASE_URL` in `.env` was blank on 4 Nov 2026: set it to an empty scratch database before the next test. A restore needs an empty scratch database, so to test again create a new one (for example `agency_scratch3`) and point `SCRATCH_DATABASE_URL` at it, or delete and recreate one in the Neon console.

The restore switches user triggers off while it loads data (and back on afterwards), so tables with triggers, such as `deals` and its stage history, restore exactly as backed up.
