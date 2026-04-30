import { beforeEach, expect, test, vi } from "vitest";
import {
  assistantMessages,
  describeEval,
  hasCallableMethod,
  judge,
  normalizeContent,
  normalizeMetadata,
  normalizeRecord,
  ToolCallJudge,
  toJsonValue,
  toolCalls,
  toolMessages,
  userMessages,
  type Harness,
  type HarnessJudgeOptions,
  type HarnessPrompt,
  type HarnessContext,
  type HarnessRun,
} from "./index";

type RefundEvalCase = {
  name: string;
  input: string;
  expectedStatus: string;
};

const runSpy = vi.fn(
  async (
    input: string,
    context: HarnessContext<RefundEvalCase>,
  ): Promise<HarnessRun> => {
    context.setArtifact("request", input);

    return {
      session: {
        messages: [
          {
            role: "user",
            content: input,
          },
          {
            role: "assistant",
            content: "approved",
            toolCalls: [
              {
                name: "lookupInvoice",
                arguments: {
                  invoiceId: "inv_123",
                },
              },
            ],
          },
        ],
        outputText: "approved",
        provider: "pi-ai",
        model: "pi-test",
      },
      output: {
        status: "approved",
      },
      usage: {
        provider: "pi-ai",
        model: "pi-test",
        inputTokens: 10,
        outputTokens: 4,
        totalTokens: 14,
        toolCalls: 1,
      },
      errors: [],
    };
  },
);

const harness: Harness<string, RefundEvalCase> = {
  name: "pi-ai",
  run: runSpy,
};

const agentHarness: Harness<string, RefundEvalCase, { id: string }> = {
  name: "pi-ai",
  setup: async () => ({
    agent: {
      id: "refund-agent",
    },
    run: runSpy,
  }),
  run: runSpy,
};

const judgeSpy = vi.fn(async (opts: HarnessJudgeOptions<RefundEvalCase>) => ({
  score: opts.expectedStatus === "approved" ? 1 : 0,
}));

const judgePromptSpy = vi.fn(async () =>
  JSON.stringify({
    score: 1,
    rationale: "The result approved the refund and used the expected tool.",
  }),
);

const harnessPromptJudgeSpy = vi.fn(
  async (opts: HarnessJudgeOptions<RefundEvalCase>) => {
    const verdict = JSON.parse(
      await opts.harness.prompt(
        JSON.stringify(
          {
            input: opts.input,
            output: opts.output,
            toolCalls: opts.toolCalls,
          },
          null,
          2,
        ),
        {
          system: "Grade refund decisions.",
        },
      ),
    ) as { score: number; rationale: string };

    return {
      score: verdict.score,
      metadata: {
        rationale: verdict.rationale,
      },
    };
  },
);

const harnessPromptJudge = judge("HarnessPromptJudge", harnessPromptJudgeSpy);

const harnessWithPrompt: Harness<string, RefundEvalCase, { id: string }> = {
  ...agentHarness,
  prompt: judgePromptSpy satisfies HarnessPrompt,
};

beforeEach(() => {
  runSpy.mockClear();
  judgeSpy.mockClear();
  judgePromptSpy.mockClear();
  harnessPromptJudgeSpy.mockClear();
});

describeEval("harness mode", {
  data: [
    {
      name: "refund request",
      input: "Refund invoice inv_123",
      expectedStatus: "approved",
    },
  ],
  harness,
  test: async ({ input, caseData, run, session }) => {
    expect(input).toBe("Refund invoice inv_123");
    expect(caseData.expectedStatus).toBe("approved");
    expect(run.output).toEqual({
      status: "approved",
    });
    expect(run.artifacts).toEqual({
      request: "Refund invoice inv_123",
    });
    expect(toolCalls(session)).toEqual([
      {
        name: "lookupInvoice",
        arguments: {
          invoiceId: "inv_123",
        },
      },
    ]);
    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(runSpy).toHaveBeenCalledWith(
      "Refund invoice inv_123",
      expect.objectContaining({
        caseData: expect.objectContaining({
          input: "Refund invoice inv_123",
          expectedStatus: "approved",
        }),
      }),
    );
  },
});

describeEval(
  "harness mode with vitest-style tasks",
  { harness: agentHarness },
  (it) => {
    it("refund request", async ({ agent, run }) => {
      const result = await run("Refund invoice inv_123", {
        metadata: {
          expectedStatus: "approved",
        },
      });

      expect(agent?.id).toBe("refund-agent");
      expect(result.name).toBe("refund request");
      expect(result.input).toBe("Refund invoice inv_123");
      expect(result.metadata.expectedStatus).toBe("approved");
      expect(result.caseData.expectedStatus).toBe("approved");
      expect(result.output).toEqual({
        status: "approved",
      });
      expect(toolCalls(result.session)).toHaveLength(1);

      const expectedStatus = result.metadata.expectedStatus;
      if (!expectedStatus) {
        throw new Error("Expected metadata.expectedStatus to be present.");
      }
      await expect(result).toBeJudged(judgeSpy, {
        expectedStatus,
      });

      expect(judgeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          input: "Refund invoice inv_123",
          rawInput: "Refund invoice inv_123",
          output: '{"status":"approved"}',
          caseData: expect.objectContaining({
            expectedStatus: "approved",
          }),
        }),
      );
    });
  },
);

describeEval(
  "harness mode with reserved run options",
  { harness: agentHarness },
  (it) => {
    it("uses metadata without consuming future option names", async ({
      run,
    }) => {
      const result = await run("Refund invoice inv_123", {
        name: "custom report name",
        metadata: {
          expectedStatus: "approved",
        },
      });

      expect(result.name).toBe("custom report name");
      expect(result.metadata).toEqual({
        expectedStatus: "approved",
      });
      expect(result.caseData).toMatchObject({
        input: "Refund invoice inv_123",
        name: "custom report name",
        expectedStatus: "approved",
      });
    });
  },
);

describeEval("harness mode with explicit judge matcher", {
  data: [
    {
      name: "refund request with explicit judge matcher",
      input: "Refund invoice inv_123",
      expectedStatus: "approved",
    },
  ],
  harness,
  test: async (result) => {
    const explicitJudge = vi.fn(
      async (opts: HarnessJudgeOptions<RefundEvalCase>) => ({
        score:
          opts.rawInput === "Refund invoice inv_123" &&
          opts.caseData.expectedStatus === "approved" &&
          opts.toolCalls?.[0]?.name === "lookupInvoice"
            ? 1
            : 0,
      }),
    );

    await expect(result).toBeJudged(explicitJudge);

    expect(explicitJudge).toHaveBeenCalledWith(
      expect.objectContaining({
        input: "Refund invoice inv_123",
        rawInput: "Refund invoice inv_123",
        output: '{"status":"approved"}',
        assistantOutput: "approved",
        expectedStatus: "approved",
        harness: expect.objectContaining({
          prompt: expect.any(Function),
        }),
        caseData: {
          input: "Refund invoice inv_123",
          expectedStatus: "approved",
          name: "refund request with explicit judge matcher",
        },
      }),
    );
  },
});

describeEval("harness mode with automatic judges", {
  data: async () => [
    {
      name: "refund request with judge",
      input: "Refund invoice inv_123",
      expectedStatus: "approved",
    },
  ],
  harness,
  judges: [judgeSpy],
  test: async ({ run, session }) => {
    expect(run.output).toEqual({
      status: "approved",
    });
    expect(toolCalls(session)).toHaveLength(1);
    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(judgeSpy).toHaveBeenCalledTimes(1);
    expect(judgeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        input: "Refund invoice inv_123",
        rawInput: "Refund invoice inv_123",
        output: '{"status":"approved"}',
        expectedStatus: "approved",
        caseData: expect.objectContaining({
          input: "Refund invoice inv_123",
          expectedStatus: "approved",
        }),
        harness: expect.objectContaining({
          prompt: expect.any(Function),
        }),
        run: expect.objectContaining({
          output: {
            status: "approved",
          },
        }),
      }),
    );
  },
});

describeEval(
  "harness mode with harness prompt",
  { harness: harnessWithPrompt },
  (it) => {
    it("passes the harness prompt helper to judge matchers", async ({
      run,
    }) => {
      const result = await run("Refund invoice inv_123", {
        metadata: {
          expectedStatus: "approved",
        },
      });

      await expect(result).toBeJudged(harnessPromptJudge);

      expect(harnessPromptJudgeSpy).toHaveBeenCalledTimes(1);
      expect(harnessPromptJudgeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          harness: expect.objectContaining({
            prompt: judgePromptSpy,
          }),
          output: '{"status":"approved"}',
          toolCalls: [
            {
              name: "lookupInvoice",
              arguments: {
                invoiceId: "inv_123",
              },
            },
          ],
        }),
      );
      expect(judgePromptSpy).toHaveBeenCalledWith(
        expect.stringContaining('"output": "{\\"status\\":\\"approved\\"}"'),
        {
          system: "Grade refund decisions.",
        },
      );
    });
  },
);

test("toSatisfyJudge reuses normalized harness run data", async () => {
  const run = await harness.run("Refund invoice inv_123", {
    caseData: {
      input: "Refund invoice inv_123",
      expectedStatus: "approved",
      name: "explicit judge",
    },
    task: {
      meta: {},
    },
    artifacts: {},
    setArtifact: vi.fn(),
  });

  const explicitJudge = vi.fn(
    async (opts: HarnessJudgeOptions<RefundEvalCase>) => ({
      score:
        (opts.run.output as { status?: string }).status === "approved" &&
        opts.toolCalls?.[0]?.name === "lookupInvoice"
          ? 1
          : 0,
    }),
  );

  await expect(run).toSatisfyJudge(explicitJudge);

  expect(explicitJudge).toHaveBeenCalledWith(
    expect.objectContaining({
      input: "Refund invoice inv_123",
      rawInput: "Refund invoice inv_123",
      output: '{"status":"approved"}',
      assistantOutput: "approved",
      run: expect.objectContaining({
        output: {
          status: "approved",
        },
      }),
      session: run.session,
      toolCalls: [
        {
          name: "lookupInvoice",
          arguments: {
            invoiceId: "inv_123",
          },
        },
      ],
      caseData: {
        input: "Refund invoice inv_123",
      },
    }),
  );
});

test("toSatisfyJudge builds a synthetic run for raw output values", async () => {
  const outputJudge = vi.fn(async (opts: HarnessJudgeOptions) => ({
    score: opts.output.includes('"status":"approved"') ? 1 : 0,
  }));

  await expect({
    status: "approved",
    refundId: "rf_inv_123",
  }).toSatisfyJudge(outputJudge, {
    rawInput: "Refund invoice inv_123",
  });

  expect(outputJudge).toHaveBeenCalledWith(
    expect.objectContaining({
      input: "Refund invoice inv_123",
      rawInput: "Refund invoice inv_123",
      output: '{"status":"approved","refundId":"rf_inv_123"}',
      run: expect.objectContaining({
        output: {
          status: "approved",
          refundId: "rf_inv_123",
        },
      }),
      session: expect.objectContaining({
        messages: [
          {
            role: "user",
            content: "Refund invoice inv_123",
          },
          {
            role: "assistant",
            content: {
              status: "approved",
              refundId: "rf_inv_123",
            },
          },
        ],
      }),
    }),
  );
});

test("judge assigns a stable custom name", async () => {
  const refundJudge = judge("RefundJudge", async () => ({
    score: 1,
  }));

  expect(refundJudge.name).toBe("RefundJudge");
  await expect({
    status: "approved",
  }).toSatisfyJudge(refundJudge);
});

test("ToolCallJudge accepts string expected tools", async () => {
  const judge = ToolCallJudge();

  const result = await judge({
    input: "Refund invoice inv_123",
    output: '{"status":"approved"}',
    expectedTools: ["lookupInvoice", "createRefund"],
    toolCalls: [
      {
        name: "lookupInvoice",
      },
      {
        name: "createRefund",
      },
    ],
  });

  expect(result.score).toBe(1);
});

test("normalized session helpers expose common access paths", () => {
  const session: HarnessRun["session"] = {
    messages: [
      {
        role: "system",
        content: "You are a refund agent.",
      },
      {
        role: "user",
        content: "Refund invoice inv_123",
      },
      {
        role: "assistant",
        content: "Checking the invoice.",
      },
      {
        role: "assistant",
        toolCalls: [
          {
            name: "lookupInvoice",
          },
        ],
      },
      {
        role: "tool",
        content: {
          invoiceId: "inv_123",
        },
      },
    ],
    outputText: "approved",
  };

  expect(userMessages(session)).toEqual([
    {
      role: "user",
      content: "Refund invoice inv_123",
    },
  ]);
  expect(assistantMessages(session)).toHaveLength(2);
  expect(toolMessages(session)).toEqual([
    {
      role: "tool",
      content: {
        invoiceId: "inv_123",
      },
    },
  ]);
});

test("shared JSON normalization helpers preserve report semantics", () => {
  expect(toJsonValue([1, undefined, { keep: true, drop: undefined }])).toEqual([
    1,
    null,
    {
      keep: true,
    },
  ]);
  expect(toJsonValue({})).toEqual({});
  expect(normalizeRecord({ keep: "yes", drop: undefined })).toEqual({
    keep: "yes",
  });
  expect(normalizeMetadata({ drop: undefined })).toBeUndefined();
  expect(normalizeContent(undefined)).toBe("undefined");
  expect(hasCallableMethod({ run: () => undefined }, "run")).toBe(true);
  expect(hasCallableMethod({ run: "not callable" }, "run")).toBe(false);
});
