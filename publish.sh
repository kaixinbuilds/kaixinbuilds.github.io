#!/usr/bin/env bash
# Commit everything and push to GitHub Pages in one command.
#   ./publish.sh "added NLC talk"
#   ./publish.sh                     (writes a generic message)
set -euo pipefail

cd "$(dirname "$0")"

# Rebuild the pages first, so the committed HTML can never drift from the
# shell in build.py. This runs before the clean-tree check on purpose: a
# stale page is exactly the case that check would otherwise let through.
python3 build.py > /dev/null || { echo "build.py failed, nothing published."; exit 1; }
echo "pages built"

# Validate the JSON before it can reach the live site. A stray comma here
# would blank out the whole page, and Pages has no way to warn you.
for f in projects.json talks.json i18n.json; do
  if ! python3 -m json.tool "$f" > /dev/null 2>&1; then
    echo "$f is not valid JSON. Nothing published."
    python3 -m json.tool "$f" > /dev/null || true
    exit 1
  fi
done
echo "JSON valid"

# Nothing changed after building, so there is nothing to commit.
if [ -z "$(git status --porcelain)" ]; then
  echo "Nothing to publish: working tree is clean."
  exit 0
fi

MESSAGE="${1:-content update}"

git add -A
git commit -m "$MESSAGE"
git push origin main

echo
echo "Pushed. GitHub Pages usually redeploys within a minute:"
echo "  https://kaixinbuilds.github.io"
