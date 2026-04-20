import { Agent, type AgentTool } from "@mariozechner/pi-agent-core";
import {
  Type,
  getModel,
  type AssistantMessage,
  type Static,
} from "@mariozechner/pi-ai";
import type { PiAiRuntime, PiAiToolset } from "@vitest-evals/harness-pi-ai";

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
};

const LOOKUP_INVOICE_DESCRIPTION =
  "Look up invoice details inside Foobar billing.";
const CREATE_REFUND_DESCRIPTION = "Create a refund for a refundable invoice.";
type FoobarRefundModel = "claude-sonnet-4-5";
const DEFAULT_REFUND_MODEL: FoobarRefundModel = "claude-sonnet-4-5";
const REFUND_SYSTEM_PROMPT = [
  "You are Foobar's refund operations agent.",
  "You must decide whether a refund should be approved for the invoice in the user's request.",
  "Always call lookupInvoice before making a decision.",
  "If the invoice is refundable, call createRefund with the full invoice amount.",
  "If the invoice is not refundable, do not call createRefund.",
  "Return JSON only and do not wrap it in markdown.",
  'Approved shape: {"status":"approved","invoiceId":"...","refundId":"...","amount":4200}',
  'Denied shape: {"status":"denied","invoiceId":"...","reason":"..."}',
].join("\n");

export const foobarTools = {
  lookupInvoice: {
    description: LOOKUP_INVOICE_DESCRIPTION,
    replay: true,
    execute: async ({ invoiceId }: { invoiceId: string }) => {
      const invoices: Record<string, InvoiceRecord> = {
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

      const invoice = invoices[invoiceId];
      if (!invoice) {
        throw new Error(`Invoice ${invoiceId} not found`);
      }

      return invoice;
    },
  },
  createRefund: {
    description: CREATE_REFUND_DESCRIPTION,
    execute: async ({
      invoiceId,
      amount,
    }: {
      invoiceId: string;
      amount: number;
    }) => ({
      refundId: `rf_${invoiceId}`,
      amount,
      status: "submitted",
    }),
  },
} satisfies PiAiToolset<string, RefundCase>;

type FoobarRuntime = PiAiRuntime<typeof foobarTools, string, RefundCase>;

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

export class FoobarRefundAgent {
  private readonly agent: Agent;

  constructor(
    private readonly model: FoobarRefundModel = DEFAULT_REFUND_MODEL,
  ) {
    this.agent = new Agent({
      initialState: {
        systemPrompt: REFUND_SYSTEM_PROMPT,
        model: getModel("anthropic", model),
        thinkingLevel: "off",
      },
      toolExecution: "sequential",
    });
  }

  async run(input: string, runtime: FoobarRuntime) {
    this.agent.reset();
    this.agent.state.systemPrompt = REFUND_SYSTEM_PROMPT;
    this.agent.state.model = getModel("anthropic", this.model);
    this.agent.state.thinkingLevel = "off";
    this.agent.state.tools = createAgentTools(runtime);

    await this.agent.prompt(input);

    const assistant = getFinalAssistantMessage(this.agent.state.messages);
    if (!assistant) {
      throw new Error(
        "Refund agent did not produce a final assistant message.",
      );
    }
    if (assistant.stopReason !== "stop") {
      const providerMessage = assistant.errorMessage
        ? ` ${assistant.errorMessage}`
        : "";
      throw new Error(
        `Refund agent stopped unexpectedly with reason ${assistant.stopReason}.${providerMessage}`,
      );
    }

    const outputText = getAssistantText(assistant);
    if (!outputText) {
      throw new Error("Refund agent returned an empty final response.");
    }

    runtime.events.assistant(outputText, {
      provider: assistant.provider,
      model: assistant.model,
      totalTokens: assistant.usage.totalTokens,
    });

    return {
      decision: parseRefundDecision(outputText),
      metrics: {
        provider: assistant.provider,
        model: assistant.model,
        inputTokens: assistant.usage.input,
        outputTokens: assistant.usage.output,
        totalTokens: assistant.usage.totalTokens,
      },
    };
  }
}

export function createRefundAgent(options?: { model?: FoobarRefundModel }) {
  return new FoobarRefundAgent(options?.model ?? DEFAULT_REFUND_MODEL);
}

function createAgentTools(runtime: FoobarRuntime): Array<AgentTool<any, any>> {
  const lookupInvoiceTool: AgentTool<
    typeof lookupInvoiceParameters,
    InvoiceRecord
  > = {
    name: "lookupInvoice",
    label: "Lookup Invoice",
    description: LOOKUP_INVOICE_DESCRIPTION,
    parameters: lookupInvoiceParameters,
    execute: async (_toolCallId, args: LookupInvoiceArgs) => {
      const invoice = await runtime.tools.lookupInvoice({
        invoiceId: args.invoiceId,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(invoice) }],
        details: invoice,
      };
    },
  };

  const createRefundTool: AgentTool<
    typeof createRefundParameters,
    { refundId: string; amount: number; status: string }
  > = {
    name: "createRefund",
    label: "Create Refund",
    description: CREATE_REFUND_DESCRIPTION,
    parameters: createRefundParameters,
    execute: async (_toolCallId, args: CreateRefundArgs) => {
      const refund = await runtime.tools.createRefund({
        invoiceId: args.invoiceId,
        amount: args.amount,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(refund) }],
        details: refund,
      };
    },
  };

  return [lookupInvoiceTool, createRefundTool];
}

function getFinalAssistantMessage(
  messages: unknown[],
): AssistantMessage | undefined {
  return [...messages]
    .reverse()
    .find((message): message is AssistantMessage =>
      Boolean(
        message &&
          typeof message === "object" &&
          "role" in message &&
          (message as { role?: unknown }).role === "assistant" &&
          "content" in message,
      ),
    );
}

function getAssistantText(message: AssistantMessage) {
  return message.content
    .filter(
      (
        block,
      ): block is Extract<
        AssistantMessage["content"][number],
        { type: "text" }
      > => block.type === "text",
    )
    .map((block) => block.text)
    .join("")
    .trim();
}

function parseRefundDecision(text: string): RefundDecision {
  const cleaned = stripMarkdownFence(text);
  const jsonText = cleaned.match(/\{[\s\S]*\}/)?.[0] ?? cleaned;
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
  const match = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match?.[1]?.trim() ?? text.trim();
}
