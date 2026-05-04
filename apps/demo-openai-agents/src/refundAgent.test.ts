import { describe, expect, test } from "vitest";
import {
  createRefund,
  createRefundAgent,
  createRefundRunner,
  lookupInvoice,
  parseRefundDecision,
  resolveResultText,
} from "./refundAgent";

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

test("demo billing tools are deterministic", async () => {
  await expect(lookupInvoice({ invoiceId: "inv_123" })).resolves.toEqual({
    invoiceId: "inv_123",
    amount: 4200,
    refundable: true,
    customer: "Acme Co",
  });
  await expect(
    createRefund({ invoiceId: "inv_123", amount: 4200 }),
  ).resolves.toEqual({
    refundId: "rf_inv_123",
    amount: 4200,
    status: "submitted",
  });
});

test("createRefundAgent wires OpenAI Agents tools", () => {
  const agent = createRefundAgent();

  expect(agent.name).toBe("demo_refund_agent");
  expect(agent.tools.map((tool) => tool.name)).toEqual([
    "lookupInvoice",
    "createRefund",
  ]);
});

test("createRefundRunner disables tracing for demo eval runs", () => {
  expect(createRefundRunner().config.tracingDisabled).toBe(true);
});

test("resolveResultText reads OpenAI Agents final output", () => {
  expect(
    resolveResultText({
      finalOutput: '{"status":"denied","invoiceId":"inv_404","reason":"no"}',
    }),
  ).toBe('{"status":"denied","invoiceId":"inv_404","reason":"no"}');
});
