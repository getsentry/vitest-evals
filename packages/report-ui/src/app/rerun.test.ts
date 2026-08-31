import { describe, expect, test } from "vitest";
import {
  escapeRegExp,
  formatElapsed,
  formatRerunCommand,
  jobElapsedMs,
  looksLikeEvalFile,
  rerunRequest,
  runningJobForCase,
} from "./rerun";

describe("rerunRequest", () => {
  test("takes file and title from the case", () => {
    expect(
      rerunRequest({
        file: "/repo/evals/refund.eval.ts",
        title: "approves eligible refund",
      }),
    ).toEqual({
      file: "/repo/evals/refund.eval.ts",
      title: "approves eligible refund",
    });
  });
});

describe("formatRerunCommand", () => {
  test("quotes titles that need a regex escape", () => {
    expect(
      formatRerunCommand({
        file: "evals/refund.eval.ts",
        title: "refund (eligible)",
      }),
    ).toBe(
      "pnpm exec vitest run evals/refund.eval.ts -t 'refund \\(eligible\\)' --config vitest.evals.config.ts",
    );
  });

  test("keeps unit-test files on the default vitest config", () => {
    expect(
      formatRerunCommand({
        file: "src/refund.spec.ts",
        title: "approves",
      }),
    ).toBe("pnpm exec vitest run src/refund.spec.ts -t approves");
  });
});

describe("looksLikeEvalFile", () => {
  test("matches evals suites and leaves unit tests alone", () => {
    expect(looksLikeEvalFile("src/__eval__/refund.evals.ts")).toBe(true);
    expect(looksLikeEvalFile("evals/refund.eval.ts")).toBe(true);
    expect(looksLikeEvalFile("src/refund.spec.ts")).toBe(false);
  });
});

describe("formatElapsed", () => {
  test("uses seconds, then minutes", () => {
    expect(formatElapsed(400)).toBe("0s");
    expect(formatElapsed(12_400)).toBe("12s");
    expect(formatElapsed(64_000)).toBe("1m 04s");
    expect(formatElapsed(120_000)).toBe("2m");
  });
});

describe("jobElapsedMs", () => {
  test("uses now while running and endedAt when done", () => {
    expect(
      jobElapsedMs(
        {
          id: "1",
          title: "case",
          command: "vitest",
          status: "running",
          log: "",
          startedAt: 1000,
        },
        13_400,
      ),
    ).toBe(12_400);
    expect(
      jobElapsedMs(
        {
          id: "1",
          title: "case",
          command: "vitest",
          status: "ok",
          log: "",
          startedAt: 1000,
          endedAt: 5000,
        },
        99_000,
      ),
    ).toBe(4000);
  });
});

describe("runningJobForCase", () => {
  test("matches the in-flight job by display name", () => {
    const jobs = [
      {
        id: "1",
        title: "Product metadata suggestion — Datafast > Datafast",
        command: "pnpm exec vitest",
        status: "running" as const,
        log: "",
        startedAt: 1,
      },
    ];
    expect(
      runningJobForCase(jobs, {
        displayName: "Product metadata suggestion — Datafast > Datafast",
        title: "Datafast",
      })?.id,
    ).toBe("1");
    expect(
      runningJobForCase(jobs, {
        displayName: "other",
        title: "Atlas",
      }),
    ).toBeUndefined();
  });
});

describe("escapeRegExp", () => {
  test("escapes regex metacharacters", () => {
    expect(escapeRegExp("a.b+c")).toBe("a\\.b\\+c");
  });
});
