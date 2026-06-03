import { appendFile } from "node:fs/promises";
import {
  readVitestJsonReportFile,
  resolveResultFiles,
} from "@vitest-evals/core/node";
import { renderWorkflowCommands } from "./annotations";
import { collectEvalReport } from "./collect";
import { publishCheckRun, type PublishCheckRunResult } from "./github";
import { mergeEvalReports } from "./merge";
import { renderJobSummary, type SummaryOptions } from "./summary";
import type { EvalReport } from "./types";

/** Options for reading eval JSON files and publishing GitHub report surfaces. */
export type PublishEvalReportOptions = SummaryOptions & {
  resultPatterns: string[];
  cwd?: string;
  workspace?: string;
  summaryEnabled?: boolean;
  summaryPath?: string;
  annotations?: boolean;
  checkRun?: boolean;
  failOnCheckError?: boolean;
  maxAnnotations?: number;
  checkRunId?: number;
  checkName?: string;
  token?: string;
  repository?: string;
  sha?: string;
  warn?: (message: string) => void;
};

/** Result from publishing eval reports, including merged report data. */
export type PublishEvalReportResult = {
  report: EvalReport;
  resultFiles: string[];
  checkRun?: PublishCheckRunResult;
};

/** Reads, merges, and publishes eval reports to GitHub Actions surfaces. */
export async function publishEvalReport(
  options: PublishEvalReportOptions,
): Promise<PublishEvalReportResult> {
  const resultFiles = await resolveResultFiles(options.resultPatterns, {
    cwd: options.cwd,
  });
  if (resultFiles.length === 0) {
    throw new Error(
      `No eval result files matched: ${options.resultPatterns.join(", ")}`,
    );
  }

  const reports = await Promise.all(
    resultFiles.map(async (resultFile) => {
      const json = await readVitestJsonReportFile(resultFile);
      return collectEvalReport(json, {
        workspace: options.workspace,
      });
    }),
  );
  const report = mergeEvalReports(reports);
  const summary = renderJobSummary(report, {
    maxFailures: options.maxFailures,
    maxOutputChars: options.maxOutputChars,
    maxReasonChars: options.maxReasonChars,
    maxToolCalls: options.maxToolCalls,
  });

  if (options.summaryEnabled !== false) {
    if (options.summaryPath) {
      await appendFile(options.summaryPath, `${summary}\n`);
    } else {
      console.log(summary);
    }
  }

  if (options.annotations) {
    for (const command of renderWorkflowCommands(report, {
      maxAnnotations: options.maxAnnotations,
    })) {
      console.log(command);
    }
  }

  let checkRun: PublishCheckRunResult | undefined;
  if (options.checkRun) {
    try {
      checkRun = await publishCheckRun(report, {
        checkRunId: options.checkRunId,
        maxAnnotations: options.maxAnnotations,
        maxFailures: options.maxFailures,
        maxOutputChars: options.maxOutputChars,
        maxReasonChars: options.maxReasonChars,
        maxToolCalls: options.maxToolCalls,
        name: options.checkName,
        repository: options.repository,
        sha: options.sha,
        token: options.token,
      });

      if (checkRun.status === "skipped") {
        options.warn?.(`GitHub Check Run skipped: ${checkRun.reason}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (options.failOnCheckError) {
        throw error;
      }
      options.warn?.(message);
    }
  }

  return {
    report,
    resultFiles,
    checkRun,
  };
}
