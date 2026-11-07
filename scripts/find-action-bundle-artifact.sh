#!/bin/sh
# Sets the `found` step output when Test run $RUN_ID uploaded an unexpired
# action-bundle artifact. Most runs upload none, because the bundle is fresh.
set -eu

count=$(gh api "repos/$GITHUB_REPOSITORY/actions/runs/$RUN_ID/artifacts" \
  --jq '[.artifacts[] | select(.name == "action-bundle" and .expired == false)] | length')
if [ "$count" -gt 0 ]; then
  echo "found=true" >> "$GITHUB_OUTPUT"
fi
