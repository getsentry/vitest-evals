/** Turns an absolute path into the path relative to the CLI workspace root. */
export function relativeDisplayPath(
  path: string | undefined,
  workspaceRoot: string | undefined,
): string {
  if (!path) {
    return "";
  }
  if (!workspaceRoot) {
    return path;
  }

  const root = workspaceRoot.replace(/\/+$/, "");
  if (path === root) {
    return path.split("/").pop() ?? path;
  }
  const prefix = `${root}/`;
  if (path.startsWith(prefix)) {
    return path.slice(prefix.length);
  }
  return path;
}

/** Resolves a displayed path back to an editor-openable absolute file. */
export function resolveOpenPath(
  path: string | undefined,
  workspaceRoot: string | undefined,
): string | undefined {
  if (!path) {
    return undefined;
  }
  if (path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path)) {
    return path;
  }
  if (!workspaceRoot) {
    return undefined;
  }
  return `${workspaceRoot.replace(/\/+$/, "")}/${path}`;
}
