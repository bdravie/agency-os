#!/bin/sh
# Removes the "._" sidecar files macOS leaves next to files on exFAT drives (they only hold Apple metadata).
# Safe to run any time: it deletes only regular files whose names start with "._", and only inside this project.
cd "$(dirname "$0")/.." || exit 1
n=$(find . -name '._*' -type f | wc -l | tr -d ' ')
find . -name '._*' -type f -delete
echo "Removed $n sidecar files."
