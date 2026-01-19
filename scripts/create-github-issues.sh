#!/usr/bin/env bash
# Helper script to create GitHub issues from .md files using GitHub CLI (gh).
# Usage: scripts/create-github-issues.sh path/to/files/*.md

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI required. Install from https://cli.github.com/"
  exit 1
fi

for file in "$@"; do
  if [ ! -f "$file" ]; then
    echo "Skipping missing file: $file"
    continue
  fi

  title=$(grep -m1 '^Title:' "$file" | sed 's/^Title:[[:space:]]*//')
  body=$(sed -n '1,200p' "$file" | sed '1,/^$/d')

  if [ -z "$title" ]; then
    echo "No Title found in $file, skipping"
    continue
  fi

  echo "Creating issue: $title"
  gh issue create --title "$title" --body "$body" --label "triage" || echo "Failed to create issue for $file"
  sleep 1
done

echo "Done."