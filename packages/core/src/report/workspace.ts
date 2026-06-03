import { z } from "zod";
import {
  EvalMetaSchema,
  HarnessMetaSchema,
  readEvalTaskMeta,
} from "./metadata";
import { FiniteNumberSchema, parseWithSchema, isRecord } from "../schema-utils";
import {
  parseVitestJsonReport,
  VitestJsonLocationSchema,
  type VitestJsonAssertion,
  type VitestJsonReport,
} from "./vitest-json";
import { VitestJsonStatusSchema } from "./vitest-json";

/** Current schema version for collected report workspaces. */
export const REPORT_WORKSPACE_SCHEMA_VERSION = 1;

/** One collected Vitest JSON report source in a multi-run workspace. */
export const ReportRunSchema = z
  .object({
    id: z.string(),
    source: z.string().optional(),
    status: z.enum(["passed", "failed"]),
    startedAt: FiniteNumberSchema.optional(),
    durationMs: FiniteNumberSchema.optional(),
    totals: z.object({
      total: FiniteNumberSchema,
      passed: FiniteNumberSchema,
      failed: FiniteNumberSchema,
      skipped: FiniteNumberSchema,
      evalTotal: FiniteNumberSchema,
      evalPassed: FiniteNumberSchema,
      evalFailed: FiniteNumberSchema,
    }),
  })
  .strict();

/** One collected Vitest JSON report source in a multi-run workspace. */
export type ReportRun = z.infer<typeof ReportRunSchema>;

/** One eval or harness-backed test case collected from Vitest JSON. */
export const ReportCaseSchema = z
  .object({
    id: z.string(),
    runId: z.string(),
    source: z.string().optional(),
    file: z.string(),
    displayFile: z.string(),
    title: z.string(),
    fullName: z.string(),
    ancestorTitles: z.array(z.string()),
    tags: z.array(z.string()).optional(),
    displayName: z.string(),
    status: VitestJsonStatusSchema,
    durationMs: FiniteNumberSchema.optional(),
    location: VitestJsonLocationSchema.optional(),
    failureMessages: z.array(z.string()).default([]),
    eval: EvalMetaSchema.optional(),
    harness: HarnessMetaSchema.optional(),
  })
  .strict();

/** One eval or harness-backed test case collected from Vitest JSON. */
export type ReportCase = z.infer<typeof ReportCaseSchema>;

/** Full multi-run report workspace consumed by rich report UIs. */
export const ReportWorkspaceSchema = z
  .object({
    schemaVersion: z.literal(REPORT_WORKSPACE_SCHEMA_VERSION),
    runs: z.array(ReportRunSchema),
    cases: z.array(ReportCaseSchema),
  })
  .strict();

/** Full multi-run report workspace consumed by rich report UIs. */
export type ReportWorkspace = z.infer<typeof ReportWorkspaceSchema>;

/** Input accepted when collecting one Vitest JSON report into a workspace. */
export type ReportWorkspaceInput =
  | VitestJsonReport
  | {
      report: VitestJsonReport;
      source?: string;
    };

/** Options for collecting one or more Vitest JSON reports. */
export type CollectReportWorkspaceOptions = {
  /** Workspace prefix used to render source files as relative paths. */
  workspace?: string;
};

/** Parses and validates an unknown value as a collected report workspace. */
export function parseReportWorkspace(input: unknown): ReportWorkspace {
  return parseWithSchema(ReportWorkspaceSchema, input, "report workspace");
}

/** Collects eval and harness metadata from one or more Vitest JSON reports. */
export function collectReportWorkspace(
  input: ReportWorkspaceInput | ReportWorkspaceInput[],
  options: CollectReportWorkspaceOptions = {},
): ReportWorkspace {
  const entries = Array.isArray(input) ? input : [input];
  const runs: ReportRun[] = [];
  const cases: ReportCase[] = [];

  entries.forEach((entry, index) => {
    const { report, source } = normalizeWorkspaceInput(entry);
    const runId = source ?? `run-${index + 1}`;
    const runCases: ReportCase[] = [];

    for (const file of report.testResults) {
      for (const assertion of file.assertionResults) {
        const meta = readEvalTaskMeta(assertion.meta);
        if (!meta) {
          continue;
        }

        runCases.push({
          id: createCaseId(runId, file.name, assertion),
          runId,
          ...(source ? { source } : {}),
          file: file.name,
          displayFile: normalizeReportPath(file.name, options.workspace),
          title: assertion.title,
          fullName: assertion.fullName,
          ancestorTitles: assertion.ancestorTitles,
          ...(assertion.tags ? { tags: assertion.tags } : {}),
          displayName: formatDisplayName(assertion),
          status: assertion.status,
          ...(typeof assertion.duration === "number"
            ? { durationMs: assertion.duration }
            : {}),
          ...(assertion.location ? { location: assertion.location } : {}),
          failureMessages: assertion.failureMessages ?? [],
          ...(meta.eval ? { eval: meta.eval } : {}),
          ...(meta.harness ? { harness: meta.harness } : {}),
        });
      }
    }

    runs.push({
      id: runId,
      ...(source ? { source } : {}),
      status:
        report.success &&
        runCases.every((testCase) => testCase.status !== "failed")
          ? "passed"
          : "failed",
      startedAt: report.startTime,
      durationMs: resolveRunDuration(report),
      totals: {
        total: report.numTotalTests,
        passed: report.numPassedTests,
        failed: report.numFailedTests,
        skipped: report.numPendingTests + report.numTodoTests,
        evalTotal: runCases.length,
        evalPassed: runCases.filter((testCase) => testCase.status === "passed")
          .length,
        evalFailed: runCases.filter((testCase) => testCase.status === "failed")
          .length,
      },
    });
    cases.push(...runCases);
  });

  return {
    schemaVersion: REPORT_WORKSPACE_SCHEMA_VERSION,
    runs,
    cases,
  };
}

function normalizeWorkspaceInput(input: ReportWorkspaceInput) {
  if (isRecord(input) && "report" in input) {
    return {
      report: parseVitestJsonReport(input.report),
      source: typeof input.source === "string" ? input.source : undefined,
    };
  }

  return {
    report: parseVitestJsonReport(input),
  };
}

function createCaseId(
  runId: string,
  file: string,
  assertion: VitestJsonAssertion,
) {
  return [runId, file, assertion.location?.line ?? 0, assertion.fullName].join(
    ":",
  );
}

function formatDisplayName(assertion: VitestJsonAssertion) {
  return [...assertion.ancestorTitles, assertion.title]
    .filter((part) => part.length > 0)
    .join(" > ");
}

function resolveRunDuration(report: VitestJsonReport) {
  const intervals = report.testResults
    .map((file) => {
      if (
        !Number.isFinite(file.startTime) ||
        !Number.isFinite(file.endTime) ||
        file.endTime < file.startTime
      ) {
        return undefined;
      }

      return {
        start: file.startTime,
        end: file.endTime,
      };
    })
    .filter((interval): interval is { start: number; end: number } =>
      Boolean(interval),
    );

  if (intervals.length === 0) {
    return undefined;
  }

  return (
    Math.max(...intervals.map((interval) => interval.end)) -
    Math.min(...intervals.map((interval) => interval.start))
  );
}

function normalizeReportPath(path: string, workspace?: string) {
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

  return normalized.slice(workspacePath.length).replace(/^\/+/, "");
}
