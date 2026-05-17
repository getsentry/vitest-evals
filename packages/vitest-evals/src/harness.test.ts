import { beforeEach, expect, test, vi } from "vitest";
import {
  assistantMessages,
  createJudge,
  createHarness,
  describeEval,
  type JudgeContext,
  StructuredOutputJudge,
  ToolCallJudge,
  toolCalls,
  toolMessages,
  userMessages,
  type Harness,
  type HarnessContext,
  type HarnessRun,
  type NormalizedSession,
} from "./index";

type RefundEvalMetadata = {
  name: string;
  expectedStatus: string;
};

type RefundOutput = {
  status: string;
};

type RefundHarness = Harness<string, RefundEvalMetadata, RefundOutput>;

type RefundJudgeContext = JudgeContext<
  string,
  RefundOutput,
  RefundEvalMetadata,
  RefundHarness
>;

const runSpy = vi.fn(
  async (
    input: string,
    context: HarnessContext<RefundEvalMetadata>,
  ): Promise<HarnessRun<RefundOutput>> => {
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

const harness: RefundHarness = {
  name: "pi-ai",
  run: runSpy,
};

const customHarness = {
  ...harness,
  label: "custom-harness",
};

const judgeSpy = vi.fn(async (opts: RefundJudgeContext) => ({
  score: opts.metadata.expectedStatus === "approved" ? 1 : 0,
}));

const judge = createJudge("RefundStatusJudge", judgeSpy);

const thresholdJudgeSpy = vi.fn(async (_opts: RefundJudgeContext) => ({
  score: 0.5,
}));

const thresholdJudge = createJudge("ThresholdJudge", thresholdJudgeSpy);

beforeEach(() => {
  runSpy.mockClear();
  judgeSpy.mockClear();
  thresholdJudgeSpy.mockClear();
});

describeEval(
  "createHarness",
  {
    harness: createHarness<string, RefundEvalMetadata>({
      name: "custom-app",
      run: async ({ input, setArtifact }) => {
        setArtifact("request", input);

        return {
          output: {
            status: "approved",
          },
          toolCalls: [
            {
              name: "lookupInvoice",
              arguments: {
                invoiceId: "inv_123",
              },
              result: {
                refundable: true,
              },
            },
          ],
          usage: {
            provider: "test-provider",
            model: "test-model",
            inputTokens: 4,
            outputTokens: 2,
          },
          metadata: {
            scenario: "refund",
          },
        };
      },
    }),
  },
  (it) => {
    it("normalizes lightweight harness results", async ({ run }) => {
      const result = await run("Refund invoice inv_123", {
        metadata: {
          name: "custom harness result",
          expectedStatus: "approved",
        },
      });

      expect(result.output).toEqual({
        status: "approved",
      });
      expect(result.session).toMatchObject({
        provider: "test-provider",
        model: "test-model",
        metadata: {
          scenario: "refund",
        },
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
            toolCalls: [
              {
                name: "lookupInvoice",
                arguments: {
                  invoiceId: "inv_123",
                },
                result: {
                  refundable: true,
                },
              },
            ],
          },
        ],
      });
      expect(result.artifacts).toEqual({
        request: "Refund invoice inv_123",
      });
    });
  },
);

test("createHarness drops non-normalized lightweight tool call fields", async () => {
  const lightweightHarness = createHarness({
    name: "custom-app",
    run: async () => ({
      output: "approved",
      toolCalls: [
        {
          name: "lookupInvoice",
          arguments: "invoice inv_123",
          result: undefined,
          error: undefined,
          metadata: {
            replay: "recorded",
          },
        },
      ],
    }),
  });

  const result = await lightweightHarness.run("Refund invoice inv_123", {
    metadata: {},
    task: {
      meta: {},
    },
    artifacts: {},
    setArtifact: vi.fn(),
  });

  expect(toolCalls(result.session)).toEqual([
    {
      name: "lookupInvoice",
      metadata: {
        replay: "recorded",
      },
    },
  ]);
});

test("createHarness preserves null lightweight output in the session", async () => {
  const lightweightHarness = createHarness({
    name: "custom-app",
    run: async () => ({
      output: null,
    }),
  });

  const result = await lightweightHarness.run("Refund invoice inv_123", {
    metadata: {},
    task: {
      meta: {},
    },
    artifacts: {},
    setArtifact: vi.fn(),
  });

  expect(result.output).toBeNull();
  expect(result.session.messages).toEqual([
    {
      role: "user",
      content: "Refund invoice inv_123",
    },
    {
      role: "assistant",
      content: null,
    },
  ]);
});

test("createHarness serializes Error objects in lightweight errors", async () => {
  const lightweightHarness = createHarness({
    name: "custom-app",
    run: async () => ({
      output: "denied",
      errors: [new TypeError("agent failed")],
    }),
  });

  const result = await lightweightHarness.run("Refund invoice inv_123", {
    metadata: {},
    task: {
      meta: {},
    },
    artifacts: {},
    setArtifact: vi.fn(),
  });

  expect(result.errors).toEqual([
    {
      type: "TypeError",
      message: "agent failed",
    },
  ]);
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
    judges: [judge],
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
          output: {
            status: "approved",
          },
          metadata: expect.objectContaining({
            expectedStatus: "approved",
          }),
          run: expect.objectContaining({
            output: {
              status: "approved",
            },
          }),
          signal: expect.any(AbortSignal),
        }),
      );
      expect(task.meta.eval).toEqual({
        avgScore: 1,
        output: {
          status: "approved",
        },
        scores: [{ name: "RefundStatusJudge", score: 1 }],
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
  "harness mode with custom harness context",
  {
    harness: customHarness,
    judges: [
      createJudge(
        "CustomHarnessJudge",
        async ({
          harness: configuredHarness,
        }: JudgeContext<
          string,
          RefundOutput,
          RefundEvalMetadata,
          typeof customHarness
        >) => {
          return {
            score: configuredHarness.label === "custom-harness" ? 1 : 0,
          };
        },
      ),
    ],
  },
  (it) => {
    it("preserves the configured harness subtype for judges", async ({
      run,
    }) => {
      await run("Refund invoice inv_123", {
        metadata: {
          name: "refund request with typed harness helper",
          expectedStatus: "approved",
        },
      });
    });
  },
);

describeEval(
  "harness mode with explicit suite judge threshold",
  {
    harness,
    judges: [thresholdJudge],
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
        output: {
          status: "approved",
        },
        scores: [{ name: "ThresholdJudge", score: 0.5 }],
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
    const explicitJudgeSpy = vi.fn(async (opts: RefundJudgeContext) => ({
      score:
        opts.input === "Refund invoice inv_123" &&
        opts.output?.status === "approved" &&
        opts.metadata.expectedStatus === "approved" &&
        opts.toolCalls?.[0]?.name === "lookupInvoice"
          ? 1
          : 0,
    }));
    const explicitJudge = createJudge("ExplicitRefundJudge", explicitJudgeSpy);

    await expect(result).toSatisfyJudge(explicitJudge, {
      metadata: {
        expectedStatus: "approved",
        name: "refund request with explicit judge matcher",
      },
    });

    expect(explicitJudgeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        input: "Refund invoice inv_123",
        output: {
          status: "approved",
        },
        metadata: {
          expectedStatus: "approved",
          name: "refund request with explicit judge matcher",
        },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(task.meta.eval).toEqual({
      avgScore: 1,
      output: {
        status: "approved",
      },
      scores: [{ name: "ExplicitRefundJudge", score: 1 }],
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

  it("reuses the suite harness and metadata for explicit judges", async ({
    run,
  }) => {
    const result = await run("Refund invoice inv_123", {
      metadata: {
        name: "refund request with explicit typed harness judge",
        expectedStatus: "approved",
      },
    });
    const explicitJudgeSpy = vi.fn(
      async ({ harness: configuredHarness, metadata }: RefundJudgeContext) => {
        return {
          score:
            configuredHarness === harness &&
            metadata.expectedStatus === "approved"
              ? 1
              : 0,
        };
      },
    );
    const explicitJudge = createJudge("TypedHarnessJudge", explicitJudgeSpy);

    await expect(result).toSatisfyJudge(explicitJudge);

    expect(explicitJudgeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        harness,
        metadata: {
          expectedStatus: "approved",
          name: "refund request with explicit typed harness judge",
        },
      }),
    );
  });

  it("uses the current test run context for raw explicit judge values", async ({
    run,
  }) => {
    const result = await run("Refund invoice inv_123", {
      metadata: {
        name: "refund request with contextual raw judge",
        expectedStatus: "approved",
      },
    });
    const explicitJudgeSpy = vi.fn(
      async ({
        harness: configuredHarness,
        input,
        metadata,
        output,
        run: judgeRun,
        session,
        toolCalls: judgeToolCalls,
      }: RefundJudgeContext) => {
        return {
          score:
            configuredHarness === harness &&
            output?.status === "approved" &&
            judgeRun === result &&
            session === result.session &&
            judgeToolCalls[0]?.name === "lookupInvoice" &&
            metadata.expectedStatus === "approved" &&
            input === "Refund invoice inv_123"
              ? 1
              : 0,
        };
      },
    );
    const explicitJudge = createJudge(
      "RawOutputContextJudge",
      explicitJudgeSpy,
    );

    await expect(result.output).toSatisfyJudge(explicitJudge);

    expect(explicitJudgeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        harness,
        input: "Refund invoice inv_123",
        output: {
          status: "approved",
        },
        run: result,
        session: result.session,
        toolCalls: [
          {
            name: "lookupInvoice",
            arguments: {
              invoiceId: "inv_123",
            },
          },
        ],
        metadata: {
          expectedStatus: "approved",
          name: "refund request with contextual raw judge",
        },
      }),
    );
  });

  it("prefers exact output object context over the latest run fallback", async ({
    run,
  }) => {
    const first = await run("Refund invoice inv_123", {
      metadata: {
        name: "first raw judge context",
        expectedStatus: "approved",
      },
    });

    await run("Refund invoice inv_456", {
      metadata: {
        name: "second raw judge context",
        expectedStatus: "rejected",
      },
    });

    const explicitJudgeSpy = vi.fn(
      async ({ input, metadata, run: judgeRun }: RefundJudgeContext) => ({
        score:
          input === "Refund invoice inv_123" &&
          metadata.name === "first raw judge context" &&
          judgeRun === first
            ? 1
            : 0,
      }),
    );
    const explicitJudge = createJudge(
      "ExactOutputContextJudge",
      explicitJudgeSpy,
    );

    await expect(first.output).toSatisfyJudge(explicitJudge);

    expect(explicitJudgeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        input: "Refund invoice inv_123",
        metadata: {
          expectedStatus: "approved",
          name: "first raw judge context",
        },
        run: first,
      }),
    );
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

  const explicitJudgeSpy = vi.fn(async (opts: RefundJudgeContext) => ({
    score:
      opts.output?.status === "approved" &&
      opts.run.output?.status === "approved" &&
      opts.toolCalls?.[0]?.name === "lookupInvoice"
        ? 1
        : 0,
  }));
  const explicitJudge = createJudge("NormalizedRunJudge", explicitJudgeSpy);

  await expect(run).toSatisfyJudge(explicitJudge, {
    input: "Refund invoice inv_123",
    metadata: {
      expectedStatus: "approved",
      name: "explicit judge",
    },
    harness,
  });

  expect(explicitJudgeSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      input: "Refund invoice inv_123",
      output: {
        status: "approved",
      },
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
      metadata: {
        expectedStatus: "approved",
        name: "explicit judge",
      },
    }),
  );
});

test("automatic judges read per-run params from metadata", async () => {
  const metadataJudgeSpy = vi.fn(async (opts: RefundJudgeContext) => ({
    score: opts.metadata.expectedStatus === "approved" ? 1 : 0,
  }));
  const metadataJudge = createJudge("MetadataJudge", metadataJudgeSpy);

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
    input: "Refund invoice inv_123",
    metadata: {
      expectedStatus: "approved",
      name: "compatibility judge",
    },
    harness,
  });

  expect(metadataJudgeSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      metadata: {
        expectedStatus: "approved",
        name: "compatibility judge",
      },
    }),
  );
});

test("toSatisfyJudge accepts explicit harness context for raw values", async () => {
  const explicitJudgeSpy = vi.fn(
    async ({
      harness: configuredHarness,
      input,
      metadata,
      output,
    }: RefundJudgeContext) => {
      return {
        score:
          configuredHarness === harness &&
          input === "Refund invoice inv_123" &&
          output?.status === "approved" &&
          metadata.expectedStatus === "approved"
            ? 1
            : 0,
      };
    },
  );
  const explicitJudge = createJudge("RawHarnessContextJudge", explicitJudgeSpy);

  await expect({
    status: "approved",
  }).toSatisfyJudge(explicitJudge, {
    input: "Refund invoice inv_123",
    metadata: {
      expectedStatus: "approved",
      name: "raw value with explicit harness context",
    },
    harness,
  });

  expect(explicitJudgeSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      harness,
      input: "Refund invoice inv_123",
      output: {
        status: "approved",
      },
      metadata: {
        expectedStatus: "approved",
        name: "raw value with explicit harness context",
      },
    }),
  );
});

test("toSatisfyJudge uses plain input to seed synthetic sessions", async () => {
  const sessionJudgeSpy = vi.fn(async (opts: JudgeContext) => ({
    score:
      opts.session.messages[0]?.content === "Refund invoice inv_123" ? 1 : 0,
  }));
  const sessionJudge = createJudge("SyntheticSessionJudge", sessionJudgeSpy);

  await expect({
    status: "approved",
  }).toSatisfyJudge(sessionJudge, {
    input: "Refund invoice inv_123",
  });

  expect(sessionJudgeSpy).toHaveBeenCalledWith(
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
  type RawRefundOutput = {
    status: string;
    refundId: string;
  };
  const outputJudgeSpy = vi.fn(
    async (opts: JudgeContext<string, RawRefundOutput>) => ({
      score: opts.output?.status === "approved" ? 1 : 0,
    }),
  );
  const outputJudge = createJudge("RawOutputJudge", outputJudgeSpy);

  await expect({
    status: "approved",
    refundId: "rf_inv_123",
  }).toSatisfyJudge(outputJudge, {
    input: "Refund invoice inv_123",
  });

  expect(outputJudgeSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      input: "Refund invoice inv_123",
      output: {
        status: "approved",
        refundId: "rf_inv_123",
      },
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

test("toSatisfyJudge preserves structured harness output when text is also present", async () => {
  const outputJudgeSpy = vi.fn(
    async (opts: JudgeContext<unknown, RefundOutput>) => ({
      score: opts.output?.status === "approved" ? 1 : 0,
    }),
  );
  const outputJudge = createJudge(
    "StructuredHarnessOutputJudge",
    outputJudgeSpy,
  );

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

  expect(outputJudgeSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      output: {
        status: "approved",
      },
    }),
  );
});

test("toSatisfyJudge preserves structured harness output when text is blank", async () => {
  type RawRefundOutput = {
    status: string;
    refundId: string;
  };
  const outputJudgeSpy = vi.fn(
    async (opts: JudgeContext<unknown, RawRefundOutput>) => ({
      score: opts.output?.refundId === "rf_inv_123" ? 1 : 0,
    }),
  );
  const outputJudge = createJudge(
    "BlankTextStructuredOutputJudge",
    outputJudgeSpy,
  );

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

  expect(outputJudgeSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      output: {
        status: "approved",
        refundId: "rf_inv_123",
      },
    }),
  );
});

test("toSatisfyJudge ignores empty outputText on normalized sessions", async () => {
  const outputJudgeSpy = vi.fn(async (opts: JudgeContext) => ({
    score: opts.output === "approved" ? 1 : 0,
  }));
  const outputJudge = createJudge(
    "NormalizedSessionOutputJudge",
    outputJudgeSpy,
  );

  await expect({
    messages: [
      {
        role: "assistant",
        content: "approved",
      },
    ],
    outputText: "",
  } satisfies NormalizedSession).toSatisfyJudge(outputJudge);

  expect(outputJudgeSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      output: "approved",
    }),
  );
});

test("toSatisfyJudge accepts a null threshold to record without failing", async () => {
  const outputJudgeSpy = vi.fn(async () => ({
    score: 0,
  }));
  const outputJudge = createJudge("RecordOnlyJudge", outputJudgeSpy);

  await expect({
    status: "denied",
  }).toSatisfyJudge(outputJudge, {
    input: "Refund invoice inv_404",
    threshold: null,
  });

  expect(outputJudgeSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      input: "Refund invoice inv_404",
    }),
  );
});

test("createJudge assigns a stable custom name", async () => {
  const judge = createJudge("RefundJudge", async () => ({
    score: 1,
  }));

  expect(judge.name).toBe("RefundJudge");
  await expect({
    status: "approved",
  }).toSatisfyJudge(judge);
});

test("ToolCallJudge accepts string expected tools", async () => {
  const judge = ToolCallJudge();

  const result = await judge.assess({
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
    metadata: {},
    run: {
      session: {
        messages: [],
      },
      usage: {},
      errors: [],
    },
    session: {
      messages: [],
    },
    harness: undefined,
  });

  expect(result.score).toBe(1);
});

test("StructuredOutputJudge reads expected fields from metadata", async () => {
  const judge = StructuredOutputJudge();

  const result = await judge.assess({
    input: "Refund invoice inv_123",
    output: '{"status":"approved","reason":"invoice refunded"}',
    toolCalls: [],
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
    session: {
      messages: [],
    },
    metadata: {
      expected: {
        status: "approved",
      },
    },
    harness: undefined,
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
