import { beforeEach, expect, test, vi } from "vitest";
import {
  assistantMessages,
  describeEval,
  namedJudge,
  ToolCallJudge,
  toolCalls,
  toolMessages,
  userMessages,
  type Harness,
  type HarnessJudgeOptions,
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

const judgeSpy = vi.fn(async (opts: HarnessJudgeOptions<RefundEvalCase>) => ({
  score: opts.expectedStatus === "approved" ? 1 : 0,
}));

beforeEach(() => {
  runSpy.mockClear();
  judgeSpy.mockClear();
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

describeEval("harness mode with bound judge helper", {
  data: [
    {
      name: "refund request with explicit judge helper",
      input: "Refund invoice inv_123",
      expectedStatus: "approved",
    },
  ],
  harness,
  test: async ({ judge }) => {
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

    await judge(explicitJudge);

    expect(explicitJudge).toHaveBeenCalledWith(
      expect.objectContaining({
        input: "Refund invoice inv_123",
        rawInput: "Refund invoice inv_123",
        output: '{"status":"approved"}',
        assistantOutput: "approved",
        caseData: {
          input: "Refund invoice inv_123",
          expectedStatus: "approved",
          name: "refund request with explicit judge helper",
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
        run: expect.objectContaining({
          output: {
            status: "approved",
          },
        }),
      }),
    );
  },
});

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
