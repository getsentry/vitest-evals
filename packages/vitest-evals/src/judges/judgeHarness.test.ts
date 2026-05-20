import { expect, test } from "vitest";
import { createJudgeHarness, runJudgeHarness } from "./judgeHarness";

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
        messages: [
          {
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
