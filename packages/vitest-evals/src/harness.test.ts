import { beforeEach, expect, test, vi } from "vitest";
import {
  assistantMessages,
  createJudge,
  createJudgeHarness,
  createHarness,
  createToolCallSpans,
  describeEval,
  failedSpans,
  type GenAiSemanticAttributeKey,
  getHarnessRunFromError,
  type JudgeContext,
  type JudgeAssertionOptions,
  type JudgeOptions,
  type JudgeAssessorOptions,
  type JudgeHarness,
  type NormalizedSpanAttributes,
  normalizeSpanError,
  StructuredOutputJudge,
  spans,
  spansByKind,
  ToolCallJudge,
  toJsonValue,
  toolCalls,
  toolMessages,
  userMessages,
  type Harness,
  type HarnessContext,
  type HarnessRun,
  type JsonValue,
  type NormalizedSession,
  type SimpleHarnessResult,
} from "./index";

type RefundEvalMetadata = {
  name: string;
  expectedStatus: string;
};

type RefundOutput = {
  status: string;
};

type RefundHarness = Harness<string, RefundOutput, RefundEvalMetadata>;

type RefundJudgeContext = JudgeContext<
  string,
  RefundOutput,
  RefundEvalMetadata,
  RefundHarness
>;

type Equal<TActual, TExpected> = (<T>() => T extends TActual ? 1 : 2) extends <
  T,
>() => T extends TExpected ? 1 : 2
  ? true
  : false;
type Expect<T extends true> = T;
type _HarnessRunRequiresTypedOutput = Expect<
  Equal<HarnessRun<RefundOutput>["output"], RefundOutput>
>;
type _SimpleHarnessResultRequiresTypedOutput = Expect<
  Equal<SimpleHarnessResult<RefundOutput>["output"], RefundOutput>
>;
type _JudgeContextUsesTypedOutput = Expect<
  Equal<RefundJudgeContext["output"], RefundOutput>
>;
type _UntypedHarnessRunAllowsMissingOutput = Expect<
  Equal<HarnessRun["output"], JsonValue | undefined>
>;
const validSemanticAttributes = {
  "gen_ai.operation.name": "chat",
  "gen_ai.provider.name": "openai",
  "gen_ai.request.stream": true,
  "gen_ai.usage.input_tokens": 100,
  "custom.provider.payload": {
    ok: true,
  },
} satisfies NormalizedSpanAttributes;
void validSemanticAttributes;
const invalidSemanticAttributes = {
  // @ts-expect-error GenAI token counts must be numeric.
  "gen_ai.usage.input_tokens": "100",
} satisfies NormalizedSpanAttributes;
void invalidSemanticAttributes;
const genAiAttributeKey =
  "gen_ai.request.model" satisfies GenAiSemanticAttributeKey;
void genAiAttributeKey;
const invalidStringJudgeRunOptions: JudgeAssertionOptions<
  JudgeContext<unknown, string>
> = {
  // @ts-expect-error explicit matcher runs must carry the judge output type.
  run: {} as HarnessRun<RefundOutput>,
};
void invalidStringJudgeRunOptions;

const outputSecondHarness = createHarness<string, RefundOutput>({
  name: "output-second",
  run: async () => ({
    output: {
      status: "approved",
    },
  }),
});
type _CreateHarnessUsesOutputAsSecondGeneric = Expect<
  Equal<
    Awaited<ReturnType<(typeof outputSecondHarness)["run"]>>["output"],
    RefundOutput
  >
>;

const requiredParamJudge = createJudge(
  "RequiredParamJudge",
  async ({
    expectedStatus,
    output,
  }: JudgeOptions<{ expectedStatus: string }, unknown, RefundOutput>) => ({
    score: output.status === expectedStatus ? 1 : 0,
  }),
);

const stringOutputJudge = createJudge(
  "StringOutputJudge",
  async ({ output }: JudgeContext<unknown, string>) => ({
    score: output.length > 0 ? 1 : 0,
  }),
);
const typedJudgeHarness = {} as JudgeHarness;
const requiredParamJudgeWithHarness = {
  ...requiredParamJudge,
  judgeHarness: typedJudgeHarness,
};
const stringOutputJudgeWithHarness = {
  ...stringOutputJudge,
  judgeHarness: typedJudgeHarness,
};
const configObjectJudgeWithHarness = createJudge({
  name: "ConfigObjectJudge",
  judgeHarness: typedJudgeHarness,
  async assess({
    expectedStatus,
    output,
  }: JudgeOptions<{ expectedStatus: string }, unknown, RefundOutput>) {
    return {
      score: output.status === expectedStatus ? 1 : 0,
    };
  },
});

async function assertMatcherTypes(result: HarnessRun<RefundOutput>) {
  await expect(result).toSatisfyJudge(requiredParamJudge, {
    expectedStatus: "approved",
  });

  // @ts-expect-error required custom judge params must be provided explicitly.
  await expect(result).toSatisfyJudge(requiredParamJudge);

  // @ts-expect-error default judge harnesses must not erase required custom params.
  await expect(result).toSatisfyJudge(requiredParamJudgeWithHarness);

  // @ts-expect-error object-form judge harnesses must not erase required custom params.
  await expect(result).toSatisfyJudge(configObjectJudgeWithHarness);

  // @ts-expect-error the matcher output type must satisfy the judge output type.
  await expect(result).toSatisfyJudge(stringOutputJudge);

  // @ts-expect-error default judge harnesses must not erase output constraints.
  await expect(result).toSatisfyJudge(stringOutputJudgeWithHarness);
}

void assertMatcherTypes;

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

const judgeAssessorAssessSpy = vi.fn(
  async (prompt: string, options: JudgeAssessorOptions) => {
    return prompt === "Judge refund request Refund invoice inv_123" &&
      options.signal
      ? "approved"
      : "denied";
  },
);

const boundAssessorJudge = createJudge(
  "BoundAssessorJudge",
  {
    assess: judgeAssessorAssessSpy,
  },
  async (ctx: RefundJudgeContext, assessor) => {
    const verdict = await assessor.assess(`Judge refund request ${ctx.input}`);

    return {
      score: verdict === ctx.output.status ? 1 : 0,
    };
  },
);

beforeEach(() => {
  runSpy.mockClear();
  judgeSpy.mockClear();
  thresholdJudgeSpy.mockClear();
  judgeAssessorAssessSpy.mockClear();
});

describeEval(
  "createHarness",
  {
    harness: createHarness<string, RefundOutput, RefundEvalMetadata>({
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

test("createHarness attaches fallback traces to direct runs", async () => {
  const lightweightHarness = createHarness({
    name: "custom-app",
    run: async () => ({
      output: "approved",
      toolCalls: [
        {
          id: "call_lookup",
          name: "lookupInvoice",
          arguments: {
            invoiceId: "inv_123",
          },
        },
      ],
    }),
  });

  const result = await lightweightHarness.run("Refund invoice inv_123", {
    metadata: {},
    artifacts: {},
    setArtifact: vi.fn(),
  });

  expect(spansByKind(result, "run")).toMatchObject([
    {
      name: "custom-app",
      kind: "run",
      status: "ok",
      attributes: {
        "gen_ai.operation.name": "invoke_workflow",
        "gen_ai.workflow.name": "custom-app",
      },
    },
  ]);
  expect(spansByKind(result, "tool")).toMatchObject([
    {
      id: expect.not.stringMatching(/^call_lookup$/),
      name: "lookupInvoice",
      kind: "tool",
      attributes: {
        "gen_ai.tool.call.id": "call_lookup",
        "gen_ai.tool.name": "lookupInvoice",
      },
    },
  ]);
});

test("createHarness attaches failed runs and traces to thrown errors", async () => {
  const lightweightHarness = createHarness({
    name: "custom-app",
    run: async () => {
      throw new TypeError("agent failed");
    },
  });

  let thrown: unknown;
  try {
    await lightweightHarness.run("Refund invoice inv_123", {
      metadata: {},
      artifacts: {},
      setArtifact: vi.fn(),
    });
  } catch (error) {
    thrown = error;
  }

  const run = getHarnessRunFromError(thrown);
  expect(run).toBeDefined();
  expect(run?.errors).toEqual([
    {
      type: "TypeError",
      message: "agent failed",
    },
  ]);
  expect(failedSpans(run!).map((span) => span.name)).toEqual(["custom-app"]);
});

test("createHarness preserves typed lightweight output values", async () => {
  const output = {
    status: "approved",
  };
  const lightweightHarness = createHarness({
    name: "custom-app",
    run: async () => ({
      output,
    }),
  });

  const result = await lightweightHarness.run("Refund invoice inv_123", {
    metadata: {},
    artifacts: {},
    setArtifact: vi.fn(),
  });

  expect(result.output).toBe(output);
  expect(result.session.messages).toEqual([
    {
      role: "user",
      content: "Refund invoice inv_123",
    },
    {
      role: "assistant",
      content: output,
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

test("createHarness normalizes lightweight traces", async () => {
  const lightweightHarness = createHarness({
    name: "custom-app",
    run: async () => ({
      output: "approved",
      traces: [
        {
          id: "trace_123",
          name: "refund-flow",
          metadata: {
            scenario: "refund",
            ignored: undefined,
          },
          spans: [
            {
              id: "span_1",
              traceId: "trace_123",
              name: "call-model",
              kind: "model" as const,
              status: "ok" as const,
              attributes: {
                "gen_ai.operation.name": "chat",
                "gen_ai.provider.name": "openai",
                "gen_ai.request.model": "gpt-test",
                ignored: undefined,
              },
              events: [
                {
                  name: "first-token",
                  attributes: {
                    "gen_ai.response.time_to_first_chunk": 0.12,
                  },
                },
              ],
            },
            {
              name: "lookupInvoice",
              kind: "tool" as const,
              status: "error" as const,
              error: new TypeError("tool failed"),
            },
          ],
        },
      ],
    }),
  });

  const result = await lightweightHarness.run("Refund invoice inv_123", {
    metadata: {},
    artifacts: {},
    setArtifact: vi.fn(),
  });

  expect(result.traces).toEqual([
    {
      id: "trace_123",
      name: "refund-flow",
      metadata: {
        scenario: "refund",
      },
      spans: [
        {
          id: "span_1",
          traceId: "trace_123",
          name: "call-model",
          kind: "model",
          status: "ok",
          attributes: {
            "gen_ai.operation.name": "chat",
            "gen_ai.provider.name": "openai",
            "gen_ai.request.model": "gpt-test",
          },
          events: [
            {
              name: "first-token",
              attributes: {
                "gen_ai.response.time_to_first_chunk": 0.12,
              },
            },
          ],
        },
        {
          name: "lookupInvoice",
          kind: "tool",
          status: "error",
          error: {
            type: "TypeError",
            message: "tool failed",
          },
        },
      ],
    },
  ]);
  expect(spans(result).map((span) => span.name)).toEqual([
    "call-model",
    "lookupInvoice",
  ]);
  expect(spansByKind(result, "tool")).toHaveLength(1);
  expect(failedSpans(result).map((span) => span.name)).toEqual([
    "lookupInvoice",
  ]);
});

test("span helpers preserve object-shaped errors and internal span ids", () => {
  expect(
    normalizeSpanError({
      type: "ToolError",
      message: "tool failed",
      retryable: false,
    }),
  ).toEqual({
    type: "ToolError",
    message: "tool failed",
    retryable: false,
  });

  expect(
    createToolCallSpans(
      [
        {
          id: "call_lookup",
          name: "lookupInvoice",
        },
      ],
      {
        traceId: "trace_123",
        parentId: "trace_123:run",
        spanIdPrefix: "trace_123:tool",
      },
    ),
  ).toMatchObject([
    {
      id: "trace_123:tool:1",
      traceId: "trace_123",
      parentId: "trace_123:run",
      attributes: {
        "gen_ai.tool.call.id": "call_lookup",
      },
    },
  ]);
});

test("JSON normalization drops non-finite numbers and circular references", () => {
  const cyclic: Record<string, unknown> = {
    ok: true,
  };
  cyclic.self = cyclic;

  expect(
    toJsonValue({
      finite: 1,
      infinite: Number.POSITIVE_INFINITY,
      cyclic,
      list: [Number.NaN, cyclic],
    }),
  ).toEqual({
    finite: 1,
    cyclic: {
      ok: true,
    },
    list: [
      null,
      {
        ok: true,
      },
    ],
  });
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
    expect(spansByKind(result, "run")).toMatchObject([
      {
        name: "pi-ai",
        kind: "run",
        status: "ok",
        attributes: {
          "gen_ai.workflow.name": "pi-ai",
        },
      },
    ]);
    expect(spansByKind(result, "tool")).toMatchObject([
      {
        name: "lookupInvoice",
        kind: "tool",
        status: "ok",
        attributes: {
          "gen_ai.operation.name": "execute_tool",
          "gen_ai.tool.name": "lookupInvoice",
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
  "harness mode with bound judge assessor",
  {
    harness,
    judges: [boundAssessorJudge],
  },
  (it) => {
    it("curries run-scoped options into judge assessor calls", async ({
      run,
    }) => {
      await run("Refund invoice inv_123", {
        metadata: {
          name: "refund request with bound judge harness",
          expectedStatus: "approved",
        },
      });

      expect(judgeAssessorAssessSpy).toHaveBeenCalledWith(
        "Judge refund request Refund invoice inv_123",
        {
          signal: expect.any(AbortSignal),
        },
      );
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
  it("curries run-scoped options into explicit judge assessor calls", async ({
    run,
  }) => {
    const result = await run("Refund invoice inv_123", {
      metadata: {
        name: "refund request with explicit bound judge harness",
        expectedStatus: "approved",
      },
    });

    await expect(result).toSatisfyJudge(boundAssessorJudge);

    expect(judgeAssessorAssessSpy).toHaveBeenCalledWith(
      "Judge refund request Refund invoice inv_123",
      {
        signal: expect.any(AbortSignal),
      },
    );
  });

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
        opts.output.status === "approved" &&
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
            output.status === "approved" &&
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
    it("records failed harness metadata for a later plain error", async ({
      run,
      task,
    }) => {
      await run("Refund invoice inv_123");
      await expect(run("Refund invoice inv_404")).rejects.toThrow(
        "plain harness failure",
      );

      expect(task.meta.harness).toMatchObject({
        name: "flaky-harness",
        run: {
          session: {
            messages: [
              {
                role: "user",
                content: "Refund invoice inv_404",
              },
            ],
          },
          usage: {},
          errors: [
            {
              type: "Error",
              message: "plain harness failure",
            },
          ],
          traces: [
            {
              name: "flaky-harness",
              spans: [
                {
                  name: "flaky-harness",
                  kind: "run",
                  status: "error",
                  attributes: {
                    "gen_ai.workflow.name": "flaky-harness",
                  },
                },
              ],
            },
          ],
        },
      });
    });
  },
);

test("toSatisfyJudge reuses normalized harness run data", async () => {
  const run = await harness.run("Refund invoice inv_123", {
    metadata: {
      expectedStatus: "approved",
      name: "explicit judge",
    },
    artifacts: {},
    setArtifact: vi.fn(),
  });

  const explicitJudgeSpy = vi.fn(async (opts: RefundJudgeContext) => ({
    score:
      opts.output.status === "approved" &&
      opts.run.output.status === "approved" &&
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
          output.status === "approved" &&
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
      score: opts.output.status === "approved" ? 1 : 0,
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

test("toSatisfyJudge reports structured output on failures", async () => {
  const failingJudge = createJudge(
    "StructuredFailureJudge",
    async (_opts: JudgeContext<unknown, RefundOutput>) => ({
      score: 0,
      metadata: {
        rationale: "not approved",
      },
    }),
  );

  let thrown: Error | undefined;
  try {
    await expect({
      status: "denied",
      refundId: "rf_inv_123",
    }).toSatisfyJudge(failingJudge);
  } catch (error) {
    thrown = error as Error;
  }

  expect(thrown?.message).toContain('"status": "denied"');
  expect(thrown?.message).toContain('"refundId": "rf_inv_123"');
});

test("toSatisfyJudge preserves structured harness output when text is also present", async () => {
  const outputJudgeSpy = vi.fn(
    async (opts: JudgeContext<unknown, RefundOutput>) => ({
      score: opts.output.status === "approved" ? 1 : 0,
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
      score: opts.output.refundId === "rf_inv_123" ? 1 : 0,
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
          content: "   ",
        },
      ],
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

test("toSatisfyJudge uses assistant message content on normalized sessions", async () => {
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
  } satisfies NormalizedSession).toSatisfyJudge(outputJudge);

  expect(outputJudgeSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      output: "approved",
    }),
  );
});

test("toSatisfyJudge skips whitespace-only assistant content on normalized sessions", async () => {
  const outputJudgeSpy = vi.fn(async (opts: JudgeContext) => ({
    score: opts.output === "approved" ? 1 : 0,
  }));
  const outputJudge = createJudge(
    "NormalizedSessionWhitespaceOutputJudge",
    outputJudgeSpy,
  );

  await expect({
    messages: [
      {
        role: "assistant",
        content: "approved",
      },
      {
        role: "assistant",
        content: "   ",
      },
    ],
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

test("createJudge accepts a default judge harness in object form", async () => {
  const judgeHarnessRun = vi.fn(async () => "approved");
  const judgeHarness = createJudgeHarness({
    name: "object-form-judge-harness",
    run: judgeHarnessRun,
  });
  const judge = createJudge({
    name: "ObjectFormJudge",
    judgeHarness,
    async assess(ctx: JudgeContext<unknown, RefundOutput>) {
      const verdict = await ctx.runJudge?.({
        prompt: `Judge refund status ${ctx.output.status}`,
      });

      return {
        score: verdict === ctx.output.status ? 1 : 0,
      };
    },
  });

  await expect({
    status: "approved",
  }).toSatisfyJudge(judge);

  expect(judge.name).toBe("ObjectFormJudge");
  expect(judgeHarnessRun).toHaveBeenCalledWith(
    expect.objectContaining({
      prompt: "Judge refund status approved",
    }),
    expect.any(Object),
  );
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
