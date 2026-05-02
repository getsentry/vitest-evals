#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function readFile(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function collectMatches(text, pattern) {
  return [
    ...new Set([...text.matchAll(pattern)].map((match) => match[1])),
  ].sort();
}

function collectCraftPackages() {
  return collectMatches(readFile(".craft.yml"), /^\s*id:\s*"([^"]+)"/gm);
}

function collectBumpPackages() {
  const packageFiles = collectMatches(
    readFile("scripts/bump-release-versions.mjs"),
    /"(packages\/[^"]+\/package\.json)"/g,
  );

  return packageFiles
    .map((relativePath) => JSON.parse(readFile(relativePath)).name)
    .sort();
}

function collectPackPackages() {
  return collectMatches(
    readFile(".github/workflows/merge-jobs.yml"),
    /pnpm --filter ([^\s]+) pack --pack-destination artifacts/g,
  );
}

function describeMismatch(expected, actual) {
  const missing = expected.filter((entry) => !actual.includes(entry));
  const extra = actual.filter((entry) => !expected.includes(entry));

  if (missing.length === 0 && extra.length === 0) {
    return null;
  }

  return { missing, extra };
}

const sources = [
  {
    label: ".craft.yml",
    packages: collectCraftPackages(),
  },
  {
    label: "scripts/bump-release-versions.mjs",
    packages: collectBumpPackages(),
  },
  {
    label: ".github/workflows/merge-jobs.yml",
    packages: collectPackPackages(),
  },
];

const [expectedSource, ...otherSources] = sources;

if (expectedSource.packages.length === 0) {
  console.error(
    "Release config check failed: .craft.yml does not define any publish targets.",
  );
  process.exit(1);
}

let hasMismatch = false;

for (const source of otherSources) {
  const mismatch = describeMismatch(expectedSource.packages, source.packages);

  if (!mismatch) {
    continue;
  }

  hasMismatch = true;
  console.error(`Release config mismatch in ${source.label}:`);

  if (mismatch.missing.length > 0) {
    console.error(`  Missing: ${mismatch.missing.join(", ")}`);
  }

  if (mismatch.extra.length > 0) {
    console.error(`  Extra: ${mismatch.extra.join(", ")}`);
  }
}

if (hasMismatch) {
  console.error(
    "Release config check failed. Align release package lists with .craft.yml.",
  );
  process.exit(1);
}

console.log(
  `Release config OK: ${expectedSource.packages.length} packages aligned across ${sources.length} sources.`,
);
