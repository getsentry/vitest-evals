#!/bin/sh
# Rebuilds the GitHub Action bundle. When it differs from the committed
# files, commits and pushes it to $PUSH_BRANCH, or fails when that is unset
# (fork PRs and main, where CI cannot or must not push).
set -eu

cd "$(dirname "$0")/.."

ACTION_DIST="github-reporter/dist"

pnpm build:action
changes=$(git status --porcelain -- "$ACTION_DIST")
if [ -z "$changes" ]; then
  echo "$ACTION_DIST matches a fresh build."
  exit 0
fi

printf '%s\n' "$changes"
if [ -z "${PUSH_BRANCH:-}" ]; then
  echo "::error::$ACTION_DIST is out of date. Run \`pnpm build:action\` and commit the result."
  exit 1
fi

git add -- "$ACTION_DIST"
git commit -m "build(action): Rebuild GitHub Action bundle"
git push origin "HEAD:refs/heads/$PUSH_BRANCH"
echo "::notice::Committed the rebuilt $ACTION_DIST to $PUSH_BRANCH."
