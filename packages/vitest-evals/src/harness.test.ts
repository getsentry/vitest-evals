import { beforeEach, expect, vi } from "vitest";
import {
  describeEval,
  toolCalls,
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
  data: async () => [
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
