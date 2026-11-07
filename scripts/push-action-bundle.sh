#!/bin/sh
# Replaces the GitHub Action bundle in the current directory's checkout with
# the build in $1 and pushes it to $PUSH_BRANCH with $PUSH_TOKEN. CI runs
# the base branch copy of this script and installs nothing, so no pull
# request code runs while the token is available.
set -eu

BUILD_DIR=$(cd "$1" && pwd)
ACTION_DIST="github-reporter/dist"

rm -rf "$ACTION_DIST"
cp -R "$BUILD_DIR" "$ACTION_DIST"
changes=$(git status --porcelain -- "$ACTION_DIST")
if [ -z "$changes" ]; then
  echo "$ACTION_DIST is already up to date."
  exit 0
fi

git add -- "$ACTION_DIST"
git commit --no-verify -m "build(action): Rebuild GitHub Action bundle"
# Rejected when the branch moved since the build; its new head gets its own run.
git push "https://x-access-token:$PUSH_TOKEN@github.com/$GITHUB_REPOSITORY.git" \
  "HEAD:refs/heads/$PUSH_BRANCH"
echo "::notice::Committed the rebuilt $ACTION_DIST to $PUSH_BRANCH."
