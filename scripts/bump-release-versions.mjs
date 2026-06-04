#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { collectPublishablePackages } from "./release-packages.mjs";

const newVersion = process.argv[2];
if (!newVersion) {
  console.error("Usage: node scripts/bump-release-versions.mjs <new-version>");
  process.exit(1);
}

const packages = collectPublishablePackages();

if (packages.length === 0) {
  console.error("No publishable packages found under packages/.");
  process.exit(1);
}

for (const { relativePath } of packages) {
  const absolutePath = path.resolve(process.cwd(), relativePath);
  const pkg = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  pkg.version = newVersion;
  fs.writeFileSync(absolutePath, `${JSON.stringify(pkg, null, 2)}\n`);
}

console.log(`Updated ${packages.length} package versions to ${newVersion}`);
