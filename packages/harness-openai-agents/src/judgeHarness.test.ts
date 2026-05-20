import { expect, test, vi } from "vitest";
import { openaiAgentsJudgeHarness } from "./index";

test("openaiAgentsJudgeHarness runs judge prompts through OpenAI Agents", async () => {
  const signal = new AbortController().signal;
  const runner = {
    run: vi.fn(async () => ({
      finalOutput: '{"choice":"C","rationale":"Matches."}',
    })),
  };
  const judgeHarness = openaiAgentsJudgeHarness({
    model: "gpt-4.1-mini",
    temperature: 0,
    maxOutputTokens: 256,
    runner: runner as any,
  });

  const result = await judgeHarness.run(
    {
      system: "Grade factuality.",
      prompt: "Compare the answers.",
      responseFormat: {
        type: "json",
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["choice", "rationale"],
          properties: {
            choice: {
              enum: ["A", "B", "C", "D", "E"],
            },
            rationale: {
              type: "string",
            },
          },
        },
      },
    },
    {
      metadata: {},
      signal,
      artifacts: {},
      setArtifact: () => {},
    },
  );

  expect(result.output).toBe('{"choice":"C","rationale":"Matches."}');
  expect(runner.run).toHaveBeenCalledWith(
    expect.objectContaining({
      name: "vitest_evals_judge",
      instructions: expect.stringContaining("Return only valid JSON"),
      model: "gpt-4.1-mini",
      modelSettings: expect.objectContaining({
        temperature: 0,
        maxTokens: 256,
      }),
      outputType: expect.objectContaining({
        type: "json_schema",
        strict: true,
        schema: expect.objectContaining({
          type: "object",
          additionalProperties: false,
        }),
      }),
    }),
    "Compare the answers.",
    expect.objectContaining({ signal }),
  );
});

test("openaiAgentsJudgeHarness preserves null judge output", async () => {
  const runner = {
    run: vi.fn(async () => ({
      finalOutput: null,
    })),
  };
  const judgeHarness = openaiAgentsJudgeHarness({
    model: "gpt-4.1-mini",
    runner: runner as any,
  });

  const result = await judgeHarness.run(
    {
      prompt: "Return null.",
    },
    {
      metadata: {},
      artifacts: {},
      setArtifact: () => {},
    },
  );

  expect(result.output).toBeNull();
});
