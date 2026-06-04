import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export function collectPublishablePackages(root = process.cwd()) {
  const packagesDir = path.join(root, "packages");

  if (!existsSync(packagesDir)) {
    return [];
  }

  return readdirSync(packagesDir)
    .sort()
    .map((directory) => {
      const relativePath = path.posix.join(
        "packages",
        directory,
        "package.json",
      );
      const absolutePath = path.join(root, relativePath);

      if (!existsSync(absolutePath)) {
        return null;
      }

      const packageJson = JSON.parse(readFileSync(absolutePath, "utf8"));

      if (packageJson.private === true) {
        return null;
      }

      if (
        typeof packageJson.name !== "string" ||
        packageJson.name.length === 0
      ) {
        throw new Error(
          `${relativePath} is publishable but has no package name.`,
        );
      }

      if (
        typeof packageJson.version !== "string" ||
        packageJson.version.length === 0
      ) {
        throw new Error(`${relativePath} is publishable but has no version.`);
      }

      return {
        name: packageJson.name,
        packageJson,
        relativePath,
        version: packageJson.version,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function packageTarballBaseName(packageName) {
  return packageName.replace(/^@/, "").replaceAll("/", "-");
}

export function packageTarballName(packageInfo) {
  return `${packageTarballBaseName(packageInfo.name)}-${packageInfo.version}.tgz`;
}
