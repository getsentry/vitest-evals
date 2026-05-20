import { beforeEach, expect, test, vi } from "vitest";
import {
  createHarness,
  createJudge,
  createJudgeHarness,
  describeEval,
  FactualityJudge,
  type CreateJudgeHarnessOptions,
  type HarnessRun,
  type JsonValue,
  type RunJudge,
} from "../index";

const factualityHarness = createHarness<string, string, { expected?: string }>({
  name: "qa-harness",
  run: async () => ({
    output: "Paris is the capital of France.",
  }),
});

const automaticJudgeHarnessRun = vi.fn();
const contextualJudgeHarnessRun = vi.fn();
const configuredJudgeHarnessRun = vi.fn();
const suiteDefaultJudgeHarnessRun = vi.fn();
const judgeOverrideHarnessRun = vi.fn();
const inferredSuiteJudgeHarnessRun = vi.fn();
const automaticJudgeHarness = createMockJudgeHarness(automaticJudgeHarnessRun);
const contextualJudgeHarness = createMockJudgeHarness(
  contextualJudgeHarnessRun,
);
const configuredJudgeHarness = createMockJudgeHarness(
  configuredJudgeHarnessRun,
);
const suiteDefaultJudgeHarness = createMockJudgeHarness(
  suiteDefaultJudgeHarnessRun,
);
const judgeOverrideHarness = createMockJudgeHarness(judgeOverrideHarnessRun);
const inferredSuiteJudgeHarness = createMockJudgeHarness(
  inferredSuiteJudgeHarnessRun,
);
const leakedAutomaticJudgeRunJudge = vi.fn();

beforeEach(() => {
  automaticJudgeHarnessRun.mockReset();
  automaticJudgeHarnessRun.mockResolvedValue({
    choice: "C",
    rationale: "The submitted answer matches the expert answer.",
  });
  contextualJudgeHarnessRun.mockReset();
  contextualJudgeHarnessRun.mockResolvedValue({
    choice: "C",
    rationale: "The submitted answer matches the expert answer.",
  });
  configuredJudgeHarnessRun.mockReset();
  configuredJudgeHarnessRun.mockResolvedValue({
    choice: "C",
    rationale: "The submitted answer matches the expert answer.",
  });
  suiteDefaultJudgeHarnessRun.mockReset();
  suiteDefaultJudgeHarnessRun.mockResolvedValue({
    choice: "D",
    rationale: "The suite default should not be used.",
  });
  judgeOverrideHarnessRun.mockReset();
  judgeOverrideHarnessRun.mockResolvedValue({
    choice: "C",
    rationale: "The per-judge harness is used.",
  });
  inferredSuiteJudgeHarnessRun.mockReset();
  inferredSuiteJudgeHarnessRun.mockResolvedValue({
    choice: "C",
    rationale: "The inferred suite harness is used.",
  });
  leakedAutomaticJudgeRunJudge.mockReset();
});

describeEval(
  "factuality judge",
  {
    harness: factualityHarness,
    judgeHarness: automaticJudgeHarness,
    judges: [FactualityJudge()],
  },
  (it) => {
    it("uses metadata expected values with any harness output", async ({
      run,
      task,
    }) => {
      await run("What is the capital of France?", {
        metadata: {
          expected: "Paris is the capital of France.",
        },
      });

      expect(automaticJudgeHarnessRun).toHaveBeenCalledWith(
        expect.objectContaining({
          system: expect.stringContaining("comparing factual content"),
          prompt: expect.stringContaining("What is the capital of France?"),
          responseFormat: expect.objectContaining({
            type: "json",
            schema: expect.objectContaining({
              type: "object",
            }),
          }),
        }),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      );
      expect(task.meta.eval?.scores).toEqual([
        {
          name: "FactualityJudge",
          score: 1,
          metadata: {
            rationale: "The submitted answer matches the expert answer.",
            choice: "C",
          },
        },
      ]);
    });
  },
);

describeEval(
  "factuality judge configured harness",
  {
    harness: factualityHarness,
    judges: [FactualityJudge({ judgeHarness: configuredJudgeHarness })],
  },
  (it) => {
    it("uses a judge-level judge harness for automatic assertions", async ({
      run,
    }) => {
      await run("What is the capital of France?", {
        metadata: {
          expected: "Paris is the capital of France.",
        },
      });

      expect(configuredJudgeHarnessRun).toHaveBeenCalledTimes(1);
    });
  },
);

describeEval(
  "factuality judge configured harness precedence",
  {
    harness: factualityHarness,
    judgeHarness: suiteDefaultJudgeHarness,
    judges: [FactualityJudge({ judgeHarness: judgeOverrideHarness })],
  },
  (it) => {
    it("uses a judge-level judge harness before the suite default", async ({
      run,
    }) => {
      await run("What is the capital of France?", {
        metadata: {
          expected: "Paris is the capital of France.",
        },
      });

      expect(judgeOverrideHarnessRun).toHaveBeenCalledTimes(1);
      expect(suiteDefaultJudgeHarnessRun).not.toHaveBeenCalled();
    });
  },
);

describeEval(
  "factuality judge inferred suite harness",
  {
    harness: factualityHarness,
    judges: [
      FactualityJudge({ judgeHarness: inferredSuiteJudgeHarness }),
      createJudge("NoInferredAutomaticJudgeHarness", (ctx) => {
        leakedAutomaticJudgeRunJudge(ctx.runJudge);

        return {
          score: ctx.runJudge ? 0 : 1,
          metadata: {
            rationale:
              "Automatic judges do not inherit inferred harnesses from sibling judges.",
          },
        };
      }),
    ],
  },
  (it) => {
    it("reuses an unambiguous automatic judge harness for explicit assertions", async ({
      run,
      task,
    }) => {
      const result = await run("What is the capital of France?", {
        metadata: {
          expected: "Paris is the capital of France.",
        },
      });

      await expect(result).toSatisfyJudge(FactualityJudge(), {
        expected: "Paris is the capital of France.",
        threshold: 0.5,
      });

      expect(inferredSuiteJudgeHarnessRun).toHaveBeenCalledTimes(2);
      expect(leakedAutomaticJudgeRunJudge).toHaveBeenCalledWith(undefined);
      expect(task.meta.eval?.scores).toEqual([
        expect.objectContaining({
          name: "FactualityJudge",
          score: 1,
        }),
        expect.objectContaining({
          name: "NoInferredAutomaticJudgeHarness",
          score: 1,
        }),
        expect.objectContaining({
          name: "FactualityJudge",
          score: 1,
        }),
      ]);
    });
  },
);

describeEval(
  "factuality judge context",
  {
    harness: factualityHarness,
    judgeHarness: contextualJudgeHarness,
  },
  (it) => {
    it("reuses the suite judge harness for explicit assertions", async ({
      run,
    }) => {
      const result = await run("What is the capital of France?");

      await expect(result).toSatisfyJudge(FactualityJudge(), {
        expected: "Paris is the capital of France.",
        threshold: 0.5,
      });

      expect(contextualJudgeHarnessRun).toHaveBeenCalledTimes(1);
    });
  },
);

test("FactualityJudge accepts a configured judge harness for explicit matchers", async () => {
  const judgeHarnessRun = vi.fn(async () => ({
    choice: "C",
    rationale: "The submitted answer matches.",
  }));
  const judgeHarness = createMockJudgeHarness(judgeHarnessRun);

  await expect("Paris").toSatisfyJudge(FactualityJudge({ judgeHarness }), {
    input: "What is the capital of France?",
    expected: "Paris is the capital of France.",
    threshold: 0.5,
  });

  expect(judgeHarnessRun).toHaveBeenCalledTimes(1);
});

test("FactualityJudge matcher options override a configured judge harness", async () => {
  const configuredRun = vi.fn(async () => ({
    choice: "D",
    rationale: "The configured harness should not be used.",
  }));
  const explicitRun = vi.fn(async () => ({
    choice: "C",
    rationale: "The explicit harness is used.",
  }));
  const configuredHarness = createMockJudgeHarness(configuredRun);
  const explicitHarness = createMockJudgeHarness(explicitRun);

  await expect("Paris").toSatisfyJudge(
    FactualityJudge({ judgeHarness: configuredHarness }),
    {
      input: "What is the capital of France?",
      expected: "Paris is the capital of France.",
      judgeHarness: explicitHarness,
      threshold: 0.5,
    },
  );

  expect(explicitRun).toHaveBeenCalledTimes(1);
  expect(configuredRun).not.toHaveBeenCalled();
});

test("FactualityJudge accepts explicit matcher expected values and judge harness", async () => {
  const judgeHarnessRun = vi.fn(async () => ({
    choice: "B",
    rationale: "The submitted answer is a supported superset.",
  }));
  const judgeHarness = createMockJudgeHarness(judgeHarnessRun);

  await expect({
    answer: "Paris",
  }).toSatisfyJudge(FactualityJudge(), {
    input: "What is the capital of France?",
    expected: {
      answer: "Paris",
    },
    judgeHarness,
    threshold: 0.5,
  });

  expect(judgeHarnessRun).toHaveBeenCalledWith(
    expect.objectContaining({
      prompt: expect.stringContaining(
        '"expert_answer": {\n    "answer": "Paris"\n  }',
      ),
    }),
    expect.objectContaining({ signal: undefined }),
  );
});

test("FactualityJudge requires a judge harness when expected values are present", async () => {
  const run = createRun("Paris");

  await expect(
    FactualityJudge().assess({
      input: "What is the capital of France?",
      output: run.output,
      expected: "Paris is the capital of France.",
      metadata: {},
      run,
      session: run.session,
      toolCalls: [],
      harness: factualityHarness,
    }),
  ).rejects.toThrow("FactualityJudge requires a judgeHarness");
});

test("FactualityJudge uses a configured judge harness when assess is called directly", async () => {
  const judgeHarnessRun = vi.fn(async () => ({
    choice: "C",
    rationale: "The submitted answer matches.",
  }));
  const run = createRun("Paris");

  const result = await FactualityJudge({
    judgeHarness: createMockJudgeHarness(judgeHarnessRun),
  }).assess({
    input: "What is the capital of France?",
    output: run.output,
    expected: "Paris is the capital of France.",
    metadata: {},
    run,
    session: run.session,
    toolCalls: [],
    harness: factualityHarness,
  });

  expect(result.score).toBe(1);
  expect(judgeHarnessRun).toHaveBeenCalledTimes(1);
});

test("FactualityJudge can be shared across different app harnesses and judge harnesses", async () => {
  const textJudgeHarnessRun = vi.fn(async () => ({
    choice: "C",
    rationale: "The submitted answer matches.",
  }));
  const objectJudgeHarnessRun = vi.fn(async () => ({
    choice: "B",
    rationale: "The submitted answer is a supported superset.",
  }));
  const factualityJudge = FactualityJudge();
  const objectHarness = createHarness<
    { question: string },
    { answer: string },
    { expected?: string }
  >({
    name: "object-qa-harness",
    run: async () => ({
      output: {
        answer: "Paris",
      },
    }),
  });
  const textRun = createRun("Paris is the capital of France.");
  const objectRun = createRun({ answer: "Paris" });

  const textResult = await factualityJudge.assess({
    input: "What is the capital of France?",
    output: textRun.output,
    metadata: {
      expected: "Paris is the capital of France.",
    },
    run: textRun,
    session: textRun.session,
    toolCalls: [],
    harness: factualityHarness,
    runJudge: createMockRunJudge(textJudgeHarnessRun),
  });
  const objectResult = await factualityJudge.assess({
    input: {
      question: "What is the capital of France?",
    },
    output: objectRun.output,
    metadata: {
      expected: "Paris is the capital of France.",
    },
    run: objectRun,
    session: objectRun.session,
    toolCalls: [],
    harness: objectHarness,
    runJudge: createMockRunJudge(objectJudgeHarnessRun),
  });

  expect(textResult.score).toBe(1);
  expect(objectResult.score).toBe(0.6);
  expect(textJudgeHarnessRun).toHaveBeenCalledTimes(1);
  expect(objectJudgeHarnessRun).toHaveBeenCalledTimes(1);
});

test("FactualityJudge parses JSON text returned by the judge harness", async () => {
  const runJudge = createMockRunJudge(
    async () =>
      '```json\n{"choice":"C","rationale":"The submitted answer matches."}\n```',
  );
  const run = createRun("Paris is the capital of France.");

  const result = await FactualityJudge().assess({
    input: "What is the capital of France?",
    output: run.output,
    expected: "Paris is the capital of France.",
    metadata: {},
    run,
    session: run.session,
    toolCalls: [],
    harness: factualityHarness,
    runJudge,
  });

  expect(result).toEqual({
    score: 1,
    metadata: {
      rationale: "The submitted answer matches.",
      choice: "C",
    },
  });
});

test("FactualityJudge skips blank assistant transcript output", async () => {
  const judgeHarnessRun = vi.fn(async () => ({
    choice: "C",
    rationale: "The submitted answer matches the expert answer.",
  }));
  const run = {
    output: undefined,
    session: {
      messages: [
        {
          role: "user",
          content: "What is the capital of France?",
        },
        {
          role: "assistant",
          content: "Paris is the capital of France.",
        },
        {
          role: "assistant",
          content: "   ",
        },
      ],
    },
    usage: {},
    errors: [],
  } satisfies HarnessRun<undefined>;

  const result = await FactualityJudge().assess({
    input: "What is the capital of France?",
    output: run.output,
    expected: "Paris is the capital of France.",
    metadata: {},
    run,
    session: run.session,
    toolCalls: [],
    harness: factualityHarness,
    runJudge: createMockRunJudge(judgeHarnessRun),
  });

  expect(result.score).toBe(1);
  expect(judgeHarnessRun).toHaveBeenCalledWith(
    expect.objectContaining({
      prompt: expect.stringContaining(
        '"submitted_answer": "Paris is the capital of France."',
      ),
    }),
    undefined,
  );
});

test("FactualityJudge fails closed when no expected value is provided", async () => {
  const run = createRun("Paris");

  const result = await FactualityJudge().assess({
    input: "What is the capital of France?",
    output: run.output,
    metadata: {},
    run,
    session: run.session,
    toolCalls: [],
    harness: factualityHarness,
  });

  expect(result).toEqual({
    score: 0,
    metadata: {
      rationale:
        "FactualityJudge requires a non-empty expert answer in `expected` or `metadata.expected`.",
    },
  });
});

test("FactualityJudge fails closed when expected is null", async () => {
  const run = createRun("Paris");

  const result = await FactualityJudge().assess({
    input: "What is the capital of France?",
    output: run.output,
    metadata: {
      expected: null,
    },
    run,
    session: run.session,
    toolCalls: [],
    harness: factualityHarness,
  });

  expect(result).toEqual({
    score: 0,
    metadata: {
      rationale:
        "FactualityJudge requires a non-empty expert answer in `expected` or `metadata.expected`.",
    },
  });
});

test("FactualityJudge treats explicit null expected as missing", async () => {
  const runJudge = vi.fn();
  const run = createRun("Paris");
  const metadata = {
    expected: "Paris is the capital of France.",
  };

  const result = await FactualityJudge().assess({
    input: "What is the capital of France?",
    output: run.output,
    expected: null,
    metadata,
    run,
    session: run.session,
    toolCalls: [],
    harness: factualityHarness,
    runJudge: createMockRunJudge(runJudge),
  });

  expect(result).toEqual({
    score: 0,
    metadata: {
      rationale:
        "FactualityJudge requires a non-empty expert answer in `expected` or `metadata.expected`.",
    },
  });
  expect(runJudge).not.toHaveBeenCalled();
});

test("FactualityJudge fails closed when expected is blank", async () => {
  const runJudge = vi.fn();
  const run = createRun("Paris");

  const result = await FactualityJudge().assess({
    input: "What is the capital of France?",
    output: run.output,
    expected: "   ",
    metadata: {},
    run,
    session: run.session,
    toolCalls: [],
    harness: factualityHarness,
    runJudge: createMockRunJudge(runJudge),
  });

  expect(result).toEqual({
    score: 0,
    metadata: {
      rationale:
        "FactualityJudge requires a non-empty expert answer in `expected` or `metadata.expected`.",
    },
  });
  expect(runJudge).not.toHaveBeenCalled();
});

function createMockJudgeHarness(run: CreateJudgeHarnessOptions["run"]) {
  return createJudgeHarness({
    name: "mock-judge-harness",
    run,
  });
}

function createMockRunJudge(
  run: (
    input: Parameters<RunJudge>[0],
    options: Parameters<RunJudge>[1],
  ) => JsonValue | undefined | Promise<JsonValue | undefined>,
): RunJudge {
  return (input, options) => Promise.resolve(run(input, options));
}

function createRun<TOutput extends JsonValue | undefined>(
  output: TOutput,
): HarnessRun<TOutput> {
  return {
    output,
    session: {
      messages: [
        {
          role: "assistant",
          content: output,
        },
      ],
    },
    usage: {},
    errors: [],
  } satisfies HarnessRun<TOutput>;
}
