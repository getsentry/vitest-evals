import { expect, test } from "vitest";
import { createHarness } from "../harness";
import { createJudge, describeEval } from "../index";
import {
  createJudgeHarness,
  runJudgeHarness,
  runJudgeHarnessRun,
} from "./judgeHarness";

test("runJudgeHarness preserves null output values", async () => {
  const judgeHarness = createJudgeHarness({
    run: async () => ({
      output: null,
    }),
  });

  const result = await runJudgeHarness(judgeHarness, {
    prompt: "Return JSON.",
  });

  expect(result).toBeNull();
});

test("runJudgeHarness falls back to assistant content when output is missing", async () => {
  const judgeHarness = createJudgeHarness({
    run: async () => ({
      session: {
        events: [
          {
            type: "message",
            role: "assistant",
            content: '{"choice":"C"}',
          },
        ],
      },
      usage: {},
      errors: [],
    }),
  });

  const result = await runJudgeHarness(judgeHarness, {
    prompt: "Return JSON.",
  });

  expect(result).toBe('{"choice":"C"}');
});

test("runJudgeHarnessRun preserves normalized usage", async () => {
  const judgeHarness = createJudgeHarness({
    run: async () => ({
      output: "approved",
      session: { events: [] },
      usage: {
        inputTokens: 12,
        outputTokens: 3,
        totalTokens: 15,
        metadata: { costUsd: 0.02 },
      },
      errors: [],
    }),
  });

  const run = await runJudgeHarnessRun(judgeHarness, {
    prompt: "Return JSON.",
  });

  expect(run.usage).toEqual({
    inputTokens: 12,
    outputTokens: 3,
    totalTokens: 15,
    metadata: { costUsd: 0.02 },
  });
});

const appHarness = createHarness({
  name: "app",
  run: async ({ input }: { input: string }) => ({
    output: input,
    messages: [
      { role: "user", content: input },
      { role: "assistant", content: input },
    ],
  }),
});
const usageJudgeHarness = createJudgeHarness({
  run: async () => ({
    output: "approved",
    session: { events: [] },
    usage: { inputTokens: 12, outputTokens: 3, totalTokens: 15 },
    errors: [],
  }),
});
const usageJudge = createJudge("UsageJudge", async ({ runJudge }) => {
  await runJudge?.({ prompt: "Grade this." });
  await runJudge?.({ prompt: "Check it again." });
  return { score: 1 };
});

describeEval(
  "judge usage",
  {
    harness: appHarness,
    judgeHarness: usageJudgeHarness,
    judges: [usageJudge],
  },
  (it) => {
    it("records every judge harness run", async ({ run, task }) => {
      await run("answer");

      expect(task.meta.eval?.scores?.[0]?.judgeRuns).toHaveLength(2);
      expect(task.meta.eval?.scores?.[0]?.judgeRuns?.[0]?.usage).toEqual({
        inputTokens: 12,
        outputTokens: 3,
        totalTokens: 15,
      });
    });
  },
);

test("runJudgeHarness preserves structured values with an output field", async () => {
  const judgeHarness = createJudgeHarness({
    run: async () => ({
      output: "approved",
      confidence: 0.95,
    }),
  });

  const result = await runJudgeHarness(judgeHarness, {
    prompt: "Return JSON.",
  });

  expect(result).toEqual({
    output: "approved",
    confidence: 0.95,
  });
});
