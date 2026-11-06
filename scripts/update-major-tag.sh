#!/bin/sh
# Moves the floating major tag (v0) to a stable release tag that Craft
# created. Prereleases keep the major tag where it is.
set -eu

RELEASE_TAG="$1"
ACTION_BUNDLE="github-reporter/dist/action/index.js"

case "$RELEASE_TAG" in
  v*-*)
    echo "Skipping prerelease tag $RELEASE_TAG"
    exit 0
    ;;
  v[0-9]*.[0-9]*.[0-9]*) ;;
  *)
    echo "Skipping non-action release tag $RELEASE_TAG"
    exit 0
    ;;
esac

if ! git cat-file -e "$RELEASE_TAG:$ACTION_BUNDLE" 2>/dev/null; then
  echo "::error::Release tag $RELEASE_TAG is missing $ACTION_BUNDLE."
  exit 1
fi

VERSION="${RELEASE_TAG#v}"
MAJOR="v${VERSION%%.*}"
SHA=$(git rev-parse "$RELEASE_TAG^{commit}")

git tag --force "$MAJOR" "$SHA"
git push --force origin "refs/tags/$MAJOR"
echo "Moved $MAJOR to $RELEASE_TAG ($SHA)"
