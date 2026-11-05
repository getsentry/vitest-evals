import { describe, expect, test } from "vitest";
import {
  formatElapsed,
  formatRerunCommand,
  jobElapsedMs,
  looksLikeEvalFile,
  previewRerunCommand,
  rerunTestNamePattern,
  runningJobForCase,
} from "./rerun";

describe("rerunTestNamePattern", () => {
  test("anchors the full describe > test name and escapes it", () => {
    expect(
      rerunTestNamePattern({
        ancestorTitles: ["refunds"],
        title: "approves (eligible)",
      }),
    ).toBe("^refunds > approves \\(eligible\\)$");
  });

  test("does not match a longer title that shares the prefix", () => {
    const pattern = new RegExp(
      rerunTestNamePattern({ ancestorTitles: [], title: "returns weather" }),
    );
    expect(pattern.test("returns weather")).toBe(true);
    expect(pattern.test("returns weather for Paris")).toBe(false);
  });
});

describe("formatRerunCommand", () => {
  test("quotes patterns that need a shell escape", () => {
    expect(
      formatRerunCommand({
        file: "evals/refund.eval.ts",
        testNamePattern: "^refund \\(eligible\\)$",
        config: "vitest.evals.config.ts",
      }),
    ).toBe(
      "vitest run evals/refund.eval.ts --testNamePattern='^refund \\(eligible\\)$' --config vitest.evals.config.ts",
    );
  });

  test("previews the server command from the served workspace meta", () => {
    const testCase = {
      file: "/repo/evals/refund.eval.ts",
      ancestorTitles: [],
      title: "approves",
    };
    expect(
      previewRerunCommand(testCase, {
        workspaceRoot: "/repo",
        evalConfig: "vitest.eval.config.ts",
      }),
    ).toBe(
      "vitest run evals/refund.eval.ts --testNamePattern='^approves$' --config vitest.eval.config.ts",
    );
    expect(previewRerunCommand(testCase, { workspaceRoot: "/repo" })).toBe(
      "vitest run evals/refund.eval.ts --testNamePattern='^approves$'",
    );
  });

  test("uses displayFile for reports from another checkout", () => {
    expect(
      previewRerunCommand(
        {
          file: "/home/runner/work/app/app/evals/refund.eval.ts",
          displayFile: "evals/refund.eval.ts",
          ancestorTitles: [],
          title: "approves",
        },
        { workspaceRoot: "/repo" },
      ),
    ).toBe("vitest run evals/refund.eval.ts --testNamePattern='^approves$'");
  });

  test("keeps unit-test files on the default vitest config", () => {
    expect(
      previewRerunCommand(
        { file: "/repo/src/refund.spec.ts", ancestorTitles: [], title: "a" },
        { workspaceRoot: "/repo", evalConfig: "vitest.eval.config.ts" },
      ),
    ).toBe("vitest run src/refund.spec.ts --testNamePattern='^a$'");
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
          caseId: "c1",
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
          caseId: "c1",
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
  test("matches the in-flight job by case id, not title", () => {
    const jobs = [
      {
        id: "1",
        caseId: "case-a",
        title: "Datafast",
        command: "vitest run",
        status: "running" as const,
        log: "",
        startedAt: 1,
      },
    ];
    expect(runningJobForCase(jobs, { id: "case-a" })?.id).toBe("1");
    expect(runningJobForCase(jobs, { id: "case-b" })).toBeUndefined();
  });
});
