#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectPublishablePackages,
  packageTarballName,
} from "./release-packages.mjs";

const ACTION_BUNDLE_MAIN = "github-reporter/dist/action/index.js";

function readFile(root, relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function readJson(root, relativePath) {
  return JSON.parse(readFile(root, relativePath));
}

function collectMatches(text, pattern) {
  return [
    ...new Set([...text.matchAll(pattern)].map((match) => match[1])),
  ].sort();
}

function parseScalar(value) {
  const trimmed = value.trim();
  const quoted = trimmed.match(/^"([^"]*)"$/);
  return quoted ? quoted[1] : trimmed;
}

function collectCraftTargets(root) {
  const craftConfig = readFile(root, ".craft.yml");
  return [
    ...craftConfig.matchAll(
      /^\s*-\s*name:\s*([^\s#]+)\b[\s\S]*?(?=^\s*-\s*name:|(?![\s\S]))/gm,
    ),
  ].map((match) => {
    const block = match[0];
    const id = block.match(/^\s*id:\s*(.+)$/m)?.[1];
    const access = block.match(/^\s*access:\s*(.+)$/m)?.[1];
    const includeNames = block.match(/^\s*includeNames:\s*(.+)$/m)?.[1];

    return {
      access: access ? parseScalar(access) : undefined,
      block,
      id: id ? parseScalar(id) : undefined,
      includeNames: includeNames ? parseScalar(includeNames) : undefined,
      name: parseScalar(match[1]),
    };
  });
}

function parseRegexLiteral(value, targetDescription) {
  if (!value) {
    throw new Error(`${targetDescription} must define includeNames.`);
  }

  if (!value.startsWith("/")) {
    throw new Error(
      `${targetDescription} includeNames must be a JavaScript regex literal.`,
    );
  }

  let escaped = false;
  for (let index = 1; index < value.length; index += 1) {
    const character = value[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === "\\") {
      escaped = true;
      continue;
    }

    if (character !== "/") {
      continue;
    }

    const pattern = value.slice(1, index);
    const flags = value.slice(index + 1);

    if (!/^[dgimsuvy]*$/.test(flags)) {
      throw new Error(
        `${targetDescription} includeNames has invalid regex flags.`,
      );
    }

    return new RegExp(pattern, flags);
  }

  throw new Error(
    `${targetDescription} includeNames must be a JavaScript regex literal.`,
  );
}

function collectCraftPackages(root) {
  return collectCraftTargets(root)
    .filter((target) => target.name === "npm")
    .map((target) => target.id)
    .filter(Boolean)
    .sort();
}

function collectPackPackages(root) {
  return collectMatches(
    readFile(root, ".github/workflows/merge-jobs.yml"),
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

function formatMismatch(label, mismatch) {
  const lines = [`Release config mismatch in ${label}:`];

  if (mismatch.missing.length > 0) {
    lines.push(`  Missing: ${mismatch.missing.join(", ")}`);
  }

  if (mismatch.extra.length > 0) {
    lines.push(`  Extra: ${mismatch.extra.join(", ")}`);
  }

  return lines.join("\n");
}

function assertGitHubTargetConfig(targets, errors) {
  const githubTargets = targets.filter((target) => target.name === "github");

  if (githubTargets.length !== 1) {
    errors.push(
      "Release config check failed: .craft.yml must define exactly one github target for root action tags.",
    );
    return;
  }

  const [githubTarget] = githubTargets;
  if (targets.at(-1) !== githubTarget) {
    errors.push(
      "Release config check failed: the github target must be the final target so npm publishes before the public GitHub release and action tags.",
    );
  }

  if (!/^\s*includeNames:\s*\/\^\$\/\s*$/m.test(githubTarget.block)) {
    errors.push(
      "Release config check failed: the github target must keep includeNames: /^$/ so package artifacts are not uploaded as GitHub release assets.",
    );
  }
}

function assertCraftNpmTargets({ packages, targets }, errors) {
  const byName = new Map(
    packages.map((packageInfo) => [packageInfo.name, packageInfo]),
  );
  const npmTargets = targets.filter((target) => target.name === "npm");
  const seenIds = new Set();
  const tarballs = packages.map((packageInfo) => [
    packageInfo.name,
    packageTarballName(packageInfo),
  ]);

  for (const target of npmTargets) {
    const description = `Craft npm target${target.id ? ` ${target.id}` : ""}`;

    if (!target.id) {
      errors.push(`${description} must define an id.`);
      continue;
    }

    if (seenIds.has(target.id)) {
      errors.push(
        `Release config check failed: duplicate Craft npm target ${target.id}.`,
      );
    }
    seenIds.add(target.id);

    const packageInfo = byName.get(target.id);
    if (!packageInfo) {
      continue;
    }

    const expectedAccess = packageInfo.packageJson.publishConfig?.access;
    if (expectedAccess && target.access !== expectedAccess) {
      errors.push(
        `Release config check failed: Craft target ${target.id} must set access: ${expectedAccess}.`,
      );
    }

    let includeNames;
    try {
      includeNames = parseRegexLiteral(target.includeNames, description);
    } catch (error) {
      errors.push(`Release config check failed: ${error.message}`);
      continue;
    }

    const ownTarball = packageTarballName(packageInfo);

    if (!includeNames.test(ownTarball)) {
      errors.push(
        `Release config check failed: Craft target ${target.id} includeNames does not match ${ownTarball}.`,
      );
    }

    for (const [otherPackageName, otherTarball] of tarballs) {
      if (otherPackageName === target.id) {
        continue;
      }

      if (includeNames.test(otherTarball)) {
        errors.push(
          `Release config check failed: Craft target ${target.id} includeNames also matches ${otherPackageName} artifact ${otherTarball}.`,
        );
      }
    }
  }
}

function assertVersionBumpConfig(root, errors) {
  const craftConfig = readFile(root, ".craft.yml");
  if (
    !/^preReleaseCommand:\s*bash scripts\/craft-pre-release\.sh\s*$/m.test(
      craftConfig,
    )
  ) {
    errors.push(
      "Release config check failed: .craft.yml must run scripts/craft-pre-release.sh before release.",
    );
  }

  const preReleaseScript = readFile(root, "scripts/craft-pre-release.sh");
  if (
    !preReleaseScript.includes(
      'node scripts/bump-release-versions.mjs "${NEW_VERSION}"',
    )
  ) {
    errors.push(
      "Release config check failed: craft-pre-release.sh must pass NEW_VERSION to bump-release-versions.mjs.",
    );
  }

  const bumpScript = readFile(root, "scripts/bump-release-versions.mjs");
  if (
    !bumpScript.includes("collectPublishablePackages") ||
    !bumpScript.includes("./release-packages.mjs")
  ) {
    errors.push(
      "Release config check failed: bump-release-versions.mjs must discover publishable packages from release-packages.mjs.",
    );
  }
}

function assertActionBundleConfig(root, errors) {
  const rootPackage = readJson(root, "package.json");
  if (
    rootPackage.scripts?.["build:action"] !==
    "pnpm --filter @vitest-evals/github-reporter run build:action"
  ) {
    errors.push(
      "Release config check failed: root build:action must build @vitest-evals/github-reporter.",
    );
  }

  const action = readFile(root, "action.yml");
  const actionMain = action.match(/^\s*main:\s*(.+)$/m)?.[1];
  if (actionMain ? parseScalar(actionMain) !== ACTION_BUNDLE_MAIN : true) {
    errors.push(
      `Release config check failed: action.yml must run ${ACTION_BUNDLE_MAIN}.`,
    );
  }

  const actionConfig = readFile(
    root,
    "packages/github-reporter/tsup.action.config.ts",
  );
  const outDir = actionConfig.match(/outDir:\s*"([^"]+)"/)?.[1];
  if (!outDir) {
    errors.push(
      "Release config check failed: packages/github-reporter/tsup.action.config.ts must define outDir.",
    );
  } else {
    const resolvedOutDir = path
      .relative(root, path.resolve(root, "packages/github-reporter", outDir))
      .split(path.sep)
      .join("/");
    const expectedOutDir = path.posix.dirname(ACTION_BUNDLE_MAIN);

    if (resolvedOutDir !== expectedOutDir) {
      errors.push(
        `Release config check failed: action bundle outDir resolves to ${resolvedOutDir}, expected ${expectedOutDir}.`,
      );
    }
  }

  const updateActionTag = readFile(
    root,
    ".github/workflows/update-action-tag.yml",
  );
  if (!updateActionTag.includes(`git add -f ${ACTION_BUNDLE_MAIN}`)) {
    errors.push(
      `Release config check failed: update-action-tag.yml must commit ${ACTION_BUNDLE_MAIN}.`,
    );
  }

  const releaseWorkflow = readFile(root, ".github/workflows/release.yml");
  if (!releaseWorkflow.includes(`${ACTION_BUNDLE_MAIN}`)) {
    errors.push(
      `Release config check failed: release.yml must verify ${ACTION_BUNDLE_MAIN} on bundled action tags.`,
    );
  }
}

export function checkReleaseConfig(root = process.cwd()) {
  const packages = collectPublishablePackages(root);
  const expectedPackages = packages.map((packageInfo) => packageInfo.name);
  const targets = collectCraftTargets(root);
  const errors = [];

  assertGitHubTargetConfig(targets, errors);

  if (expectedPackages.length === 0) {
    errors.push(
      "Release config check failed: no publishable packages found under packages/.",
    );
  }

  const sources = [
    {
      label: ".craft.yml",
      packages: collectCraftPackages(root),
    },
    {
      label: ".github/workflows/merge-jobs.yml",
      packages: collectPackPackages(root),
    },
  ];

  for (const source of sources) {
    const mismatch = describeMismatch(expectedPackages, source.packages);

    if (mismatch) {
      errors.push(formatMismatch(source.label, mismatch));
    }
  }

  assertCraftNpmTargets({ packages, targets }, errors);
  assertVersionBumpConfig(root, errors);
  assertActionBundleConfig(root, errors);

  if (errors.length > 0) {
    throw new Error(
      `${errors.join("\n")}\nRelease config check failed. Align release package lists with publishable package manifests.`,
    );
  }

  return {
    packageCount: expectedPackages.length,
    sourceCount: sources.length + 1,
  };
}

export function isCliEntrypoint(argv = process.argv) {
  return Boolean(
    argv[1] && path.resolve(argv[1]) === fileURLToPath(import.meta.url),
  );
}

if (isCliEntrypoint()) {
  try {
    const result = checkReleaseConfig();
    console.log(
      `Release config OK: ${result.packageCount} packages aligned across ${result.sourceCount} sources.`,
    );
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
