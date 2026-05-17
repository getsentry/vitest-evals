import type {
  CollectOptions,
  EvalCase,
  EvalFailure,
  EvalReport,
  EvalScore,
  ToolCallSummary,
  UsageSummary,
  VitestJsonAssertion,
  VitestJsonFile,
  VitestJsonReport,
} from "./types";
import {
  compactLine,
  isRecord,
  normalizePathForGitHub,
  stringifyValue,
} from "./utils";

type EvalMeta = {
  scores?: EvalScore[];
  avgScore?: number;
  output?: unknown;
  thresholdFailed?: boolean;
};

type HarnessMeta = {
  name?: string;
  run?: {
    output?: unknown;
    usage?: UsageSummary;
    timings?: {
      totalMs?: number;
    };
    session?: {
      messages?: Array<{
        toolCalls?: unknown[];
      }>;
    };
    errors?: unknown[];
  };
};

type HarnessRunMeta = NonNullable<HarnessMeta["run"]>;

/** Converts a Vitest JSON report into the compact eval report model. */
export function collectEvalReport(
  input: VitestJsonReport,
  options: CollectOptions = {},
): EvalReport {
  const cases = input.testResults.flatMap((file) =>
    file.assertionResults.flatMap((assertion) => {
      const evalCase = collectEvalCase(file, assertion, options);
      return evalCase ? [evalCase] : [];
    }),
  );
  const failures = cases.filter((testCase) => testCase.status === "failed");
  const evalScores = cases
    .map((testCase) => testCase.eval?.avgScore)
    .filter((score): score is number => typeof score === "number");
  const usage = sumUsage(cases);
  const durationMs = resolveRunDuration(input);

  return {
    status: input.success && failures.length === 0 ? "passed" : "failed",
    startedAt: input.startTime,
    durationMs,
    totals: {
      total: input.numTotalTests,
      passed: input.numPassedTests,
      failed: input.numFailedTests,
      skipped: input.numPendingTests + input.numTodoTests,
      evalTotal: cases.length,
      evalPassed: cases.filter((testCase) => testCase.status === "passed")
        .length,
      evalFailed: failures.length,
    },
    score:
      evalScores.length > 0
        ? {
            average:
              evalScores.reduce((total, score) => total + score, 0) /
              evalScores.length,
            minimum: Math.min(...evalScores),
          }
        : undefined,
    usage,
    cases,
    failures,
  };
}

function collectEvalCase(
  file: VitestJsonFile,
  assertion: VitestJsonAssertion,
  options: CollectOptions,
): EvalCase | null {
  const meta = isRecord(assertion.meta) ? assertion.meta : {};
  const evalMeta = getEvalMeta(meta.eval);
  const harnessMeta = getHarnessMeta(meta.harness);

  if (!evalMeta && !harnessMeta) {
    return null;
  }

  const displayFile = normalizePathForGitHub(file.name, options.workspace);
  const scores = evalMeta?.scores ?? [];
  const harnessRun = harnessMeta?.run;
  const toolCalls = collectToolCalls(harnessRun?.session);
  const evalCase: EvalCase = {
    id: `${file.name}:${assertion.location?.line ?? 0}:${assertion.fullName}`,
    file: file.name,
    displayFile,
    title: assertion.title,
    displayName: formatDisplayName(assertion),
    status: assertion.status,
    durationMs:
      typeof assertion.duration === "number" ? assertion.duration : undefined,
    location: assertion.location ?? undefined,
    failureMessages: assertion.failureMessages ?? [],
    eval: evalMeta
      ? {
          avgScore: evalMeta.avgScore,
          thresholdFailed: evalMeta.thresholdFailed,
          output: evalMeta.output,
          scores,
        }
      : undefined,
    harness: harnessMeta
      ? {
          name: harnessMeta.name,
          output: harnessRun?.output,
          usage: harnessRun?.usage,
          timingMs: harnessRun?.timings?.totalMs,
          toolCalls,
          errors: harnessRun?.errors ?? [],
        }
      : undefined,
  };

  evalCase.primaryFailure = getPrimaryFailure(evalCase);
  return evalCase;
}

function getEvalMeta(value: unknown): EvalMeta | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    scores: Array.isArray(value.scores)
      ? value.scores.filter(isRecord).map(normalizeScore)
      : undefined,
    avgScore: typeof value.avgScore === "number" ? value.avgScore : undefined,
    output: value.output,
    thresholdFailed:
      typeof value.thresholdFailed === "boolean"
        ? value.thresholdFailed
        : undefined,
  };
}

function normalizeScore(score: Record<string, unknown>): EvalScore {
  const metadata = isRecord(score.metadata) ? score.metadata : undefined;
  return {
    name: typeof score.name === "string" ? score.name : undefined,
    score: typeof score.score === "number" ? score.score : null,
    metadata,
  };
}

function getHarnessMeta(value: unknown): HarnessMeta | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const run = isRecord(value.run) ? value.run : undefined;
  const usage = isRecord(run?.usage) ? getUsage(run.usage) : undefined;
  const timings = isRecord(run?.timings) ? run.timings : undefined;

  return {
    name: typeof value.name === "string" ? value.name : undefined,
    run: run
      ? {
          output: run.output,
          usage,
          timings: {
            totalMs:
              typeof timings?.totalMs === "number"
                ? timings.totalMs
                : undefined,
          },
          session: isRecord(run.session)
            ? {
                messages: Array.isArray(run.session.messages)
                  ? (run.session.messages as Array<{ toolCalls?: unknown[] }>)
                  : undefined,
              }
            : undefined,
          errors: Array.isArray(run.errors) ? run.errors : undefined,
        }
      : undefined,
  };
}

function getUsage(value: Record<string, unknown>): UsageSummary {
  return {
    inputTokens: numberField(value.inputTokens),
    outputTokens: numberField(value.outputTokens),
    reasoningTokens: numberField(value.reasoningTokens),
    totalTokens: numberField(value.totalTokens),
    estimatedCost: numberField(value.estimatedCost),
    toolCalls: numberField(value.toolCalls),
  };
}

function numberField(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function collectToolCalls(session: HarnessRunMeta["session"] | undefined) {
  const messages = session?.messages ?? [];
  const toolCalls: ToolCallSummary[] = [];

  for (const message of messages) {
    if (!Array.isArray(message.toolCalls)) {
      continue;
    }

    for (const call of message.toolCalls) {
      if (!isRecord(call) || typeof call.name !== "string") {
        continue;
      }

      toolCalls.push({
        name: call.name,
        error: getToolCallError(call.error),
        durationMs: numberField(call.durationMs),
      });
    }
  }

  return toolCalls;
}

function getToolCallError(value: unknown) {
  if (isRecord(value) && typeof value.message === "string") {
    return value.message;
  }
  if (value !== undefined) {
    return stringifyValue(value, 240);
  }
  return undefined;
}

function getPrimaryFailure(testCase: EvalCase): EvalFailure | undefined {
  const failingScores = [...(testCase.eval?.scores ?? [])]
    .filter(
      (score) =>
        (score.score ?? 0) < 1 ||
        score.metadata?.rationale !== undefined ||
        score.metadata?.output !== undefined,
    )
    .sort((left, right) => (left.score ?? 0) - (right.score ?? 0));
  const primary = failingScores[0];
  const score =
    typeof primary?.score === "number"
      ? primary.score
      : testCase.eval?.avgScore;
  const reason =
    stringifyReason(primary?.metadata?.rationale) ??
    compactLine(testCase.failureMessages.join("\n"), 500);

  if (!primary && !reason && score === undefined) {
    return undefined;
  }

  return {
    judgeName: primary?.name,
    score,
    reason: reason || undefined,
  };
}

function stringifyReason(value: unknown) {
  if (value === undefined) {
    return undefined;
  }
  return typeof value === "string" ? value : stringifyValue(value, 4000);
}

function formatDisplayName(assertion: VitestJsonAssertion) {
  return [...assertion.ancestorTitles, assertion.title]
    .filter((part) => part.length > 0)
    .join(" > ");
}

function sumUsage(cases: EvalCase[]) {
  const usage: Required<UsageSummary> = {
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    estimatedCost: 0,
    toolCalls: 0,
  };

  for (const testCase of cases) {
    const caseUsage = testCase.harness?.usage;
    usage.inputTokens += caseUsage?.inputTokens ?? 0;
    usage.outputTokens += caseUsage?.outputTokens ?? 0;
    usage.reasoningTokens += caseUsage?.reasoningTokens ?? 0;
    usage.totalTokens +=
      caseUsage?.totalTokens ??
      (caseUsage?.inputTokens ?? 0) +
        (caseUsage?.outputTokens ?? 0) +
        (caseUsage?.reasoningTokens ?? 0);
    usage.estimatedCost += caseUsage?.estimatedCost ?? 0;
    usage.toolCalls +=
      caseUsage?.toolCalls ?? testCase.harness?.toolCalls.length ?? 0;
  }

  return usage;
}

function resolveRunDuration(input: VitestJsonReport) {
  const startTimes = input.testResults
    .map((file) => file.startTime)
    .filter((time) => Number.isFinite(time));
  const endTimes = input.testResults
    .map((file) => file.endTime)
    .filter((time) => Number.isFinite(time));
  if (startTimes.length === 0 || endTimes.length === 0) {
    return undefined;
  }
  return Math.max(...endTimes) - Math.min(...startTimes);
}
