#!/bin/sh
# Daily backup entry point (used by launchd). Usage: scripts/backup.sh [--dir PATH]
# The project folder is shared with a Linux dev container, so .venv may have been built for the other
# system. Use it only if it really runs here; otherwise use uv with an environment outside the project,
# so neither system rebuilds the other's .venv.
cd "$(dirname "$0")/.." || exit 1
if .venv/bin/python -c "import agency.backup" 2>/dev/null; then
  exec .venv/bin/python -m agency.backup "$@"
fi
UV_PROJECT_ENVIRONMENT="$HOME/.venvs/agency-os"
export UV_PROJECT_ENVIRONMENT
exec uv run python -m agency.backup "$@"
