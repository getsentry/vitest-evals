import { stripVTControlCharacters } from "node:util";
import { describe, expect, test, vi } from "vitest";
import DefaultEvalReporter from "./reporter";

function createReporter() {
  const logger = {
    log: vi.fn(),
    error: vi.fn(),
    printBanner: vi.fn(),
    printNoTestFound: vi.fn(),
  };

  const reporter = new DefaultEvalReporter({ isTTY: false });
  reporter.onInit({
    logger,
    config: {
      hideSkippedTests: false,
      slowTestThreshold: 300,
      root: process.cwd(),
    },
  } as any);

  return { reporter, logger };
}

function createTestCase({
  avgScore,
  state = "pass",
}: {
  avgScore?: number;
  state?: "pass" | "fail";
}) {
  return {
    task: {
      name: "streams eval progress",
      type: "test",
      mode: "run",
      file: {
        name: "fixtures/reporter.eval.test.ts",
      },
      result: {
        state,
        duration: 42,
      },
    },
    module: {
      task: {
        name: "fixtures/reporter.eval.test.ts",
      },
      project: {
        name: "",
      },
    },
    project: {
      name: "",
    },
    options: {},
    location: {
      line: 12,
      column: 3,
    },
    meta: () => (avgScore == null ? {} : { eval: { avgScore } }),
    result: () => ({
      state,
      errors: state === "fail" ? [{ message: "threshold not met" }] : [],
    }),
    diagnostic: () => ({
      duration: 42,
    }),
    annotations: () => [],
  };
}

describe("DefaultEvalReporter", () => {
  test("streams eval test cases with scores and avoids a file-end flush", () => {
    const { reporter, logger } = createReporter();
    const testCase = createTestCase({ avgScore: 0.82 });

    reporter.onTestCaseResult(testCase as any);

    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(stripVTControlCharacters(logger.log.mock.calls[0][0])).toContain(
      "fixtures/reporter.eval.test.ts:12:3 > streams eval progress [0.82] 42ms",
    );

    reporter.onTestModuleEnd({
      state: () => "pass",
      task: {},
    } as any);

    expect(logger.log).toHaveBeenCalledTimes(1);
  });

  test("falls back to verbose output for non-eval tests", () => {
    const { reporter, logger } = createReporter();

    reporter.onTestCaseResult(createTestCase({}) as any);

    expect(stripVTControlCharacters(logger.log.mock.calls[0][0])).toContain(
      "fixtures/reporter.eval.test.ts:12:3 > streams eval progress 42ms",
    );
    expect(stripVTControlCharacters(logger.log.mock.calls[0][0])).not.toContain(
      "[0.",
    );
  });
});
