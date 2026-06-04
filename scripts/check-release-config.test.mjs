import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { checkReleaseConfig } from "./check-release-config.mjs";

function writeFixtureFile(root, relativePath, contents) {
  const absolutePath = path.join(root, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, contents);
}

function packageTarget(packageName, includeNames = undefined) {
  const tarballBase = packageName.replace(/^@/, "").replaceAll("/", "-");
  const lines = ["  - name: npm", `    id: "${packageName}"`];

  if (packageName.startsWith("@")) {
    lines.push("    access: public");
  }

  lines.push(
    `    includeNames: ${includeNames ?? `/^${tarballBase}-\\d.*\\.tgz$/`}`,
  );

  return lines.join("\n");
}

function writeReleaseFixture({
  craftPackages,
  packPackages = craftPackages,
  publishablePackages = craftPackages,
}) {
  const root = mkdtempSync(path.join(tmpdir(), "vitest-evals-release-"));

  for (const packageName of publishablePackages) {
    const directory = packageName.replace(/^@vitest-evals\//, "");
    writeFixtureFile(
      root,
      `packages/${directory}/package.json`,
      `${JSON.stringify(
        {
          name: packageName,
          version: "1.2.3",
          ...(packageName.startsWith("@")
            ? { publishConfig: { access: "public" } }
            : {}),
        },
        null,
        2,
      )}\n`,
    );
  }

  writeFixtureFile(
    root,
    "packages/docs/package.json",
    `${JSON.stringify(
      {
        name: "vitest-evals-docs",
        private: true,
        version: "0.0.1",
      },
      null,
      2,
    )}\n`,
  );

  writeFixtureFile(
    root,
    ".craft.yml",
    [
      "preReleaseCommand: bash scripts/craft-pre-release.sh",
      "targets:",
      ...craftPackages.map((packageInfo) =>
        typeof packageInfo === "string"
          ? packageTarget(packageInfo)
          : packageTarget(packageInfo.name, packageInfo.includeNames),
      ),
      "  - name: github",
      "    tagPrefix: v",
      "    includeNames: /^$/",
      "",
    ].join("\n"),
  );

  writeFixtureFile(
    root,
    ".github/workflows/merge-jobs.yml",
    [
      "jobs:",
      "  build-publish:",
      "    steps:",
      "      - name: Pack NPM Tarballs",
      "        run: |",
      "          mkdir -p artifacts",
      ...packPackages.map(
        (packageName) =>
          `          pnpm --filter ${packageName} pack --pack-destination artifacts`,
      ),
      "",
    ].join("\n"),
  );

  writeFixtureFile(
    root,
    "package.json",
    `${JSON.stringify(
      {
        scripts: {
          "build:action":
            "pnpm --filter @vitest-evals/github-reporter run build:action",
        },
      },
      null,
      2,
    )}\n`,
  );

  writeFixtureFile(
    root,
    "scripts/craft-pre-release.sh",
    [
      "#!/bin/bash",
      'NEW_VERSION="${2}"',
      'node scripts/bump-release-versions.mjs "${NEW_VERSION}"',
      "",
    ].join("\n"),
  );

  writeFixtureFile(
    root,
    "scripts/bump-release-versions.mjs",
    'import { collectPublishablePackages } from "./release-packages.mjs";\ncollectPublishablePackages();\n',
  );

  writeFixtureFile(
    root,
    "action.yml",
    [
      "runs:",
      '  using: "node24"',
      '  main: "github-reporter/dist/action/index.js"',
      "",
    ].join("\n"),
  );

  writeFixtureFile(
    root,
    "packages/github-reporter/tsup.action.config.ts",
    'export default { outDir: "../../github-reporter/dist/action" };\n',
  );

  writeFixtureFile(
    root,
    ".github/workflows/update-action-tag.yml",
    "steps:\n  - run: git add -f github-reporter/dist/action/index.js\n",
  );

  writeFixtureFile(
    root,
    ".github/workflows/release.yml",
    'steps:\n  - run: git cat-file -e "$CURRENT_TAG:github-reporter/dist/action/index.js"\n',
  );

  return root;
}

describe("release config check", () => {
  test("passes when publishable package manifests match release config", () => {
    const root = writeReleaseFixture({
      craftPackages: [
        "vitest-evals",
        "@vitest-evals/harness-ai-sdk",
        "@vitest-evals/github-reporter",
      ],
    });

    expect(checkReleaseConfig(root)).toMatchObject({
      packageCount: 3,
      sourceCount: 3,
    });
  });

  test("fails when a publishable package is missing from Craft and packing", () => {
    const root = writeReleaseFixture({
      craftPackages: ["vitest-evals"],
      publishablePackages: ["vitest-evals", "@vitest-evals/harness-extra"],
    });

    expect(() => checkReleaseConfig(root)).toThrow(
      /Missing: @vitest-evals\/harness-extra/,
    );
  });

  test("fails when Craft includeNames does not match the package tarball", () => {
    const root = writeReleaseFixture({
      craftPackages: [
        "vitest-evals",
        {
          name: "@vitest-evals/harness-extra",
          includeNames: "/^vitest-evals-\\d.*\\.tgz$/",
        },
      ],
      packPackages: ["vitest-evals", "@vitest-evals/harness-extra"],
      publishablePackages: ["vitest-evals", "@vitest-evals/harness-extra"],
    });

    expect(() => checkReleaseConfig(root)).toThrow(
      /includeNames does not match vitest-evals-harness-extra-1\.2\.3\.tgz/,
    );
  });
});
