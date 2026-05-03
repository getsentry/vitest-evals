import { anthropic } from "@ai-sdk/anthropic";
import {
  CREATE_REFUND_DESCRIPTION,
  LOOKUP_INVOICE_DESCRIPTION,
  REFUND_SYSTEM_PROMPT,
  createRefund,
  lookupInvoice,
  parseRefundDecision,
  type RefundCase,
} from "@demo/refund-agent";
import { aiSdkHarness, type AiSdkToolset } from "@vitest-evals/harness-ai-sdk";
import { generateText, stepCountIs } from "ai";
import { z } from "zod";

const refundTools = {
  lookupInvoice: {
    description: LOOKUP_INVOICE_DESCRIPTION,
    replay: true,
    inputSchema: z.object({
      invoiceId: z
        .string()
        .describe("The invoice id to inspect, such as inv_123."),
    }),
    execute: lookupInvoice,
  },
  createRefund: {
    description: CREATE_REFUND_DESCRIPTION,
    inputSchema: z.object({
      invoiceId: z.string().describe("The invoice id that should be refunded."),
      amount: z.number().describe("The amount to refund in cents."),
    }),
    execute: createRefund,
  },
} satisfies AiSdkToolset<string, RefundCase>;

export const refundHarness = aiSdkHarness({
  tools: refundTools,
  task: async ({ input, runtime }) =>
    generateText({
      model: anthropic("claude-sonnet-4-5"),
      system: REFUND_SYSTEM_PROMPT,
      prompt: input,
      tools: runtime.tools,
      stopWhen: stepCountIs(5),
      temperature: 0,
    }),
  output: ({ result }) => parseRefundDecision(result.text),
});
