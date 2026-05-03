import { Agent, type AgentTool } from "@mariozechner/pi-agent-core";
import {
  Type,
  getModel,
  type AssistantMessage,
  type Static,
} from "@mariozechner/pi-ai";
import type { PiAiRuntime, PiAiToolset } from "@vitest-evals/harness-pi-ai";
import type { HarnessPromptOptions } from "vitest-evals";

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
type RefundAgentModel = "claude-sonnet-4-5";
const DEFAULT_REFUND_MODEL: RefundAgentModel = "claude-sonnet-4-5";
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

const refundAgentTools = {
  lookupInvoice: {
    description: LOOKUP_INVOICE_DESCRIPTION,
    replay: true,
    execute: lookupInvoice,
  },
  createRefund: {
    description: CREATE_REFUND_DESCRIPTION,
    execute: createRefund,
  },
} satisfies PiAiToolset<string, RefundEvalMetadata>;

type RefundAgentRuntime = PiAiRuntime<
  typeof refundAgentTools,
  string,
  RefundEvalMetadata
>;
type RefundAgentRuntimeTools = RefundAgentRuntime["tools"];

const fallbackRuntimeTools: RefundAgentRuntimeTools = {
  lookupInvoice,
  createRefund,
};

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

export class RefundAgent {
  private readonly agent: Agent;
  readonly toolset = refundAgentTools;

  constructor(private readonly model: RefundAgentModel = DEFAULT_REFUND_MODEL) {
    this.agent = new Agent({
      initialState: {
        systemPrompt: REFUND_SYSTEM_PROMPT,
        model: getModel("anthropic", model),
        thinkingLevel: "off",
        tools: createAgentTools(),
      },
      toolExecution: "sequential",
    });
  }

  async run(input: string, runtime: RefundAgentRuntime) {
    await this.agent.reset();
    this.agent.state.systemPrompt = REFUND_SYSTEM_PROMPT;
    this.agent.state.model = getModel("anthropic", this.model);
    this.agent.state.thinkingLevel = "off";
    this.agent.state.tools = createAgentTools(runtime.tools);

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

/** Creates a fresh demo refund agent for one eval run. */
export function createRefundAgent(options?: { model?: RefundAgentModel }) {
  return new RefundAgent(options?.model ?? DEFAULT_REFUND_MODEL);
}

export async function promptRefundModel(
  input: string,
  options?: HarnessPromptOptions,
) {
  const agent = new Agent({
    initialState: {
      systemPrompt: options?.system ?? "",
      model: getModel("anthropic", DEFAULT_REFUND_MODEL),
      thinkingLevel: "off",
      tools: [],
    },
    toolExecution: "sequential",
  });

  await agent.prompt(input);

  const assistant = getFinalAssistantMessage(agent.state.messages);
  const outputText = assistant ? getAssistantText(assistant) : "";
  if (!outputText) {
    throw new Error("Prompt model returned an empty response.");
  }

  return outputText;
}

function createAgentTools(
  runtimeTools: RefundAgentRuntimeTools = fallbackRuntimeTools,
): Array<AgentTool<any, any>> {
  const lookupInvoiceTool: AgentTool<
    typeof lookupInvoiceParameters,
    InvoiceRecord
  > = {
    name: "lookupInvoice",
    label: "Lookup Invoice",
    description: LOOKUP_INVOICE_DESCRIPTION,
    parameters: lookupInvoiceParameters,
    execute: async (_toolCallId, args: LookupInvoiceArgs) => {
      const invoice = await runtimeTools.lookupInvoice({
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
      const refund = await runtimeTools.createRefund({
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
