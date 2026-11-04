#!/bin/sh
# Installs the nightly backup on the Mac. Run it from the Mac's own Terminal app:  sh scripts/launchd/install-backup.sh
#
# macOS will not let a background job read ~/Documents or iCloud Drive. Rather than give /bin/sh Full Disk Access
# (which would cover every shell script), this builds a tiny app whose only job is to run scripts/backup.sh, and
# Full Disk Access is granted to that app alone. launchd opens the app at 02:30 every day.
set -eu

if [ "$(uname)" != "Darwin" ]; then
  echo "This is for the Mac. You are in the $(uname) dev container: open the Terminal app and run it there." >&2
  exit 1
fi

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
APP="$HOME/Applications/AgencyOSBackup.app"
LOG="$HOME/Library/Logs/agencyos-backup.log"
PLIST="$HOME/Library/LaunchAgents/com.agencyos.backup.plist"

mkdir -p "$HOME/Applications" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
launchctl unload "$PLIST" 2>/dev/null || true
rm -rf "$APP"

# "|| true": a failed backup is written to the log and shows on the Dashboard, rather than leaving an error box open overnight.
osacompile -o "$APP" -e "do shell script \"PATH='$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin' /bin/sh '$REPO/scripts/backup.sh' >> '$LOG' 2>&1 || true\""

# No Dock icon. Changing the app invalidates its signature, so sign it again before Full Disk Access is granted.
plutil -replace LSUIElement -bool true "$APP/Contents/Info.plist"
codesign --force --deep --sign - "$APP"

cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.agencyos.backup</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/open</string>
    <string>-g</string>
    <string>-a</string>
    <string>$APP</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>2</integer><key>Minute</key><integer>30</integer></dict>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLISTEOF
launchctl load "$PLIST"

echo
echo "Installed. One thing only you can do: give the app permission."
echo "  System Settings > Privacy & Security > Full Disk Access is opening, with the app shown in Finder."
echo "  Drag AgencyOSBackup into the list and check its switch is on."
open "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles" || true
open -R "$APP" || true
