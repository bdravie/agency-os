#!/bin/sh
# Daily backup entry point (used by launchd). Usage: scripts/backup.sh [--dir PATH]
# Uses the repo's .venv when it exists (so launchd does not need uv on its PATH), else uv.
cd "$(dirname "$0")/.." || exit 1
if [ -x .venv/bin/python ]; then
  exec .venv/bin/python -m agency.backup "$@"
fi
exec uv run python -m agency.backup "$@"
