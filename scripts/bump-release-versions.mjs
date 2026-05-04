#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const newVersion = process.argv[2];
if (!newVersion) {
  console.error("Usage: node scripts/bump-release-versions.mjs <new-version>");
  process.exit(1);
}

const files = [
  "packages/vitest-evals/package.json",
  "packages/harness-ai-sdk/package.json",
  "packages/harness-openai-agents/package.json",
  "packages/harness-pi-ai/package.json",
];

for (const relativePath of files) {
  const absolutePath = path.resolve(process.cwd(), relativePath);
  const pkg = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  pkg.version = newVersion;
  fs.writeFileSync(absolutePath, `${JSON.stringify(pkg, null, 2)}\n`);
}

console.log(`Updated ${files.length} package versions to ${newVersion}`);
