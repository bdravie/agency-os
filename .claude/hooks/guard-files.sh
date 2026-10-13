#!/bin/bash
# Stops Claude from editing the real .env file or putting real data into sample-data folders.
input=$(cat)
path=$(jq -r '.tool_input.file_path // ""' <<<"$input")
content=$(jq -r '.tool_input.content // .tool_input.new_string // ""' <<<"$input")

if [[ "$(basename "$path")" == ".env" ]]; then
  echo "Blocked by guard-files: edit .env by hand. Update .env.example instead." >&2
  exit 2
fi

# Sample data must be fake: block obvious real UK mobile numbers in sample-data
if [[ "$path" == *sample-data* ]] && grep -Eo '(\+44[[:space:]]?7|07)[0-9]{3}[[:space:]]?[0-9]{6}' <<<"$content" | grep -Evq '7700[[:space:]]?900'; then
  echo "Blocked by guard-files: sample data looks like it contains a real UK mobile number. Use 07700 900xxx (Ofcom's drama range) for fake numbers." >&2
  exit 2
fi
exit 0
