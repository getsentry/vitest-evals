import { beforeEach, expect, test, vi } from "vitest";
import {
  assistantMessages,
  describeEval,
  namedJudge,
  type JudgeContext,
  StructuredOutputJudge,
  ToolCallJudge,
  toolCalls,
  toolMessages,
  userMessages,
  type Harness,
  type HarnessContext,
  type HarnessRun,
} from "./index";

type RefundEvalMetadata = {
  name: string;
  expectedStatus: string;
};

const runSpy = vi.fn(
  async (
    input: string,
    context: HarnessContext<RefundEvalMetadata>,
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

const harness: Harness<string, RefundEvalMetadata> = {
  name: "pi-ai",
  run: runSpy,
};

const judgeSpy = vi.fn(
  async (opts: JudgeContext<string, RefundEvalMetadata>) => ({
    score: opts.metadata.expectedStatus === "approved" ? 1 : 0,
  }),
);

const thresholdJudgeSpy = vi.fn(
  async (_opts: JudgeContext<string, RefundEvalMetadata>) => ({
    score: 0.5,
  }),
);

beforeEach(() => {
  runSpy.mockClear();
  judgeSpy.mockClear();
  thresholdJudgeSpy.mockClear();
});

describeEval("harness mode", { harness }, (it) => {
  it("refund request", async ({ run }) => {
    const result = await run("Refund invoice inv_123", {
      metadata: {
        name: "refund request",
        expectedStatus: "approved",
      },
    });

    expect(result.output).toEqual({
      status: "approved",
    });
    expect(result.artifacts).toEqual({
      request: "Refund invoice inv_123",
    });
    expect(toolCalls(result.session)).toEqual([
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
        metadata: expect.objectContaining({
          expectedStatus: "approved",
          name: "refund request",
        }),
      }),
    );
  });
});

describeEval(
  "harness mode with automatic judges",
  {
    harness,
    judges: [judgeSpy],
  },
  (it) => {
    it("refund request with judge", async ({ run, task }) => {
      const result = await run("Refund invoice inv_123", {
        metadata: {
          name: "refund request with judge",
          expectedStatus: "approved",
        },
      });

      expect(result.output).toEqual({
        status: "approved",
      });
      expect(toolCalls(result.session)).toHaveLength(1);
      expect(runSpy).toHaveBeenCalledTimes(1);
      expect(judgeSpy).toHaveBeenCalledTimes(1);
      expect(judgeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          input: "Refund invoice inv_123",
          inputValue: "Refund invoice inv_123",
          output: "approved",
          metadata: expect.objectContaining({
            expectedStatus: "approved",
          }),
          run: expect.objectContaining({
            output: {
              status: "approved",
            },
          }),
        }),
      );
      expect(task.meta.eval).toEqual({
        avgScore: 1,
        output: "approved",
        scores: [{ name: judgeSpy.name, score: 1 }],
        thresholdFailed: false,
        toolCalls: [
          {
            name: "lookupInvoice",
            arguments: {
              invoiceId: "inv_123",
            },
          },
        ],
      });
    });
  },
);

describeEval(
  "harness mode with explicit suite judge threshold",
  {
    harness,
    judges: [thresholdJudgeSpy],
    judgeThreshold: 0.5,
  },
  (it) => {
    it("uses judgeThreshold for automatic suite judges", async ({
      run,
      task,
    }) => {
      await run("Refund invoice inv_123", {
        metadata: {
          name: "refund request at threshold",
          expectedStatus: "approved",
        },
      });

      expect(thresholdJudgeSpy).toHaveBeenCalledTimes(1);
      expect(task.meta.eval).toEqual({
        avgScore: 0.5,
        output: "approved",
        scores: [{ name: thresholdJudgeSpy.name, score: 0.5 }],
        thresholdFailed: false,
        toolCalls: [
          {
            name: "lookupInvoice",
            arguments: {
              invoiceId: "inv_123",
            },
          },
        ],
      });
    });
  },
);

describeEval("harness mode with explicit judge matcher", { harness }, (it) => {
  it("records explicit judge metadata on the task", async ({ run, task }) => {
    const result = await run("Refund invoice inv_123", {
      metadata: {
        name: "refund request with explicit judge matcher",
        expectedStatus: "approved",
      },
    });
    const explicitJudge = vi.fn(
      async (opts: JudgeContext<string, RefundEvalMetadata>) => ({
        score:
          opts.inputValue === "Refund invoice inv_123" &&
          opts.metadata.expectedStatus === "approved" &&
          opts.toolCalls?.[0]?.name === "lookupInvoice"
            ? 1
            : 0,
      }),
    );

    await expect(result).toSatisfyJudge(explicitJudge, {
      metadata: {
        expectedStatus: "approved",
        name: "refund request with explicit judge matcher",
      },
    });

    expect(explicitJudge).toHaveBeenCalledWith(
      expect.objectContaining({
        input: "Refund invoice inv_123",
        inputValue: "Refund invoice inv_123",
        output: "approved",
        metadata: {
          expectedStatus: "approved",
          name: "refund request with explicit judge matcher",
        },
      }),
    );
    expect(task.meta.eval).toEqual({
      avgScore: 1,
      output: "approved",
      scores: [{ name: explicitJudge.name, score: 1 }],
      thresholdFailed: false,
      toolCalls: [
        {
          name: "lookupInvoice",
          arguments: {
            invoiceId: "inv_123",
          },
        },
      ],
    });
  });
});

describeEval(
  "harness mode clears stale run metadata",
  {
    harness: {
      name: "flaky-harness",
      run: vi
        .fn<(input: string, context: HarnessContext) => Promise<HarnessRun>>()
        .mockResolvedValueOnce({
          session: {
            messages: [],
          },
          usage: {},
          errors: [],
        })
        .mockRejectedValueOnce(new Error("plain harness failure")),
    },
  },
  (it) => {
    it("drops previous harness metadata before a later plain error", async ({
      run,
      task,
    }) => {
      await run("Refund invoice inv_123");
      await expect(run("Refund invoice inv_404")).rejects.toThrow(
        "plain harness failure",
      );

      expect(task.meta.harness).toBeUndefined();
    });
  },
);

test("toSatisfyJudge reuses normalized harness run data", async () => {
  const run = await harness.run("Refund invoice inv_123", {
    metadata: {
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
    async (opts: JudgeContext<string, RefundEvalMetadata>) => ({
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
      inputValue: "Refund invoice inv_123",
      output: "approved",
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
      metadata: {},
    }),
  );
});

test("automatic judges read per-run params from metadata", async () => {
  const metadataJudge = vi.fn(
    async (opts: JudgeContext<string, RefundEvalMetadata>) => ({
      score: opts.metadata.expectedStatus === "approved" ? 1 : 0,
    }),
  );

  const run = await harness.run("Refund invoice inv_123", {
    metadata: {
      expectedStatus: "approved",
      name: "compatibility judge",
    },
    task: {
      meta: {},
    },
    artifacts: {},
    setArtifact: vi.fn(),
  });

  await expect(run).toSatisfyJudge(metadataJudge, {
    metadata: {
      expectedStatus: "approved",
      name: "compatibility judge",
    },
  });

  expect(metadataJudge).toHaveBeenCalledWith(
    expect.objectContaining({
      metadata: {
        expectedStatus: "approved",
        name: "compatibility judge",
      },
    }),
  );
});

test("toSatisfyJudge uses plain input to seed synthetic sessions", async () => {
  const sessionJudge = vi.fn(async (opts: JudgeContext) => ({
    score:
      opts.session.messages[0]?.content === "Refund invoice inv_123" ? 1 : 0,
  }));

  await expect({
    status: "approved",
  }).toSatisfyJudge(sessionJudge, {
    input: "Refund invoice inv_123",
  });

  expect(sessionJudge).toHaveBeenCalledWith(
    expect.objectContaining({
      input: "Refund invoice inv_123",
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
            },
          },
        ],
      }),
    }),
  );
});

test("toSatisfyJudge builds a synthetic run for raw output values", async () => {
  const outputJudge = vi.fn(async (opts: JudgeContext) => ({
    score: opts.output.includes('"status":"approved"') ? 1 : 0,
  }));

  await expect({
    status: "approved",
    refundId: "rf_inv_123",
  }).toSatisfyJudge(outputJudge, {
    inputValue: "Refund invoice inv_123",
  });

  expect(outputJudge).toHaveBeenCalledWith(
    expect.objectContaining({
      input: "Refund invoice inv_123",
      inputValue: "Refund invoice inv_123",
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

test("toSatisfyJudge ignores empty outputText when assistant text is available", async () => {
  const outputJudge = vi.fn(async (opts: JudgeContext) => ({
    score: opts.output === "approved" ? 1 : 0,
  }));

  await expect({
    session: {
      messages: [
        {
          role: "assistant",
          content: "approved",
        },
      ],
      outputText: "",
    },
    output: {
      status: "approved",
    },
    usage: {},
    errors: [],
  } satisfies HarnessRun).toSatisfyJudge(outputJudge);

  expect(outputJudge).toHaveBeenCalledWith(
    expect.objectContaining({
      output: "approved",
    }),
  );
});

test("toSatisfyJudge falls back to structured output when text output is blank", async () => {
  const outputJudge = vi.fn(async (opts: JudgeContext) => ({
    score:
      opts.output === '{"status":"approved","refundId":"rf_inv_123"}' ? 1 : 0,
  }));

  await expect({
    session: {
      messages: [
        {
          role: "assistant",
          content: {
            status: "approved",
            refundId: "rf_inv_123",
          },
        },
      ],
      outputText: "   ",
    },
    output: {
      status: "approved",
      refundId: "rf_inv_123",
    },
    usage: {},
    errors: [],
  } satisfies HarnessRun).toSatisfyJudge(outputJudge);

  expect(outputJudge).toHaveBeenCalledWith(
    expect.objectContaining({
      output: '{"status":"approved","refundId":"rf_inv_123"}',
    }),
  );
});

test("toSatisfyJudge ignores empty outputText on normalized sessions", async () => {
  const outputJudge = vi.fn(async (opts: JudgeContext) => ({
    score: opts.output === "approved" ? 1 : 0,
  }));

  await expect({
    messages: [
      {
        role: "assistant",
        content: "approved",
      },
    ],
    outputText: "",
  } satisfies NormalizedSession).toSatisfyJudge(outputJudge);

  expect(outputJudge).toHaveBeenCalledWith(
    expect.objectContaining({
      output: "approved",
    }),
  );
});

test("toSatisfyJudge accepts a null threshold to record without failing", async () => {
  const outputJudge = vi.fn(async () => ({
    score: 0,
  }));

  await expect({
    status: "denied",
  }).toSatisfyJudge(outputJudge, {
    inputValue: "Refund invoice inv_404",
    threshold: null,
  });

  expect(outputJudge).toHaveBeenCalledWith(
    expect.objectContaining({
      input: "Refund invoice inv_404",
      inputValue: "Refund invoice inv_404",
    }),
  );
});

test("namedJudge assigns a stable custom name", async () => {
  const judge = namedJudge("RefundJudge", async () => ({
    score: 1,
  }));

  expect(judge.name).toBe("RefundJudge");
  await expect({
    status: "approved",
  }).toSatisfyJudge(judge);
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

test("StructuredOutputJudge reads expected fields from metadata", async () => {
  const judge = StructuredOutputJudge();

  const result = await judge({
    input: "Refund invoice inv_123",
    output: '{"status":"approved","reason":"invoice refunded"}',
    run: {
      session: {
        messages: [],
      },
      output: {
        status: "approved",
        reason: "invoice refunded",
      },
      usage: {},
      errors: [],
    },
    metadata: {
      expected: {
        status: "approved",
      },
    },
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
  expect(assistantMessages(session)).toEqual([
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
  ]);
  expect(toolMessages(session)).toEqual([
    {
      role: "tool",
      content: {
        invoiceId: "inv_123",
      },
    },
  ]);
  expect(toolCalls(session)).toEqual([
    {
      name: "lookupInvoice",
    },
  ]);
});
