#!/bin/sh
# Moves the floating major tag (v0) to a stable release tag that Craft
# created. Prereleases keep the major tag where it is.
#
# The major tag points at a child commit with the release tree, not at the
# release commit. main never reaches that child, so `git describe` (and Craft)
# only sees vX.Y.Z there, while @v0 users get the same files.
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
RELEASE_SHA=$(git rev-parse "$RELEASE_TAG^{commit}")

export GIT_AUTHOR_NAME="github-actions[bot]"
export GIT_AUTHOR_EMAIL="41898282+github-actions[bot]@users.noreply.github.com"
export GIT_COMMITTER_NAME="$GIT_AUTHOR_NAME"
export GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"
SHA=$(git commit-tree "$RELEASE_SHA^{tree}" -p "$RELEASE_SHA" -m "$MAJOR: $RELEASE_TAG")

git tag --force "$MAJOR" "$SHA"
git push --force origin "refs/tags/$MAJOR"
echo "Moved $MAJOR to $SHA (tree of $RELEASE_TAG)"
