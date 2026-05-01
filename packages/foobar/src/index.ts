import { Agent, type AgentTool } from "@mariozechner/pi-agent-core";
import { Type, getModel, type Static } from "@mariozechner/pi-ai";

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

export type RefundCase = {
  name?: string;
  input: string;
  expectedStatus: RefundDecision["status"];
  expectedTools: string[];
  expected?: Record<string, unknown>;
};

export type LookupInvoiceInput = {
  invoiceId: string;
};

export type CreateRefundInput = {
  invoiceId: string;
  amount: number;
};

export const LOOKUP_INVOICE_DESCRIPTION =
  "Look up invoice details inside Foobar billing.";
export const CREATE_REFUND_DESCRIPTION =
  "Create a refund for a refundable invoice.";
type FoobarRefundModel = "claude-sonnet-4-5";
const DEFAULT_REFUND_MODEL: FoobarRefundModel = "claude-sonnet-4-5";
export const REFUND_SYSTEM_PROMPT = [
  "You are Foobar's refund operations agent.",
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

export async function lookupInvoice({
  invoiceId,
}: LookupInvoiceInput): Promise<InvoiceRecord> {
  const invoice = INVOICES[invoiceId];
  if (!invoice) {
    throw new Error(`Invoice ${invoiceId} not found`);
  }

  return invoice;
}

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

const lookupInvoiceParameters = Type.Object({
  invoiceId: Type.String({
    description: "The invoice id to inspect, such as inv_123.",
  }),
});

const createRefundParameters = Type.Object({
  invoiceId: Type.String({
    description: "The invoice id that should be refunded.",
  }),
  amount: Type.Number({
    description: "The amount to refund in cents.",
  }),
});

type LookupInvoiceArgs = Static<typeof lookupInvoiceParameters>;
type CreateRefundArgs = Static<typeof createRefundParameters>;
type ReplayableAgentTool = AgentTool<any, any> & {
  replay?: boolean;
};

export const foobarTools: ReplayableAgentTool[] = [
  {
    name: "lookupInvoice",
    label: "Lookup Invoice",
    description: LOOKUP_INVOICE_DESCRIPTION,
    parameters: lookupInvoiceParameters,
    replay: true,
    execute: async (_toolCallId: string, args: LookupInvoiceArgs) => {
      const invoice = await lookupInvoice({
        invoiceId: args.invoiceId,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(invoice) }],
        details: invoice,
      };
    },
  },
  {
    name: "createRefund",
    label: "Create Refund",
    description: CREATE_REFUND_DESCRIPTION,
    parameters: createRefundParameters,
    execute: async (_toolCallId: string, args: CreateRefundArgs) => {
      const refund = await createRefund({
        invoiceId: args.invoiceId,
        amount: args.amount,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(refund) }],
        details: refund,
      };
    },
  },
];

export function createRefundAgent(options?: { model?: FoobarRefundModel }) {
  return new Agent({
    initialState: {
      systemPrompt: REFUND_SYSTEM_PROMPT,
      model: getModel("anthropic", options?.model ?? DEFAULT_REFUND_MODEL),
      thinkingLevel: "off",
      tools: foobarTools,
    },
    toolExecution: "sequential",
  });
}

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

function extractJsonObjectText(text: string) {
  const start = text.indexOf("{");
  if (start === -1) {
    return text;
  }

  const end = text.lastIndexOf("}");
  if (end <= start) {
    return text;
  }

  return text.slice(start, end + 1);
}

function stripMarkdownFence(text: string) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  const afterFence = trimmed.slice(3);
  let contentStart = 3;
  if (afterFence.toLowerCase().startsWith("json")) {
    contentStart += "json".length;
  } else if (!isWhitespace(afterFence[0])) {
    return trimmed;
  }

  const closingFenceStart = trimmed.lastIndexOf("```");
  if (closingFenceStart <= contentStart) {
    return trimmed;
  }

  if (trimmed.slice(closingFenceStart + 3).trim().length > 0) {
    return trimmed;
  }

  return trimmed.slice(contentStart, closingFenceStart).trim();
}

function isWhitespace(character: string | undefined) {
  return character === undefined || character.trim() === "";
}
