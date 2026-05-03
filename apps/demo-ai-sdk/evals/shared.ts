import { anthropic } from "@ai-sdk/anthropic";
import { aiSdkHarness, type AiSdkToolset } from "@vitest-evals/harness-ai-sdk";
import { generateText, stepCountIs } from "ai";
import { expect } from "vitest";
import { type HarnessRun, toolCalls } from "vitest-evals";
import { z } from "zod";

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
  expectedStatus: RefundDecision["status"];
  expectedTools: string[];
};

const REFUND_SYSTEM_PROMPT = [
  "You are the demo refund operations agent.",
  "You must decide whether a refund should be approved for the invoice in the user's request.",
  "Always call lookupInvoice before making a decision.",
  "If the invoice is refundable, call createRefund with the full invoice amount.",
  "If the invoice is not refundable, do not call createRefund.",
  "Return JSON only and do not wrap it in markdown.",
  'Approved shape: {"status":"approved","invoiceId":"...","refundId":"...","amount":4200}',
  'Denied shape: {"status":"denied","invoiceId":"...","reason":"..."}',
].join("\n");

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

async function lookupInvoice({
  invoiceId,
}: {
  invoiceId: string;
}): Promise<InvoiceRecord> {
  const invoice = INVOICES[invoiceId];
  if (!invoice) {
    throw new Error(`Invoice ${invoiceId} not found`);
  }

  return invoice;
}

async function createRefund({
  invoiceId,
  amount,
}: {
  invoiceId: string;
  amount: number;
}): Promise<{
  refundId: string;
  amount: number;
  status: "submitted";
}> {
  return {
    refundId: `rf_${invoiceId}`,
    amount,
    status: "submitted",
  };
}

const refundTools = {
  lookupInvoice: {
    description: "Look up invoice details inside demo billing.",
    replay: true,
    inputSchema: z.object({
      invoiceId: z
        .string()
        .describe("The invoice id to inspect, such as inv_123."),
    }),
    execute: lookupInvoice,
  },
  createRefund: {
    description: "Create a refund for a refundable invoice.",
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
  expect(run.usage.provider).toContain("anthropic");
  expect(run.usage.model).toContain("claude");
  expect(run.usage.totalTokens).toBeGreaterThan(0);
}

function parseRefundDecision(text: string): RefundDecision {
  const cleaned = stripMarkdownFence(text);
  const jsonText = extractJsonObjectText(cleaned);
  const parsed = JSON.parse(jsonText) as Record<string, unknown>;

  if (
    parsed.status === "approved" &&
    typeof parsed.invoiceId === "string" &&
    typeof parsed.refundId === "string" &&
    typeof parsed.amount === "number"
  ) {
    return {
      status: "approved",
      invoiceId: parsed.invoiceId,
      refundId: parsed.refundId,
      amount: parsed.amount,
    };
  }

  if (
    parsed.status === "denied" &&
    typeof parsed.invoiceId === "string" &&
    typeof parsed.reason === "string"
  ) {
    return {
      status: "denied",
      invoiceId: parsed.invoiceId,
      reason: parsed.reason,
    };
  }

  throw new Error(`Refund agent returned an invalid decision payload: ${text}`);
}

function stripMarkdownFence(text: string) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```") || !trimmed.endsWith("```")) {
    return trimmed;
  }

  const firstNewline = trimmed.indexOf("\n");
  if (firstNewline === -1) {
    return trimmed;
  }

  const fenceHeader = trimmed.slice(3, firstNewline).trim().toLowerCase();
  if (fenceHeader !== "" && fenceHeader !== "json") {
    return trimmed;
  }

  return trimmed.slice(firstNewline + 1, -3).trim();
}

function extractJsonObjectText(text: string) {
  const start = text.indexOf("{");
  if (start === -1) {
    return text;
  }

  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (char === "\\") {
        isEscaped = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char !== "}") {
      continue;
    }

    depth -= 1;
    if (depth === 0) {
      return text.slice(start, index + 1);
    }
  }

  return text;
}
