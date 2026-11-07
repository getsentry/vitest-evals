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

/** Returns the directory every path shares, without a trailing slash. */
export function sharedDirectory(paths: string[]): string {
  const [first, ...rest] = paths.map((path) => path.split("/").slice(0, -1));
  if (!first) {
    return "";
  }
  let depth = 0;
  while (
    depth < first.length &&
    rest.every((segments) => segments[depth] === first[depth])
  ) {
    depth += 1;
  }
  return first.slice(0, depth).join("/");
}

/** Drops the shared directory so sibling result files stay distinguishable. */
export function distinctPathLabels(paths: string[]): string[] {
  const shared = paths.length > 1 ? sharedDirectory(paths) : "";
  return paths.map((path) =>
    shared ? path.slice(shared.length + 1) || path : path,
  );
}
