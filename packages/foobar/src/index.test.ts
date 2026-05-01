import { describe, expect, test } from "vitest";
import { parseRefundDecision } from "./index";

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
