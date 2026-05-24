import { flueHarness } from "@vitest-evals/harness-flue";
import { Type } from "@flue/runtime";
import * as v from "valibot";
import { expect } from "vitest";
import { type HarnessRun, toolCalls } from "vitest-evals";
import type { ToolDef } from "@flue/runtime";

type InvoiceRecord = {
  invoiceId: string;
  amount: number;
  refundable: boolean;
  customer: string;
};

type RefundDecision =
  | {
      status: "approved";
      invoiceId: string;
      refundId: string;
      amount: number;
    }
  | {
      status: "denied";
      invoiceId: string;
      reason: string;
    };

export type RefundCase = {
  input: string;
  expected?: unknown;
  expectedStatus: RefundDecision["status"];
  expectedTools: string[];
};

export const REFUND_MODEL = "anthropic/claude-sonnet-4-6";

const INVOICES: Record<string, InvoiceRecord> = {
  inv_123: {
    invoiceId: "inv_123",
    amount: 4200,
    refundable: true,
    customer: "Acme Co",
  },
  inv_404: {
    invoiceId: "inv_404",
    amount: 1700,
    refundable: false,
    customer: "Globex",
  },
};

const refundTools: ToolDef[] = [
  {
    name: "lookupInvoice",
    description: "Look up invoice details inside demo billing.",
    parameters: Type.Object({
      invoiceId: Type.String({ description: "The invoice id to inspect." }),
    }),
    execute: async (args) => {
      const invoice = INVOICES[args.invoiceId as string];
      if (!invoice) throw new Error(`Invoice ${args.invoiceId} not found`);
      return JSON.stringify(invoice);
    },
  },
  {
    name: "createRefund",
    description: "Create a refund for a refundable invoice.",
    parameters: Type.Object({
      invoiceId: Type.String({ description: "The invoice id to refund." }),
      amount: Type.Number({ description: "The amount to refund in cents." }),
    }),
    execute: async (args) => {
      return JSON.stringify({
        refundId: `rf_${args.invoiceId}`,
        amount: args.amount,
        status: "submitted",
      });
    },
  },
];

const refundResultSchema = v.object({
  status: v.picklist(["approved", "denied"]),
  invoiceId: v.string(),
  refundId: v.optional(v.string()),
  amount: v.optional(v.number()),
  reason: v.optional(v.string()),
});

export const refundHarness = flueHarness<string, RefundDecision>({
  name: "flue-refund-agent",
  model: REFUND_MODEL,
  tools: refundTools,
  run: async (input, session, { signal }) => {
    return await session.prompt(
      [
        "You are the demo refund operations agent.",
        "You must decide whether a refund should be approved for the invoice in the user's request.",
        "Always call lookupInvoice before making a decision.",
        "If the invoice is refundable, call createRefund with the full invoice amount.",
        "If the invoice is not refundable, do not call createRefund.",
        "",
        input,
      ].join("\n"),
      {
        result: refundResultSchema,
        signal,
      },
    );
  },
  output: (response) => {
    if ("data" in response) return response.data as RefundDecision;
    throw new Error("Expected structured result from Flue agent");
  },
});

export async function assertRefundCase(
  run: HarnessRun,
  expected: Pick<RefundCase, "expectedStatus" | "expectedTools">,
) {
  expect(run.output).toMatchObject({
    status: expected.expectedStatus,
  });
  expect(toolCalls(run.session).map((call) => call.name)).toEqual(
    expected.expectedTools,
  );
  expect(run.usage.provider).toBe("anthropic");
  expect(run.usage.model).toContain("claude");
  expect(run.usage.totalTokens).toBeGreaterThan(0);
}
