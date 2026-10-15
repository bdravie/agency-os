#!/bin/sh
# Daily backup entry point (used by launchd). Usage: scripts/backup.sh
cd "$(dirname "$0")/.." && exec uv run python -m agency.backup "$@"
