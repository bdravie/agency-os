#!/bin/bash
# Blocks shell commands that could leak secrets or rewrite git history.
# Exit 2 = block the command and show the message to Claude.
input=$(cat)
cmd=$(jq -r '.tool_input.command // ""' <<<"$input")

block() { echo "Blocked by guard-bash: $1" >&2; exit 2; }

# Reading or printing the .env file
if grep -Eq '(cat|less|more|head|tail|bat|grep|source|\.)[[:space:]]+[^|;&]*\.env([[:space:]]|$)' <<<"$cmd"; then
  block "don't read or print .env; use src/agency/config.py to load secrets."
fi
# Committing secrets
if grep -Eq 'git[[:space:]]+add[[:space:]].*\.env([[:space:]]|$)' <<<"$cmd"; then
  block ".env must never be committed."
fi
# Force pushes and hard resets
if grep -Eq 'git[[:space:]]+push[[:space:]].*(--force|-f)([[:space:]]|$)|git[[:space:]]+reset[[:space:]]+--hard' <<<"$cmd"; then
  block "force push / hard reset needs the owner to run it by hand."
fi
# Anything that could wipe the CRM database
if grep -Eqi 'docker[[:space:]-]+compose[[:space:]].*down[[:space:]].*(-v|--volumes)|docker[[:space:]]+volume[[:space:]]+(rm|prune)|docker[[:space:]]+system[[:space:]]+prune.*--volumes' <<<"$cmd"; then
  block "this would delete the database volume. Run it by hand if you really mean it, after a backup."
fi
if grep -Eqi 'drop[[:space:]]+(database|schema|table)|truncate[[:space:]]|dbmate[[:space:]].*(drop|rollback|down)' <<<"$cmd"; then
  block "destructive database command. Write a new migration instead, or run it by hand after a backup."
fi
# Anything that would send SMS automatically
if grep -Eqi 'api\.twilio\.com|messages\.create' <<<"$cmd"; then
  block "phase 1 never sends SMS automatically."
fi
exit 0
