import { readdir } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

/** Options for resolving eval result file paths. */
export type ResolveResultFilesOptions = {
  cwd?: string;
};

const GLOB_META_PATTERN = /[*?]/;

/** Resolves result file paths and simple glob patterns into concrete files. */
export async function resolveResultFiles(
  patterns: string[],
  options: ResolveResultFilesOptions = {},
) {
  const cwd = options.cwd ?? process.cwd();
  const files: string[] = [];

  for (const pattern of patterns.map((entry) => entry.trim()).filter(Boolean)) {
    if (hasGlob(pattern)) {
      files.push(...(await expandGlob(pattern, cwd)));
    } else {
      files.push(isAbsolute(pattern) ? pattern : resolve(cwd, pattern));
    }
  }

  return [...new Set(files)].sort();
}

/** Splits a GitHub Action results input into path and glob entries. */
export function splitResultsInput(value: string | undefined) {
  return (value ?? "")
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function hasGlob(pattern: string) {
  return GLOB_META_PATTERN.test(pattern);
}

async function expandGlob(pattern: string, cwd: string) {
  const normalizedPattern = normalizeGlobPattern(pattern);
  const absolutePattern = isAbsolute(pattern);
  const base = globBase(normalizedPattern);
  const basePath = absolutePattern ? base || sep : resolve(cwd, base || ".");
  const regex = globToRegExp(normalizedPattern);
  const matches: string[] = [];

  for (const file of await listFiles(basePath)) {
    const normalizedFile = normalizePath(file);
    const candidate = absolutePattern
      ? normalizedFile
      : normalizePath(relative(resolve(cwd), file));
    if (regex.test(candidate)) {
      matches.push(file);
    }
  }

  return matches;
}

function globBase(pattern: string) {
  const segments = pattern.split("/");
  const baseSegments: string[] = [];

  for (const segment of segments) {
    if (hasGlob(segment)) {
      break;
    }
    baseSegments.push(segment);
  }

  return baseSegments.join("/");
}

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readDirectory(directory);
  if (!entries) {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const child = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(child)));
    } else if (entry.isFile()) {
      files.push(child);
    }
  }
  return files;
}

async function readDirectory(directory: string) {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch {
    return undefined;
  }
}

function globToRegExp(pattern: string) {
  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];

    if (char === "*" && next === "*") {
      const following = pattern[index + 2];
      if (following === "/") {
        source += "(?:.*/)?";
        index += 2;
      } else {
        source += ".*";
        index += 1;
      }
      continue;
    }

    if (char === "*") {
      source += "[^/]*";
      continue;
    }

    if (char === "?") {
      source += "[^/]";
      continue;
    }

    source += escapeRegExp(char ?? "");
  }

  return new RegExp(`^${source}$`);
}

function escapeRegExp(value: string) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function normalizePath(path: string) {
  return path.replace(/\\/g, "/");
}

function normalizeGlobPattern(pattern: string) {
  const normalizedPattern = normalizePath(pattern);
  if (isAbsolute(pattern)) {
    return normalizedPattern;
  }

  return normalizedPattern.replace(/^(\.\/)+/, "");
}
