import type { ReportCase } from "@vitest-evals/core";

export type EditorTarget = {
  id: string;
  label: string;
  href: string;
};

/** Builds editor deep links for the case source file. */
export function editorTargets(testCase: ReportCase): EditorTarget[] {
  const location = fileLocation(testCase);
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

function fileLocation(testCase: ReportCase) {
  const line = testCase.location?.line;
  const column = testCase.location?.column;
  if (line === undefined) {
    return testCase.file;
  }
  if (column === undefined) {
    return `${testCase.file}:${line}`;
  }
  return `${testCase.file}:${line}:${column}`;
}
