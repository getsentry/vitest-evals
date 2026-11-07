#!/bin/sh
# Rebuilds the GitHub Action bundle and compares it with the committed files.
# When CAN_PUSH=true (same-repo PRs), a stale bundle sets the `stale` step
# output so CI uploads it for the push-action-bundle workflow. Otherwise
# (fork PRs, Dependabot, main) a stale bundle fails the job.
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
if [ "${CAN_PUSH:-}" = "true" ]; then
  echo "stale=true" >> "$GITHUB_OUTPUT"
  echo "::notice::$ACTION_DIST is out of date. CI will commit the rebuilt bundle."
  exit 0
fi

echo "::error::$ACTION_DIST is out of date. Run \`pnpm build:action\` and commit the result."
exit 1
