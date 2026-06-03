import type { EvalCase, EvalReport } from "./types";
import {
  compactLine,
  escapeCommandData,
  escapeCommandProperty,
  formatScore,
  stringifyValue,
  truncate,
} from "./utils";

/** Options for limiting rendered GitHub annotations. */
export type AnnotationOptions = {
  maxAnnotations?: number;
};

/** GitHub Check Run annotation payload. */
export type CheckAnnotation = {
  path: string;
  start_line: number;
  end_line: number;
  annotation_level: "failure" | "warning" | "notice";
  message: string;
  title?: string;
  raw_details?: string;
};

const DEFAULT_MAX_WORKFLOW_ANNOTATIONS = 10;
const DEFAULT_MAX_CHECK_ANNOTATIONS = 50;
const MAX_CHECK_FIELD_LENGTH = 64_000;

type AnnotatedEvalCase = EvalCase & {
  location: { line: number; column: number };
};

/** Renders GitHub workflow-command annotations for failed eval cases. */
export function renderWorkflowCommands(
  report: EvalReport,
  options: AnnotationOptions = {},
) {
  const maxAnnotations =
    options.maxAnnotations ?? DEFAULT_MAX_WORKFLOW_ANNOTATIONS;

  return report.failures
    .filter(hasAnnotationLocation)
    .slice(0, maxAnnotations)
    .map((testCase) =>
      formatWorkflowCommand({
        command: "error",
        properties: {
          file: testCase.displayFile,
          line: String(testCase.location.line),
          col: String(testCase.location.column),
          title: "vitest-evals",
        },
        message: formatWorkflowMessage(testCase),
      }),
    );
}

/** Builds Check Run annotations for failed eval cases. */
export function buildCheckAnnotations(
  report: EvalReport,
  options: AnnotationOptions = {},
): CheckAnnotation[] {
  const maxAnnotations = Math.min(
    options.maxAnnotations ?? DEFAULT_MAX_CHECK_ANNOTATIONS,
    DEFAULT_MAX_CHECK_ANNOTATIONS,
  );

  return report.failures
    .filter(hasAnnotationLocation)
    .slice(0, maxAnnotations)
    .map((testCase) => ({
      path: testCase.displayFile,
      start_line: testCase.location.line,
      end_line: testCase.location.line,
      annotation_level: "failure",
      title: truncate(
        `${testCase.primaryFailure?.judgeName ?? "vitest-evals"} - ${testCase.displayName}`,
        255,
      ),
      message: truncate(
        formatWorkflowMessage(testCase),
        MAX_CHECK_FIELD_LENGTH,
      ),
      raw_details: truncate(formatRawDetails(testCase), MAX_CHECK_FIELD_LENGTH),
    }));
}

function hasAnnotationLocation(
  testCase: EvalCase,
): testCase is AnnotatedEvalCase {
  return Boolean(testCase.location);
}

function formatWorkflowMessage(testCase: EvalCase) {
  const failure = testCase.primaryFailure;
  const parts = [
    testCase.displayName,
    `score ${formatScore(failure?.score ?? testCase.eval?.avgScore)}`,
  ];

  if (failure?.judgeName) {
    parts.push(failure.judgeName);
  }

  const reason = compactLine(failure?.reason ?? "", 320);
  if (reason) {
    parts.push(reason);
  }

  return parts.join(" - ");
}

function formatRawDetails(testCase: AnnotatedEvalCase) {
  const lines = [
    `Test: ${testCase.displayName}`,
    `Location: ${testCase.displayFile}:${testCase.location.line}`,
    `Harness: ${testCase.harness?.name ?? "n/a"}`,
    `Score: ${formatScore(testCase.primaryFailure?.score ?? testCase.eval?.avgScore)}`,
    `Judge: ${testCase.primaryFailure?.judgeName ?? "n/a"}`,
    "",
    "Reason:",
    testCase.primaryFailure?.reason ?? "n/a",
  ];

  const finalOutput = testCase.eval?.output ?? testCase.harness?.output;
  if (finalOutput !== undefined) {
    lines.push("", "Final:", stringifyValue(finalOutput, 8000));
  }

  if (testCase.toolCalls.length) {
    lines.push("", "Tools:");
    for (const toolCall of testCase.toolCalls) {
      lines.push(
        `- ${toolCall.name}: ${toolCall.error ? `error: ${toolCall.error}` : "ok"}`,
      );
    }
  }

  return lines.join("\n");
}

function formatWorkflowCommand({
  command,
  properties,
  message,
}: {
  command: "error" | "warning" | "notice";
  properties: Record<string, string>;
  message: string;
}) {
  const renderedProperties = Object.entries(properties)
    .map(([key, value]) => `${key}=${escapeCommandProperty(value)}`)
    .join(",");
  return `::${command} ${renderedProperties}::${escapeCommandData(message)}`;
}
