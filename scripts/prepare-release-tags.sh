#!/bin/sh
# Prepares local release tags for `craft prepare`.
#
# Published `vX.Y.Z` tags point at bundled action commits that main never
# reaches, so main only reaches the `vX.Y.Z-src` source tags. Craft reads the
# `-src` suffix as a prerelease, which breaks the bump types, `auto`, and
# `pre`. This script checks that the previous release left its source tag,
# then moves each local `vX.Y.Z` tag to its source commit and deletes the
# local `-src` tag. It changes only the runner checkout and pushes nothing.
set -eu

cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./packages/vitest-evals/package.json').version")
SOURCE_TAG="v${VERSION}-src"
CURRENT_TAG="v${VERSION}"
DESCRIBED_TAG=$(git describe --tags --abbrev=0)
DESCRIBED_SHA=$(git rev-parse "$DESCRIBED_TAG^{commit}")
SOURCE_TAGS=$(git tag --list 'v*-src')

if git rev-parse --verify --quiet "$SOURCE_TAG^{commit}" >/dev/null; then
  SOURCE_SHA=$(git rev-parse "$SOURCE_TAG^{commit}")

  if [ "$DESCRIBED_SHA" != "$SOURCE_SHA" ]; then
    echo "::error::Expected git describe to resolve to $SOURCE_TAG ($SOURCE_SHA), got $DESCRIBED_TAG ($DESCRIBED_SHA)"
    exit 1
  fi

  if ! git rev-parse --verify --quiet "$CURRENT_TAG^{commit}" >/dev/null; then
    echo "::error::Missing bundled action tag $CURRENT_TAG."
    exit 1
  fi

  if ! git cat-file -e "$CURRENT_TAG:github-reporter/dist/action/index.js" 2>/dev/null; then
    echo "::error::Bundled action tag $CURRENT_TAG is missing github-reporter/dist/action/index.js."
    exit 1
  fi

  echo "Craft previous-release baseline: $SOURCE_TAG ($SOURCE_SHA)"
elif [ -n "$SOURCE_TAGS" ]; then
  echo "::error::Missing source tag $SOURCE_TAG, but prior action source tags exist. The previous action release did not finalize its source tag."
  exit 1
else
  RELEASE_TAGS=$(git tag --list 'v*')
  if [ -n "$RELEASE_TAGS" ]; then
    echo "::error::Missing source tag $SOURCE_TAG, but v-prefixed release tags already exist. Create the missing source tag before preparing another action release."
    exit 1
  fi

  echo "No action source tags found; allowing first action-bundle release from existing baseline $DESCRIBED_TAG ($DESCRIBED_SHA)."
  exit 0
fi

for tag in $SOURCE_TAGS; do
  sha=$(git rev-parse "$tag^{commit}")
  git tag --force "${tag%-src}" "$sha" >/dev/null
  git tag --delete "$tag" >/dev/null
done

CRAFT_BASELINE=$(git describe --tags --abbrev=0 --match 'v*')
echo "Craft sees $CRAFT_BASELINE as the latest release tag."
