#!/bin/sh
# Fails a bump-based release when the latest version tag that HEAD reaches is
# not the current package version. Craft computes `auto`, `pre`, and the bump
# types from that tag, so a missing or foreign tag (for example `v0.18.0-src`
# from releases before Craft tagged commits on `main`) gives a wrong version.
# The pattern counts prereleases like Craft does and skips the floating `v0`.
set -eu

cd "$(dirname "$0")/.."

PACKAGE_JSON="packages/vitest-evals/package.json"

version=$(jq -r .version "$PACKAGE_JSON")
if ! tag=$(git describe --tags --abbrev=0 --match 'v[0-9]*.[0-9]*.[0-9]*' 2>/dev/null); then
  tag=""
fi

if [ "$tag" = "v$version" ]; then
  echo "Release baseline OK: $tag matches $PACKAGE_JSON."
  exit 0
fi

echo "::error::The latest version tag on this branch is '${tag:-none}', but $PACKAGE_JSON is $version. Craft would compute the next version from the wrong baseline. Run the Release workflow with an exact \`version\` (for example, 0.18.1)."
exit 1
