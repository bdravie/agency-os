#!/bin/bash
# After Claude writes a Python file, auto-fix and format it with ruff, and report anything left.
input=$(cat)
path=$(jq -r '.tool_input.file_path // ""' <<<"$input")
[[ "$path" == *.py ]] || exit 0
command -v uvx >/dev/null 2>&1 || exit 0

uvx ruff format --quiet "$path" >/dev/null 2>&1
if ! out=$(uvx ruff check --fix --quiet "$path" 2>&1); then
  echo "ruff found problems in $path:" >&2
  echo "$out" >&2
  exit 2   # shown to Claude as feedback so it fixes them
fi
exit 0
