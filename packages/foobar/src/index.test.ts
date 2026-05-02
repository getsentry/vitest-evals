import { describe, expect, test, vi } from "vitest";
import {
  createRefund,
  createRefundAgent,
  lookupInvoice,
  parseRefundDecision,
} from "./index";

describe("parseRefundDecision", () => {
  test("parses plain approved JSON", () => {
    expect(
      parseRefundDecision(
        '{"status":"approved","invoiceId":"inv_123","refundId":"rf_inv_123","amount":4200}',
      ),
    ).toEqual({
      status: "approved",
      invoiceId: "inv_123",
      refundId: "rf_inv_123",
      amount: 4200,
    });
  });

  test("parses fenced denied JSON", () => {
    expect(
      parseRefundDecision(
        [
          "```json",
          '{"status":"denied","invoiceId":"inv_404","reason":"not refundable"}',
          "```",
        ].join("\n"),
      ),
    ).toEqual({
      status: "denied",
      invoiceId: "inv_404",
      reason: "not refundable",
    });
  });

  test("parses JSON embedded in surrounding text", () => {
    expect(
      parseRefundDecision(
        [
          "Here is the decision:",
          '{"status":"denied","invoiceId":"inv_404","reason":"not refundable"}',
        ].join("\n"),
      ),
    ).toEqual({
      status: "denied",
      invoiceId: "inv_404",
      reason: "not refundable",
    });
  });

  test("parses embedded JSON with braces inside string values", () => {
    expect(
      parseRefundDecision(
        [
          "Decision payload:",
          '{"status":"denied","invoiceId":"inv_404","reason":"saw literal {brace} text"}',
          "Thanks.",
        ].join("\n"),
      ),
    ).toEqual({
      status: "denied",
      invoiceId: "inv_404",
      reason: "saw literal {brace} text",
    });
  });
});

test("createRefundAgent awaits async reset before prompting", async () => {
  const refundAgent = createRefundAgent();
  const agent = (refundAgent as unknown as { agent: Record<string, unknown> })
    .agent as {
    reset: () => Promise<void>;
    prompt: (input: string) => Promise<void>;
    state: Record<string, unknown>;
  };

  let finishReset: (() => void) | undefined;
  agent.reset = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finishReset = () => resolve();
      }),
  );
  agent.prompt = vi.fn(async () => {
    agent.state.messages = [
      {
        role: "assistant",
        stopReason: "stop",
        errorMessage: "",
        provider: "anthropic",
        model: "claude-sonnet-4-5",
        usage: {
          input: 10,
          output: 4,
          totalTokens: 14,
        },
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "approved",
              invoiceId: "inv_123",
              refundId: "rf_inv_123",
              amount: 4200,
            }),
          },
        ],
      },
    ];
  });

  const runtime = {
    tools: {
      lookupInvoice,
      createRefund,
    },
    events: {
      assistant: vi.fn(),
      tool: vi.fn(),
    },
  };

  const runPromise = refundAgent.run(
    "Refund invoice inv_123",
    runtime as never,
  );

  await Promise.resolve();
  expect(agent.prompt).not.toHaveBeenCalled();

  finishReset?.();
  const result = await runPromise;

  expect(agent.reset).toHaveBeenCalledTimes(1);
  expect(agent.prompt).toHaveBeenCalledWith("Refund invoice inv_123");
  expect(runtime.events.assistant).toHaveBeenCalledWith(
    '{"status":"approved","invoiceId":"inv_123","refundId":"rf_inv_123","amount":4200}',
    {
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      totalTokens: 14,
    },
  );
  expect(result.decision).toEqual({
    status: "approved",
    invoiceId: "inv_123",
    refundId: "rf_inv_123",
    amount: 4200,
  });
});
