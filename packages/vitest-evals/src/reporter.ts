import { DefaultReporter, VerboseReporter } from "vitest/node";
import c from "tinyrainbow";
import type { ToolCallRecord, UsageSummary } from "./harness";
import { toolCalls } from "./harness";

const TEST_NAME_SEPARATOR = c.dim(" > ");
const TOOL_DETAIL_ENV = "VITEST_EVALS_TOOL_DETAILS";
const TOOL_DETAIL_LEVEL_ENV = "VITEST_EVALS_TOOL_DETAILS_LEVEL";
const DEFAULT_TOOL_DETAIL_LEVEL = 0;

type EvalReporterOptions = {
  isTTY?: boolean;
  silent?: boolean | "passed-only";
  toolDetails?: boolean | number;
};

export default class DefaultEvalReporter extends VerboseReporter {
  private readonly toolDetailLevel: number;

  constructor(options: EvalReporterOptions = {}) {
    super(options);
    this.toolDetailLevel = this.resolveToolDetailLevel(options.toolDetails);
  }

  override onTestCaseResult(test: any): void {
    const meta = test.meta();
    if (!meta.eval && !meta.harness) {
      super.onTestCaseResult(test);
      return;
    }

    // Preserve DefaultReporter's bookkeeping without letting VerboseReporter
    // print the stock per-test line; eval cases need custom score output.
    DefaultReporter.prototype.onTestCaseResult.call(this, test);

    const testResult = test.result();
    if (
      this.ctx.config.hideSkippedTests &&
      testResult.state === "skipped" &&
      test.options?.mode !== "todo"
    ) {
      return;
    }

    if (meta.harness) {
      this.logHarnessTestCase(test, meta.harness);
      if (testResult.state !== "failed" && meta.eval?.scores?.length) {
        this.logJudgeScoreDetails(meta.eval.scores);
      }
    } else if (meta.eval) {
      this.logEvalTestCase(test, meta.eval.avgScore);
    }

    if (testResult.state === "failed") {
      if (meta.harness && meta.eval?.thresholdFailed) {
        this.logEvalFailureDetails(meta.eval, testResult.errors, {
          includeFinal: false,
        });
      } else if (meta.harness) {
        this.logFailureDetails(testResult.errors);
      } else if (meta.eval) {
        this.logEvalFailureDetails(meta.eval, testResult.errors);
      } else {
        this.logFailureDetails(testResult.errors);
      }
    }

    if (test.annotations().length) {
      this.log();
      this.printAnnotations(test, "log", 3);
      this.log();
    }
  }

  override reportSummary(files: any[], errors: any[]): void {
    if (!this.isEvalOnlyRun(files)) {
      super.reportSummary(files, errors);
      return;
    }

    if (errors.length > 0) {
      this.ctx.logger.printUnhandledErrors(errors);
      this.error();
    }

    const leakCount = (DefaultReporter.prototype as any).printLeaksSummary.call(
      this,
    );
    (DefaultReporter.prototype as any).reportTestSummary.call(
      this,
      files,
      errors,
      leakCount,
    );
  }

  private logEvalTestCase(test: any, avgScore: number): void {
    const colorFn =
      avgScore < 0.5 ? c.red : avgScore < 0.75 ? c.yellow : c.green;

    let title = this.getFormattedTestTitle(test);
    title += ` [${colorFn(avgScore.toFixed(2))}]`;
    title += this.getTestCaseSuffix(test);

    this.log(title);
  }

  private logHarnessTestCase(
    test: any,
    harnessMeta: {
      name: string;
      run: {
        session: Parameters<typeof toolCalls>[0];
        output?: unknown;
        usage?: {
          totalTokens?: number;
          inputTokens?: number;
          outputTokens?: number;
          reasoningTokens?: number;
          toolCalls?: number;
        };
        errors?: unknown[];
      };
    },
  ): void {
    let title = this.getFormattedTestTitle(test);
    const summary = this.formatHarnessSummary(harnessMeta);
    if (summary) {
      title += c.dim(` [${summary}]`);
    }
    title += this.getTestCaseSuffix(test);

    this.log(title);

    if (this.toolDetailLevel > 0) {
      this.logHarnessToolDetails(harnessMeta.run);
    }
  }

  private formatHarnessSummary(harnessMeta: {
    name: string;
    run: {
      session: Parameters<typeof toolCalls>[0];
      usage?: {
        totalTokens?: number;
        inputTokens?: number;
        outputTokens?: number;
        reasoningTokens?: number;
        toolCalls?: number;
      };
      errors?: unknown[];
    };
  }) {
    const parts: string[] = [];
    const totalTokens =
      harnessMeta.run.usage?.totalTokens ??
      (harnessMeta.run.usage?.inputTokens ?? 0) +
        (harnessMeta.run.usage?.outputTokens ?? 0) +
        (harnessMeta.run.usage?.reasoningTokens ?? 0);
    const totalTools =
      harnessMeta.run.usage?.toolCalls ??
      toolCalls(harnessMeta.run.session).length;

    if (totalTokens > 0) {
      parts.push(`${totalTokens} tok`);
    }
    if (totalTools > 0) {
      parts.push(`${totalTools} tool${totalTools === 1 ? "" : "s"}`);
    }
    if ((harnessMeta.run.errors?.length ?? 0) > 0) {
      parts.push(`${harnessMeta.run.errors?.length} err`);
    }

    return parts.length > 0 ? parts.join(" | ") : null;
  }

  private logHarnessToolDetails(run: {
    session: Parameters<typeof toolCalls>[0];
    output?: unknown;
  }) {
    const calls = toolCalls(run.session);
    const hasOutput = this.summarizeValue(run.output) !== null;

    for (const [index, call] of calls.entries()) {
      const isLastItem = index === calls.length - 1 && !hasOutput;
      for (const line of this.formatToolCallLines(call, isLastItem)) {
        this.log(line);
      }

      if (this.toolDetailLevel >= 4 && call.arguments !== undefined) {
        this.log(this.formatRawLine("raw in", call.arguments, isLastItem));
      }
      if (this.toolDetailLevel >= 4) {
        if (call.error) {
          this.log(this.formatRawLine("raw err", call.error, isLastItem));
        } else if (call.result !== undefined) {
          this.log(this.formatRawLine("raw out", call.result, isLastItem));
        }
      }
    }

    const outputSummary = this.summarizeValue(run.output);
    if (outputSummary) {
      this.log(this.formatOutputLine(outputSummary));
    }
  }

  private formatToolCallLines(call: ToolCallRecord, isLastItem: boolean) {
    const prefix = c.dim(`   ${this.getItemPrefix(isLastItem)} `);
    const detailPrefix = c.dim(this.getDetailPrefix(isLastItem));
    const lines = [
      `${prefix}${c.dim(this.formatFieldLabel("tool"))} ${c.cyan(call.name)}`,
    ];

    const argumentsSummary = this.formatToolCallArguments(call.arguments);
    if (argumentsSummary) {
      lines.push(
        `${detailPrefix}${c.dim(this.formatFieldLabel("args"))} ${argumentsSummary}`,
      );
    }

    lines.push(
      `${detailPrefix}${c.dim(this.formatFieldLabel(call.error ? "error" : "result"))} ${this.formatToolCallOutcome(call)}`,
    );

    return lines;
  }

  private formatToolCallOutcome(call: ToolCallRecord) {
    const totalTokens = this.getToolCallTokens(call);
    const replayStatus = this.getReplayStatus(call);
    const summary = call.error
      ? this.summarizeValue(call.error)
      : this.summarizeToolResult(call.result, call.arguments);
    const responseSize = this.getSerializedSize(call.error ?? call.result);
    const metrics: string[] = [];

    if (replayStatus) {
      metrics.push(replayStatus);
    }
    if (this.toolDetailLevel >= 2 && totalTokens && totalTokens > 0) {
      metrics.push(`${totalTokens} tok`);
    } else if (this.toolDetailLevel >= 2 && responseSize !== null) {
      metrics.push(this.formatBytes(responseSize));
    }
    if (
      this.toolDetailLevel >= 2 &&
      call.durationMs !== undefined &&
      call.durationMs > 0
    ) {
      metrics.push(`${call.durationMs}ms`);
    }

    const outcome = summary ?? (call.error ? "tool failed" : "ok");
    const metricsText =
      metrics.length > 0 ? ` ${c.dim(`[${metrics.join(" | ")}]`)}` : "";
    if (call.error) {
      return `${c.red(outcome)}${metricsText}`;
    }

    return `${outcome}${metricsText}`;
  }

  private getItemPrefix(isLastItem: boolean) {
    return isLastItem ? "└─" : "├─";
  }

  private getDetailPrefix(isLastItem: boolean) {
    return isLastItem ? "      " : "   │  ";
  }

  private formatRawLine(
    label: "raw in" | "raw out" | "raw err",
    value: unknown,
    isLastItem: boolean,
  ) {
    return c.dim(
      `${this.getDetailPrefix(isLastItem)}${this.formatFieldLabel(label)} ${this.formatInlineJson(
        value,
        {
          maxLength: 160,
        },
      )}`,
    );
  }

  private formatOutputLine(summary: string) {
    return `${c.dim(`   ${this.getItemPrefix(true)} `)}${c.dim(this.formatFieldLabel("final"))} ${summary}`;
  }

  private logJudgeScoreDetails(
    scores: Array<{
      name?: string;
      score?: number | null;
    }>,
  ) {
    for (const score of scores) {
      this.log(
        this.formatDetailLine(
          "score",
          `${score.name || "Unknown"} ${this.formatScore(score.score ?? 0)}`,
        ),
      );
    }
  }

  private formatFieldLabel(
    label:
      | "tool"
      | "args"
      | "result"
      | "error"
      | "final"
      | "reason"
      | "score"
      | "raw in"
      | "raw out"
      | "raw err",
  ) {
    return label.padEnd(7, " ");
  }

  private logEvalFailureDetails(
    evalMeta: {
      avgScore: number;
      output?: unknown;
      scores?: Array<{
        name?: string;
        score?: number | null;
        metadata?: {
          rationale?: string;
          output?: unknown;
        };
      }>;
    },
    errors: Array<{ message?: string }>,
    options: {
      includeFinal?: boolean;
    } = {},
  ) {
    const scoredFailures = [...(evalMeta.scores ?? [])]
      .filter(
        (score) =>
          (score.score ?? 0) < 1 ||
          score.metadata?.rationale ||
          score.metadata?.output !== undefined,
      )
      .sort((left, right) => (left.score ?? 0) - (right.score ?? 0));

    if (scoredFailures.length <= 1) {
      const primary = scoredFailures[0];
      if (primary) {
        this.log(
          this.formatDetailLine(
            "score",
            `${primary.name || "Unknown"} ${this.formatScore(primary.score ?? 0)}`,
          ),
        );
      }
      const reason =
        primary?.metadata?.rationale ?? this.getCompactErrorMessage(errors);
      if (reason) {
        this.log(this.formatDetailLine("reason", reason));
      }
    } else {
      for (const score of scoredFailures.slice(0, 3)) {
        const scoreValue = this.formatScore(score.score ?? 0);
        const rationale = score.metadata?.rationale
          ? ` ${c.dim("·")} ${score.metadata.rationale}`
          : "";
        this.log(
          this.formatDetailLine(
            "score",
            `${score.name || "Unknown"} ${scoreValue}${rationale}`,
          ),
        );
      }
    }

    const outputSummary = this.summarizeEvalOutput(evalMeta.output);
    if (options.includeFinal !== false && outputSummary) {
      this.log(this.formatDetailLine("final", outputSummary));
    }
  }

  private logFailureDetails(errors: Array<{ message?: string }>) {
    const message = this.getCompactErrorMessage(errors);
    if (!message) {
      return;
    }

    this.log(this.formatDetailLine("reason", c.red(message)));
  }

  private formatDetailLine(label: "reason" | "score" | "final", value: string) {
    if (label === "final") {
      return `${c.dim("   ")}${c.dim(this.formatFieldLabel("final"))} ${value}`;
    }

    const renderedValue = label === "reason" ? c.red(value) : value;
    return `${c.dim("   ")}${c.dim(this.formatFieldLabel(label))} ${renderedValue}`;
  }

  private summarizeEvalOutput(value: unknown) {
    if (typeof value !== "string") {
      return this.summarizeValue(value);
    }

    const trimmed = value.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
      return this.summarizeValue(value);
    }

    try {
      return this.summarizeValue(JSON.parse(trimmed));
    } catch {
      return this.summarizeValue(value);
    }
  }

  private getCompactErrorMessage(errors: Array<{ message?: string }>) {
    for (const error of errors) {
      const message = error.message?.split("\n")[0]?.trim();
      if (message) {
        return message;
      }
    }

    return null;
  }

  private isEvalOnlyRun(files: Array<{ filepath?: string; name?: string }>) {
    return (
      files.length > 0 &&
      files.every((file) => {
        const path = String(file.filepath ?? file.name ?? "");
        return path.endsWith(".eval.ts");
      })
    );
  }

  private summarizeToolArguments(value: unknown, maxLength: number) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return this.summarizeValue(value);
    }

    return this.summarizeRecord(value as Record<string, unknown>, undefined, {
      separator: ", ",
      maxLength,
    });
  }

  private formatToolCallArguments(value: unknown) {
    if (
      value === undefined ||
      value === null ||
      (typeof value === "object" &&
        !Array.isArray(value) &&
        Object.keys(value as Record<string, unknown>).length === 0)
    ) {
      return null;
    }

    const maxLength = this.toolDetailLevel >= 3 ? 160 : 96;
    return this.summarizeToolArguments(value, maxLength);
  }

  private formatScore(score: number) {
    const rendered = score.toFixed(2);
    if (score < 0.5) {
      return c.red(rendered);
    }
    if (score < 0.75) {
      return c.yellow(rendered);
    }
    return c.green(rendered);
  }

  private summarizeToolResult(result: unknown, argumentsValue: unknown) {
    if (
      !result ||
      typeof result !== "object" ||
      Array.isArray(result) ||
      !argumentsValue ||
      typeof argumentsValue !== "object" ||
      Array.isArray(argumentsValue)
    ) {
      return this.summarizeValue(result);
    }

    const summarized = this.summarizeRecord(
      result as Record<string, unknown>,
      argumentsValue as Record<string, unknown>,
    );
    return summarized ?? this.summarizeValue(result);
  }

  private summarizeValue(value: unknown): string | null {
    if (value === undefined) {
      return null;
    }

    if (value === null) {
      return "null";
    }

    if (typeof value === "string") {
      const formatted = this.formatSummaryPrimitive(value);
      return formatted === null ? null : this.truncateSummary(formatted);
    }

    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        return "array(0)";
      }

      const first: string | null = this.summarizeValue(value[0]);
      const suffix = value.length > 1 ? " ..." : "";
      return this.truncateSummary(
        `array(${value.length}) ${first ?? ""}${suffix}`.trim(),
      );
    }

    if (typeof value === "object") {
      return this.summarizeRecord(value as Record<string, unknown>);
    }

    return this.truncateSummary(String(value));
  }

  private resolveToolDetailLevel(
    toolDetails: EvalReporterOptions["toolDetails"],
  ) {
    if (typeof toolDetails === "number") {
      return Math.max(DEFAULT_TOOL_DETAIL_LEVEL, Math.floor(toolDetails));
    }

    if (toolDetails === true) {
      return 2;
    }

    const levelFromEnv = Number.parseInt(
      process.env[TOOL_DETAIL_LEVEL_ENV] ?? "",
      10,
    );
    if (Number.isFinite(levelFromEnv)) {
      return Math.max(DEFAULT_TOOL_DETAIL_LEVEL, levelFromEnv);
    }

    if (process.env[TOOL_DETAIL_ENV] === "1") {
      return 2;
    }

    return DEFAULT_TOOL_DETAIL_LEVEL;
  }

  private getToolCallTokens(call: ToolCallRecord) {
    const usage = call.metadata?.usage;
    if (this.isUsageSummary(usage)) {
      return (
        usage.totalTokens ??
        (usage.inputTokens ?? 0) +
          (usage.outputTokens ?? 0) +
          (usage.reasoningTokens ?? 0)
      );
    }

    const metadataTotalTokens = call.metadata?.totalTokens;
    return typeof metadataTotalTokens === "number" ? metadataTotalTokens : null;
  }

  private getReplayStatus(call: ToolCallRecord) {
    const replay = call.metadata?.replay;
    if (
      replay &&
      typeof replay === "object" &&
      !Array.isArray(replay) &&
      "status" in replay
    ) {
      const status = (replay as { status?: unknown }).status;
      if (status === "recorded" || status === "replayed") {
        return status;
      }
    }

    return null;
  }

  private getSerializedSize(value: unknown) {
    if (value === undefined) {
      return null;
    }

    let formatted: string;
    try {
      formatted = JSON.stringify(value);
    } catch {
      formatted = String(value);
    }

    return Buffer.byteLength(formatted, "utf8");
  }

  private formatBytes(bytes: number) {
    if (bytes < 1024) {
      return `${bytes}B`;
    }

    const kib = bytes / 1024;
    if (kib < 10) {
      return `${kib.toFixed(1)}KB`;
    }

    return `${Math.round(kib)}KB`;
  }

  private isUsageSummary(value: unknown): value is UsageSummary {
    return Boolean(value && typeof value === "object");
  }

  private formatInlineJson(
    value: unknown,
    { maxLength }: { maxLength: number },
  ) {
    let formatted: string;
    try {
      formatted = JSON.stringify(value);
    } catch {
      formatted = String(value);
    }

    if (formatted.length <= maxLength) {
      return formatted;
    }

    return `${formatted.slice(0, maxLength - 3)}...`;
  }

  private truncateSummary(value: string, maxLength = 96) {
    if (value.length <= maxLength) {
      return value;
    }

    return `${value.slice(0, maxLength - 3)}...`;
  }

  private formatSummaryPrimitive(value: unknown): string | null {
    if (value === undefined) {
      return null;
    }

    if (value === null) {
      return "null";
    }

    if (typeof value === "string") {
      const truncated = this.truncateSummary(value, 32);
      return /^[a-zA-Z0-9_.:-]+$/.test(truncated)
        ? truncated
        : JSON.stringify(truncated);
    }

    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }

    if (Array.isArray(value)) {
      return `array(${value.length})`;
    }

    if (typeof value === "object") {
      return `object(${Object.keys(value as Record<string, unknown>).length})`;
    }

    return String(value);
  }

  private summarizeRecord(
    record: Record<string, unknown>,
    omitMatchingValuesFrom?: Record<string, unknown>,
    options: {
      separator?: string;
      maxLength?: number;
    } = {},
  ) {
    const separator = options.separator ?? " ";
    const maxLength = options.maxLength ?? 96;
    const keys = Object.keys(record);
    if (keys.length === 0) {
      return "object(0)";
    }

    const preferredKeys = [
      "status",
      "invoiceId",
      "refundId",
      "id",
      "amount",
      "customer",
      "refundable",
      "reason",
      "message",
      "type",
      "name",
    ];

    const visibleKeys = keys.filter((key) => {
      if (!omitMatchingValuesFrom || !(key in omitMatchingValuesFrom)) {
        return true;
      }

      return !this.valuesMatch(record[key], omitMatchingValuesFrom[key]);
    });

    const orderedKeys = [
      ...preferredKeys.filter((key) => visibleKeys.includes(key)),
      ...visibleKeys.filter((key) => !preferredKeys.includes(key)),
    ].slice(0, 4);

    const parts = orderedKeys
      .map((key) => {
        const formattedValue = this.formatSummaryPrimitive(record[key]);
        return formattedValue === null ? null : `${key}=${formattedValue}`;
      })
      .filter((part): part is string => part !== null);

    if (parts.length === 0) {
      return null;
    }

    const suffix = visibleKeys.length > orderedKeys.length ? " ..." : "";
    return this.truncateSummary(`${parts.join(separator)}${suffix}`, maxLength);
  }

  private valuesMatch(left: unknown, right: unknown): boolean {
    if (left === right) {
      return true;
    }

    if (left === null || right === null) {
      return left === right;
    }

    if (Array.isArray(left) && Array.isArray(right)) {
      return (
        left.length === right.length &&
        left.every((item, index) => this.valuesMatch(item, right[index]))
      );
    }

    if (
      typeof left === "object" &&
      typeof right === "object" &&
      !Array.isArray(left) &&
      !Array.isArray(right)
    ) {
      const leftRecord = left as Record<string, unknown>;
      const rightRecord = right as Record<string, unknown>;
      const leftKeys = Object.keys(leftRecord);
      const rightKeys = Object.keys(rightRecord);

      return (
        leftKeys.length === rightKeys.length &&
        leftKeys.every(
          (key) =>
            key in rightRecord &&
            this.valuesMatch(leftRecord[key], rightRecord[key]),
        )
      );
    }

    return false;
  }

  private getFormattedTestTitle(test: any) {
    let title = ` ${this.getEntityPrefix(test)} `;
    title += test.module.task.name;
    if (test.location) {
      title += c.dim(`:${test.location.line}:${test.location.column}`);
    }
    title += TEST_NAME_SEPARATOR;
    title += test.fullName ?? this.getTestName(test.task, TEST_NAME_SEPARATOR);
    return title;
  }
}
