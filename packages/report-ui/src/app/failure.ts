export type FailureDiffLine = {
  type: "add" | "remove" | "context";
  text: string;
};

export type ParsedFailure = {
  name: string;
  headline: string;
  body: string;
  stack?: string;
  diffLines: FailureDiffLine[];
};

const STACK_LINE = /^\s+at\s+/;
const DIFF_LINE = /^([+-])\s.*$/;
const DIFF_HEADER = /^(Expected|Received|Actual|- Expected|\+ Received)\b/;

/** Splits a raw Vitest failure string into headline, diff, body, and stack. */
export function parseFailureMessage(message: string): ParsedFailure {
  const lines = message.replace(/\r\n/g, "\n").split("\n");
  const stackStart = lines.findIndex((line) => STACK_LINE.test(line));
  const contentLines = stackStart === -1 ? lines : lines.slice(0, stackStart);
  const stack =
    stackStart === -1 ? undefined : lines.slice(stackStart).join("\n").trim();

  const firstLine = contentLines[0] ?? "Failure";
  const named = firstLine.match(/^([A-Za-z_$][\w$]*(?:Error)?):\s*(.*)$/);
  const name = named?.[1] ?? "Error";
  const headline = (named?.[2] ?? firstLine).trim() || name;
  const rest = contentLines.slice(1);

  const diffLines = collectDiffLines(rest);
  const body = rest
    .filter((line) => !isDiffNoise(line))
    .join("\n")
    .trim();

  return {
    name,
    headline,
    body,
    stack: stack && stack.length > 0 ? stack : undefined,
    diffLines,
  };
}

function collectDiffLines(lines: string[]): FailureDiffLine[] {
  const collected: FailureDiffLine[] = [];
  for (const line of lines) {
    if (DIFF_HEADER.test(line.trim())) {
      collected.push({ type: "context", text: line.trim() });
      continue;
    }
    const diff = line.match(DIFF_LINE);
    if (!diff) {
      continue;
    }
    if (line.startsWith("---") || line.startsWith("+++")) {
      continue;
    }
    collected.push({
      type: diff[1] === "+" ? "add" : "remove",
      text: line.slice(1).trimStart(),
    });
  }
  return collected;
}

function isDiffNoise(line: string) {
  return (
    DIFF_HEADER.test(line.trim()) ||
    DIFF_LINE.test(line) ||
    line.startsWith("---") ||
    line.startsWith("+++")
  );
}
