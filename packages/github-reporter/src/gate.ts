import type { EvalReport } from "./types";
import {
  escapeCommandData,
  escapeCommandProperty,
  formatNumber,
  formatScore,
} from "./utils";

/** Optional floors and legacy fail-on-any-failure policy for a combined report. */
export type EvalGatePolicy = {
  /**
   * Minimum fraction of eval cases that must pass, in the range `[0, 1]`.
   * Example: `0.8` requires at least 80% of eval cases to pass.
   */
  minPassRate?: number;
  /**
   * Minimum average eval score across scored cases, in the range `[0, 1]`.
   */
  minScoreAverage?: number;
  /**
   * When true, require every eval case to pass. Equivalent to setting
   * `minPassRate` to `1`, and combined with an explicit floor by taking the
   * stricter value.
   */
  failOnFailures?: boolean;
};

/** Result of applying a gate policy to a combined eval report. */
export type EvalGateResult = {
  /** Whether the configured policy accepts this report. */
  ok: boolean;
  /** Compact status used by action outputs and summaries. */
  status: "passed" | "failed";
  /** True when any gate input was configured. */
  enforced: boolean;
  /** Eval pass rate when the report includes at least one eval case. */
  passRate: number | null;
  /** Short title for Check Runs and workflow annotations. */
  title: string;
  /** Longer explanation used in logs, summaries, and annotations. */
  message: string;
};

/**
 * Decide whether a combined eval report meets the configured CI gate.
 *
 * With no policy inputs, the result mirrors the report status and is not
 * treated as an enforced gate. With floors or `failOnFailures`, non-eval
 * failures and empty eval reports fail closed, and qualitative misses only
 * fail when they break the configured floors.
 */
export function evaluateEvalGate(
  report: EvalReport,
  policy: EvalGatePolicy = {},
): EvalGateResult {
  const minPassRate = resolveMinPassRate(policy);
  const minScoreAverage = policy.minScoreAverage;
  const enforced =
    minPassRate !== undefined ||
    minScoreAverage !== undefined ||
    policy.failOnFailures === true;

  const passRate = computePassRate(report);
  const counts = formatEvalCounts(report, passRate);

  if (!enforced) {
    const ok = report.status === "passed";
    return {
      ok,
      status: ok ? "passed" : "failed",
      enforced: false,
      passRate,
      title: defaultCheckTitle(report),
      message: ok
        ? `eval report passed: ${counts}`
        : `eval report failed: ${counts}`,
    };
  }

  const nonEvalFailures = Math.max(
    0,
    report.totals.failed - report.totals.evalFailed,
  );
  if (nonEvalFailures > 0) {
    return {
      ok: false,
      status: "failed",
      enforced: true,
      passRate,
      title: "Eval report hard failure",
      message: `${formatNumber(nonEvalFailures)} non-eval test failure${
        nonEvalFailures === 1 ? "" : "s"
      }; ${counts}`,
    };
  }

  if (report.totals.evalTotal === 0) {
    return {
      ok: false,
      status: "failed",
      enforced: true,
      passRate: null,
      title: "Eval report hard failure",
      message: "no eval cases were reported",
    };
  }

  // Preserve Vitest-level hard failures that did not produce counted test
  // failures (for example success:false with empty assertion results).
  if (
    report.status === "failed" &&
    report.totals.failed === 0 &&
    report.failures.length === 0
  ) {
    return {
      ok: false,
      status: "failed",
      enforced: true,
      passRate,
      title: "Eval report hard failure",
      message: `vitest run failed without counted test failures; ${counts}`,
    };
  }

  if (
    minPassRate !== undefined &&
    (passRate === null || passRate + Number.EPSILON < minPassRate)
  ) {
    return {
      ok: false,
      status: "failed",
      enforced: true,
      passRate,
      title: `Eval pass rate ${formatPercent(passRate)} — required ${formatPercent(minPassRate)}`,
      message: `eval pass rate below floor: ${counts}; required >= ${formatPercent(minPassRate)}`,
    };
  }

  if (minScoreAverage !== undefined) {
    const average = report.score?.average;
    if (average === undefined || !Number.isFinite(average)) {
      return {
        ok: false,
        status: "failed",
        enforced: true,
        passRate,
        title: "Eval score gate failed",
        message: `no score average available; required avg score >= ${formatScore(minScoreAverage)}`,
      };
    }
    if (average + Number.EPSILON < minScoreAverage) {
      return {
        ok: false,
        status: "failed",
        enforced: true,
        passRate,
        title: `Avg score ${formatScore(average)} — required ${formatScore(minScoreAverage)}`,
        message: `avg score below floor: ${counts}; required avg score >= ${formatScore(minScoreAverage)}`,
      };
    }
  }

  return {
    ok: true,
    status: "passed",
    enforced: true,
    passRate,
    title: enforcedPassTitle(report, passRate, minPassRate, minScoreAverage),
    message: `eval gate passed: ${counts}${formatFloorSuffix(minPassRate, minScoreAverage)}`,
  };
}

/** Compute the eval pass rate for a report, or null when there are no evals. */
export function computePassRate(report: EvalReport): number | null {
  if (report.totals.evalTotal <= 0) {
    return null;
  }
  return report.totals.evalPassed / report.totals.evalTotal;
}

/** Format a 0-1 ratio as a percentage with one decimal place. */
export function formatPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return "n/a";
  }
  return `${(value * 100).toFixed(1)}%`;
}

/** Build a suite-level workflow annotation for a failed enforced gate. */
export function renderGateWorkflowCommand(gate: EvalGateResult) {
  if (gate.ok || !gate.enforced) {
    return undefined;
  }
  return `::error title=${escapeCommandProperty(gate.title)}::${escapeCommandData(gate.message)}`;
}

function resolveMinPassRate(policy: EvalGatePolicy) {
  const configured = policy.minPassRate;
  if (policy.failOnFailures) {
    if (configured === undefined) {
      return 1;
    }
    return Math.max(configured, 1);
  }
  return configured;
}

function defaultCheckTitle(report: EvalReport) {
  if (report.failures.length === 0 && report.status === "passed") {
    return "No eval failures";
  }
  if (report.failures.length === 0) {
    return "Vitest run failed";
  }
  return `${report.failures.length} eval failure${
    report.failures.length === 1 ? "" : "s"
  }`;
}

function enforcedPassTitle(
  report: EvalReport,
  passRate: number | null,
  minPassRate: number | undefined,
  minScoreAverage: number | undefined,
) {
  if (minPassRate !== undefined) {
    return `Eval pass rate ${formatPercent(passRate)} — floor ${formatPercent(minPassRate)}`;
  }
  if (minScoreAverage !== undefined) {
    return `Avg score ${formatScore(report.score?.average)} — floor ${formatScore(minScoreAverage)}`;
  }
  return defaultCheckTitle(report);
}

function formatEvalCounts(report: EvalReport, passRate: number | null) {
  const scoreText =
    report.score?.average === undefined
      ? "n/a"
      : formatScore(report.score.average);
  const passRateText = passRate === null ? "n/a" : formatPercent(passRate);
  return `${formatNumber(report.totals.evalPassed)}/${formatNumber(
    report.totals.evalTotal,
  )} passed (${passRateText}), avg score ${scoreText}`;
}

function formatFloorSuffix(
  minPassRate: number | undefined,
  minScoreAverage: number | undefined,
) {
  const parts: string[] = [];
  if (minPassRate !== undefined) {
    parts.push(`pass rate floor ${formatPercent(minPassRate)}`);
  }
  if (minScoreAverage !== undefined) {
    parts.push(`avg score floor ${formatScore(minScoreAverage)}`);
  }
  return parts.length === 0 ? "" : `; ${parts.join(", ")}`;
}
