export type EditorTarget = {
  id: string;
  label: string;
  href: string;
};

export type OpenFileTarget = {
  file: string;
  line?: number;
  column?: number;
};

/** Builds editor deep links for a source file. */
export function editorTargets(target: OpenFileTarget): EditorTarget[] {
  const location = fileLocation(target);
  return [
    {
      id: "vscode",
      label: "Open in VS Code",
      href: `vscode://file${location}`,
    },
    {
      id: "vscode-insiders",
      label: "Open in VS Code Insiders",
      href: `vscode-insiders://file${location}`,
    },
    { id: "cursor", label: "Open in Cursor", href: `cursor://file${location}` },
    { id: "zed", label: "Open in Zed", href: `zed://file${location}` },
  ];
}

function fileLocation(target: OpenFileTarget) {
  const file = toUrlPath(target.file);
  if (target.line === undefined) {
    return file;
  }
  if (target.column === undefined) {
    return `${file}:${target.line}`;
  }
  return `${file}:${target.line}:${target.column}`;
}

// Editor URL handlers expect `/C:/repo/file.ts` for Windows drive paths.
function toUrlPath(file: string) {
  if (/^[A-Za-z]:[\\/]/.test(file)) {
    return `/${file.replace(/\\/g, "/")}`;
  }
  return file;
}
