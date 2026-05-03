#!/usr/bin/env node

const current = process.argv[2];
const bump = process.argv[3];
const prerelease = process.argv[4] === "true";
const prereleaseId = process.argv[5] || "beta";

const allowedBumps = new Set(["patch", "minor", "major"]);
const allowedPrereleaseIds = new Set(["beta", "rc", "alpha"]);

if (!current || !bump) {
  console.error(
    "Usage: node scripts/calculate-release-version.mjs <current> <patch|minor|major> <true|false> [prerelease-id]",
  );
  process.exit(1);
}

if (!allowedBumps.has(bump)) {
  console.error(`Invalid bump: ${bump}`);
  process.exit(1);
}

if (!allowedPrereleaseIds.has(prereleaseId)) {
  console.error(`Invalid prerelease id: ${prereleaseId}`);
  process.exit(1);
}

const version = parseVersion(current);
if (!version) {
  console.error(`Invalid current version: ${current}`);
  process.exit(1);
}

const next = prerelease
  ? nextPrereleaseVersion(version, bump, prereleaseId)
  : nextStableVersion(version, bump);

console.log(next);

function parseVersion(value) {
  const match = value.match(
    /^([0-9]+)\.([0-9]+)\.([0-9]+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/,
  );

  if (!match) {
    return null;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]?.split(".") ?? [],
  };
}

function formatVersion({ major, minor, patch }, prereleaseParts = []) {
  const base = `${major}.${minor}.${patch}`;
  return prereleaseParts.length > 0
    ? `${base}-${prereleaseParts.join(".")}`
    : base;
}

function bumpStableBase(version, bumpType) {
  switch (bumpType) {
    case "major":
      return { major: version.major + 1, minor: 0, patch: 0 };
    case "minor":
      return { major: version.major, minor: version.minor + 1, patch: 0 };
    case "patch":
      return {
        major: version.major,
        minor: version.minor,
        patch: version.patch + 1,
      };
  }
}

function nextStableVersion(version, bumpType) {
  if (version.prerelease.length > 0) {
    return formatVersion(version);
  }

  return formatVersion(bumpStableBase(version, bumpType));
}

function nextPrereleaseVersion(version, bumpType, id) {
  if (version.prerelease.length === 0) {
    return formatVersion(bumpStableBase(version, bumpType), [id, "0"]);
  }

  const [currentId] = version.prerelease;
  const lastPart = version.prerelease.at(-1);

  if (currentId !== id || !/^[0-9]+$/.test(lastPart)) {
    return formatVersion(version, [id, "0"]);
  }

  return formatVersion(version, [
    ...version.prerelease.slice(0, -1),
    String(Number(lastPart) + 1),
  ]);
}
