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
  if (target.line === undefined) {
    return target.file;
  }
  if (target.column === undefined) {
    return `${target.file}:${target.line}`;
  }
  return `${target.file}:${target.line}:${target.column}`;
}
