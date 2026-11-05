const ANSI_PATTERN =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: strip terminal color / cursor codes
  /\u001B\[[\d;?]*[ -/]*[@-~]|\u001B\][\s\S]*?(?:\u0007|\u001B\\)|\u001B[@-Z\\]/g;

/** Strips ANSI color and cursor sequences from a vitest log. */
export function stripAnsi(value: string): string {
  return value
    .replace(ANSI_PATTERN, "")
    .replace(/\[(?:\d{1,3};)*\d{1,3}m/g, "");
}

/** Makes a vitest log readable in the report tray. */
export function formatVitestLog(value: string): string {
  return stripAnsi(value)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
