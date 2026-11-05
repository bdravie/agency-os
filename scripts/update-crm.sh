#!/bin/bash
# The way to put a change live. Keeps the running CRM working until the new version has passed its checks.
# Run it in the Mac's Terminal app: bash scripts/update-crm.sh     Go back: bash scripts/update-crm.sh --rollback
export PATH="$HOME/.local/node/bin:$PATH"
cd "$(dirname "$0")/.." || exit 1
exec node tools/crm-update/update.mjs "$@"
