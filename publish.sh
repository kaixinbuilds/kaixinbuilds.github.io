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
echo "pushed"

# A successful push is not a successful deploy. GitHub Pages builds every
# commit, and when that build fails it says nothing to anyone: the site keeps
# serving the last commit that built, so the pages simply stop updating while
# every command here still reports success. That happened on 27 Aug 2026 and
# cost an hour of staring at a correct repository and a stale site.
#
# So watch the build through. This is reporting only: the push has already
# happened and nothing below can undo it.
SHA="$(git rev-parse HEAD)"

if ! command -v gh > /dev/null 2>&1; then
  echo "gh CLI not installed, so the Pages build cannot be checked from here."
  echo "Watch it at: https://github.com/kaixinbuilds/kaixinbuilds.github.io/deployments"
  exit 0
fi

# owner/repo from the remote. The remote uses an SSH host alias
# (git@github-kaixinbuilds:owner/repo.git), so take what follows the colon.
REMOTE="$(git remote get-url origin)"
SLUG="${REMOTE##*:}"      # owner/repo.git
SLUG="${SLUG##*github.com/}"
SLUG="${SLUG%.git}"

echo -n "waiting for the Pages build"
STATUS=""
for _ in $(seq 1 40); do          # 40 x 15s = up to 10 minutes
  BUILD="$(gh api "repos/$SLUG/pages/builds" \
             --jq ".[] | select(.commit == \"$SHA\") | .status" 2>/dev/null | head -1 || true)"
  case "$BUILD" in
    built)   STATUS=built;   break ;;
    errored) STATUS=errored; break ;;
  esac
  echo -n "."
  sleep 15
done
echo

case "$STATUS" in
  built)
    echo "Pages build succeeded. Live now:"
    echo "  https://kaixinbuilds.github.io"
    ;;
  errored)
    echo "PAGES BUILD FAILED for $(git rev-parse --short HEAD)."
    echo "The push went through, but the live site is STILL SERVING THE PREVIOUS COMMIT."
    echo "Visitors see no error; the site just does not update."
    echo
    gh api "repos/$SLUG/pages/builds" \
      --jq ".[] | select(.commit == \"$SHA\") | .error.message" 2>/dev/null | head -1 || true
    echo
    echo "First thing to check: .nojekyll is still in the repository root."
    echo "build.py writes it, and without it Pages runs Jekyll and can fail this way."
    echo "  https://github.com/$SLUG/deployments"
    exit 1
    ;;
  *)
    echo "Still building after 10 minutes, which is unusual. Check it yourself:"
    echo "  https://github.com/$SLUG/deployments"
    ;;
esac
