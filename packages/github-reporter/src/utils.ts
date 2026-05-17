import { posix } from "node:path";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function compactLine(value: string, maxLength: number) {
  const line = value
    .split(/\r?\n/)
    .map((part) => part.trim())
    .find((part) => part.length > 0);
  if (!line) {
    return "";
  }
  return truncate(line, maxLength);
}

export function truncate(value: string, maxLength: number) {
  if (maxLength <= 0) {
    return "";
  }
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 15)).trimEnd()}... [truncated]`;
}

export function stringifyValue(value: unknown, maxLength: number) {
  if (value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return truncate(value, maxLength);
  }
  try {
    return truncate(JSON.stringify(value, null, 2), maxLength);
  } catch {
    return truncate(String(value), maxLength);
  }
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatScore(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) {
    return "n/a";
  }
  return value.toFixed(2);
}

export function formatDuration(ms: number | undefined) {
  if (ms === undefined || !Number.isFinite(ms)) {
    return "n/a";
  }
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  }
  const totalSeconds = Math.round(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export function formatLocation(
  file: string,
  location?: { line: number; column: number },
) {
  if (!location) {
    return file;
  }
  return `${file}:${location.line}`;
}

export function normalizePathForGitHub(path: string, workspace?: string) {
  const normalized = path.replace(/\\/g, "/");
  if (!workspace) {
    return normalized;
  }

  const workspacePath = workspace.replace(/\\/g, "/").replace(/\/+$/, "");
  if (
    normalized !== workspacePath &&
    !normalized.startsWith(`${workspacePath}/`)
  ) {
    return normalized;
  }

  return posix.relative(workspacePath, normalized);
}

export function escapeFence(value: string) {
  return value.replace(/```/g, "'''");
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function escapeCommandData(value: string) {
  return value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

export function escapeCommandProperty(value: string) {
  return escapeCommandData(value).replace(/:/g, "%3A").replace(/,/g, "%2C");
}
