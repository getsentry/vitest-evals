import { readdir, readFile, stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import {
  collectReportWorkspace,
  type CollectReportWorkspaceOptions,
  type ReportWorkspace,
} from "./report/workspace";
import {
  parseVitestJsonReport,
  type VitestJsonReport,
} from "./report/vitest-json";

/** Options for resolving eval result file paths. */
export type ResolveReportFilesOptions = {
  /** Directory used to resolve relative paths and globs. */
  cwd?: string;
  /** File extensions included when an input resolves to a directory. */
  extensions?: string[];
};

/** Options for reading Vitest JSON reports into a collected workspace. */
export type ReadReportWorkspaceOptions = ResolveReportFilesOptions &
  CollectReportWorkspaceOptions;

const GLOB_META_PATTERN = /[*?]/;
const DEFAULT_REPORT_EXTENSIONS = [".json"];

/**
 * Resolves result files from explicit paths, directories, and simple glob
 * patterns. Nonexistent explicit paths are preserved so callers can surface a
 * useful read error with the original filename.
 */
export async function resolveReportFiles(
  patterns: string[],
  options: ResolveReportFilesOptions = {},
) {
  const cwd = options.cwd ?? process.cwd();
  const extensions = normalizeExtensions(
    options.extensions ?? DEFAULT_REPORT_EXTENSIONS,
  );
  const files: string[] = [];

  for (const pattern of patterns.map((entry) => entry.trim()).filter(Boolean)) {
    if (hasGlob(pattern)) {
      files.push(...(await expandGlob(pattern, cwd)));
      continue;
    }

    const candidate = isAbsolute(pattern) ? pattern : resolve(cwd, pattern);
    const candidateStat = await readStat(candidate);
    if (candidateStat?.isDirectory()) {
      files.push(...(await listReportFiles(candidate, extensions)));
      continue;
    }

    files.push(candidate);
  }

  return [...new Set(files)].sort();
}

/** Backwards-compatible alias for consumers that call them Vitest result files. */
export const resolveResultFiles = resolveReportFiles;

/** Splits a newline-separated report input into path and glob entries. */
export function splitReportInput(value: string | undefined) {
  return (value ?? "")
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** Backwards-compatible alias for GitHub Action result inputs. */
export const splitResultsInput = splitReportInput;

/** Reads and parses one Vitest JSON report file. */
export async function readVitestJsonReportFile(
  resultFile: string,
): Promise<VitestJsonReport> {
  try {
    return parseVitestJsonReport(
      JSON.parse(await readFile(resultFile, "utf8")),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to read eval result file ${resultFile}: ${message}`,
    );
  }
}

/** Resolves result inputs and collects them into a report workspace. */
export async function readReportWorkspace(
  patterns: string[],
  options: ReadReportWorkspaceOptions = {},
): Promise<{ workspace: ReportWorkspace; resultFiles: string[] }> {
  const cwd = options.cwd ?? process.cwd();
  const resultFiles = await resolveReportFiles(patterns, { ...options, cwd });
  if (resultFiles.length === 0) {
    throw new Error(`No eval result files matched: ${patterns.join(", ")}`);
  }

  const reports = await Promise.all(
    resultFiles.map(async (resultFile) => ({
      report: await readVitestJsonReportFile(resultFile),
      source: displayReportSource(resultFile, cwd),
    })),
  );

  return {
    resultFiles,
    workspace: collectReportWorkspace(reports, {
      workspace: options.workspace,
    }),
  };
}

function displayReportSource(resultFile: string, cwd: string) {
  const relativeSource = normalizePath(relative(resolve(cwd), resultFile));
  if (
    relativeSource === "" ||
    relativeSource === "." ||
    relativeSource.startsWith("../")
  ) {
    return resultFile;
  }

  return relativeSource;
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

async function listReportFiles(directory: string, extensions: Set<string>) {
  const files = await listFiles(directory);
  return files.filter((file) => extensions.has(extname(file).toLowerCase()));
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

async function readStat(path: string) {
  try {
    return await stat(path);
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

function normalizeExtensions(extensions: string[]) {
  return new Set(
    extensions.map((extension) =>
      extension.startsWith(".")
        ? extension.toLowerCase()
        : `.${extension.toLowerCase()}`,
    ),
  );
}
