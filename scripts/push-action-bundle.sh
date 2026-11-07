#!/bin/sh
# Replaces the GitHub Action bundle in the current directory's checkout with
# the build in $1, commits it on $HEAD_SHA, and pushes it to $PUSH_BRANCH
# with $PUSH_TOKEN. The push-action-bundle workflow runs the default-branch
# copy of this script. The build in $1 comes from a pull request run, so it
# is data only: it must hold regular files under action/ and nothing else.
set -eu

BUILD_DIR=$(cd "$1" && pwd)
ACTION_DIST="github-reporter/dist"

head=$(git rev-parse HEAD)
if [ "$head" != "$HEAD_SHA" ]; then
  echo "::error::Checkout is not at $HEAD_SHA."
  exit 1
fi

unexpected=$(find "$BUILD_DIR" -mindepth 1 \
  ! \( -type d -path "$BUILD_DIR/action" \) \
  ! \( -type d -path "$BUILD_DIR/action/*" \) \
  ! \( -type f -path "$BUILD_DIR/action/*" \))
if [ -n "$unexpected" ]; then
  printf '%s\n' "$unexpected"
  echo "::error::The bundle artifact holds entries other than regular files under action/."
  exit 1
fi

rm -rf "$ACTION_DIST"
mkdir -p "$ACTION_DIST"
cp -R "$BUILD_DIR/action" "$ACTION_DIST/action"
changes=$(git status --porcelain -- "$ACTION_DIST")
if [ -z "$changes" ]; then
  echo "$ACTION_DIST is already up to date."
  exit 0
fi

# Ignore hooks so no repository hook runs while PUSH_TOKEN is set.
git add -- "$ACTION_DIST"
git -c core.hooksPath=/dev/null commit -q -m "build(action): Rebuild GitHub Action bundle"
# Not a fast-forward when the branch moved since $HEAD_SHA, so the push is
# rejected and the new head gets its own run.
git -c core.hooksPath=/dev/null push \
  "https://x-access-token:$PUSH_TOKEN@github.com/$GITHUB_REPOSITORY.git" \
  "HEAD:refs/heads/$PUSH_BRANCH"
echo "::notice::Committed the rebuilt $ACTION_DIST to $PUSH_BRANCH."
