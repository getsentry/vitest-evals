import { Agent, Runner, tool } from "@openai/agents";
import type { HarnessPromptOptions } from "vitest-evals";
import { z } from "zod";

export type InvoiceRecord = {
  invoiceId: string;
  amount: number;
  refundable: boolean;
  customer: string;
};

export type RefundDecision =
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

export type RefundEvalMetadata = {
  name?: string;
  expectedStatus: RefundDecision["status"];
  expectedTools: string[];
};

export type RefundCase = RefundEvalMetadata & {
  input: string;
};

export type LookupInvoiceInput = {
  invoiceId: string;
};

export type CreateRefundInput = {
  invoiceId: string;
  amount: number;
};

export const LOOKUP_INVOICE_DESCRIPTION =
  "Look up invoice details inside demo billing.";
export const CREATE_REFUND_DESCRIPTION =
  "Create a refund for a refundable invoice.";
export const DEFAULT_REFUND_MODEL = "gpt-4.1-mini";
export const REFUND_SYSTEM_PROMPT = [
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

/** Looks up a demo invoice record for the OpenAI Agents local function tool. */
export async function lookupInvoice({
  invoiceId,
}: LookupInvoiceInput): Promise<InvoiceRecord> {
  const invoice = INVOICES[invoiceId];
  if (!invoice) {
    throw new Error(`Invoice ${invoiceId} not found`);
  }

  return invoice;
}

/** Creates a deterministic demo refund record. */
export async function createRefund({
  invoiceId,
  amount,
}: CreateRefundInput): Promise<{
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

function createRefundTools() {
  const lookupInvoiceTool = tool({
    name: "lookupInvoice",
    description: LOOKUP_INVOICE_DESCRIPTION,
    parameters: z.object({
      invoiceId: z
        .string()
        .describe("The invoice id to inspect, such as inv_123."),
    }),
    execute: lookupInvoice,
  });

  const createRefundTool = tool({
    name: "createRefund",
    description: CREATE_REFUND_DESCRIPTION,
    parameters: z.object({
      invoiceId: z.string().describe("The invoice id that should be refunded."),
      amount: z.number().describe("The amount to refund in cents."),
    }),
    execute: createRefund,
  });

  return [lookupInvoiceTool, createRefundTool];
}

/** Creates a fresh OpenAI Agents refund agent for one eval run. */
export function createRefundAgent(options?: { model?: string }) {
  return new Agent({
    name: "demo_refund_agent",
    instructions: REFUND_SYSTEM_PROMPT,
    model: options?.model ?? DEFAULT_REFUND_MODEL,
    modelSettings: {
      temperature: 0,
    },
    tools: createRefundTools(),
  });
}

/** Creates the OpenAI Agents runner used by the demo harness. */
export function createRefundRunner() {
  return new Runner({
    tracingDisabled: true,
    modelSettings: {
      temperature: 0,
    },
  });
}

/** Uses the same OpenAI Agents stack as a provider-agnostic judge prompt seam. */
export async function promptRefundModel(
  input: string,
  options?: HarnessPromptOptions,
) {
  const runner = createRefundRunner();
  const agent = new Agent({
    name: "demo_refund_prompt",
    instructions: options?.system ?? "Return a concise answer.",
    model: DEFAULT_REFUND_MODEL,
    modelSettings: {
      temperature: 0,
    },
  });
  const result = await runner.run(agent, input, {
    maxTurns: 2,
  });
  const outputText = resolveResultText(result);

  if (!outputText) {
    throw new Error("Prompt model returned an empty response.");
  }

  return outputText;
}

/** Parses the demo agent's final JSON payload into a typed refund decision. */
export function parseRefundDecision(text: string): RefundDecision {
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

/** Extracts text from an OpenAI Agents run result for app output mapping. */
export function resolveResultText(result: unknown) {
  if (!result || typeof result !== "object") {
    return typeof result === "string" ? result : "";
  }

  const finalOutput = (result as { finalOutput?: unknown }).finalOutput;
  if (typeof finalOutput === "string") {
    return finalOutput.trim();
  }

  const output = (result as { output?: unknown }).output;
  if (typeof output === "string") {
    return output.trim();
  }

  return finalOutput === undefined ? "" : JSON.stringify(finalOutput);
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
