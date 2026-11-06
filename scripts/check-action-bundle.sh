#!/bin/sh
# Fails when the committed GitHub Action bundle differs from a fresh build.
set -eu

cd "$(dirname "$0")/.."

ACTION_DIST="github-reporter/dist"

pnpm build:action
changes=$(git status --porcelain -- "$ACTION_DIST")
if [ -n "$changes" ]; then
  printf '%s\n' "$changes"
  echo "::error::$ACTION_DIST is out of date. Run \`pnpm build:action\` and commit the result."
  exit 1
fi

echo "$ACTION_DIST matches a fresh build."
