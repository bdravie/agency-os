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

The file `scripts/launchd/com.agencyos.backup.plist` runs the backup at 02:30 every day (if the Mac is asleep it runs on wake). It contains this Mac's paths. To switch it on:

```
cp scripts/launchd/com.agencyos.backup.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.agencyos.backup.plist
```

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
