import { anthropic } from "@ai-sdk/anthropic";
import {
  CREATE_REFUND_DESCRIPTION,
  LOOKUP_INVOICE_DESCRIPTION,
  REFUND_SYSTEM_PROMPT,
  createRefund,
  lookupInvoice,
  parseRefundDecision,
  type RefundCase,
} from "@demo/foobar";
import {
  aiSdkHarness,
  type AiSdkRuntimeToolset,
  type AiSdkToolset,
} from "@vitest-evals/harness-ai-sdk";
import { generateText, stepCountIs } from "ai";
import { z } from "zod";
import { ToolCallJudge, type HarnessJudgeOptions } from "vitest-evals";

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

async function runRefundAgent(
  input: string,
  tools: AiSdkRuntimeToolset<typeof refundTools>,
) {
  return generateText({
    model: anthropic("claude-sonnet-4-5"),
    system: REFUND_SYSTEM_PROMPT,
    prompt: input,
    tools,
    stopWhen: stepCountIs(5),
    temperature: 0,
  });
}

export const refundHarness = aiSdkHarness({
  tools: refundTools,
  run: async ({ input, tools }) => {
    if (!tools) {
      throw new Error("refund tools were not configured");
    }

    return runRefundAgent(input, tools);
  },
  output: ({ result }) => parseRefundDecision(result.text),
});

const toolCallJudge = ToolCallJudge();

export const expectedToolJudge = async (
  opts: HarnessJudgeOptions<RefundCase>,
) =>
  toolCallJudge({
    ...opts,
    expectedTools: (opts.expectedTools as string[]).map((name) => ({
      name,
    })),
  });

Object.defineProperty(expectedToolJudge, "name", {
  value: "ToolCallJudge",
});
