#!/bin/sh
# Replaces the GitHub Action bundle with the build in $1 and pushes it to
# $PUSH_BRANCH. Runs without installing dependencies, so no package code can
# read the push token.
set -eu

BUILD_DIR=$(cd "$1" && pwd)
ACTION_DIST="github-reporter/dist"

cd "$(dirname "$0")/.."

rm -rf "$ACTION_DIST"
cp -R "$BUILD_DIR" "$ACTION_DIST"
changes=$(git status --porcelain -- "$ACTION_DIST")
if [ -z "$changes" ]; then
  echo "$ACTION_DIST is already up to date."
  exit 0
fi

git add -- "$ACTION_DIST"
git commit -m "build(action): Rebuild GitHub Action bundle"
# Rejected when the branch moved since the build; its new head gets its own run.
git push origin "HEAD:refs/heads/$PUSH_BRANCH"
echo "::notice::Committed the rebuilt $ACTION_DIST to $PUSH_BRANCH."
