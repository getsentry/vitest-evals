import { expect } from "vitest";
import { describeEval, toolCalls } from "vitest-evals";
import { aiSdkHarness } from "./index";

const generateTextLikeResult = {
  text: '{"status":"approved","invoiceId":"inv_123","refundId":"rf_inv_123"}',
  steps: [
    {
      stepNumber: 0,
      model: {
        provider: "openai",
        modelId: "gpt-4o-mini",
      },
      text: "",
      content: [],
      reasoningText: undefined,
      finishReason: "tool-calls",
      rawFinishReason: "tool_calls",
      toolCalls: [
        {
          type: "tool-call",
          toolCallId: "call_lookup",
          toolName: "lookupInvoice",
          input: {
            invoiceId: "inv_123",
          },
        },
        {
          type: "tool-call",
          toolCallId: "call_refund",
          toolName: "createRefund",
          input: {
            invoiceId: "inv_123",
            amount: 4200,
          },
        },
      ],
      toolResults: [
        {
          type: "tool-result",
          toolCallId: "call_lookup",
          toolName: "lookupInvoice",
          input: {
            invoiceId: "inv_123",
          },
          output: {
            invoiceId: "inv_123",
            refundable: true,
          },
        },
        {
          type: "tool-result",
          toolCallId: "call_refund",
          toolName: "createRefund",
          input: {
            invoiceId: "inv_123",
            amount: 4200,
          },
          output: {
            refundId: "rf_inv_123",
            status: "submitted",
          },
        },
      ],
      usage: {
        inputTokens: 10,
        inputTokenDetails: {
          noCacheTokens: 10,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        outputTokens: 4,
        outputTokenDetails: {
          textTokens: 4,
          reasoningTokens: 0,
        },
        totalTokens: 14,
      },
      response: {
        messages: [],
      },
    },
    {
      stepNumber: 1,
      model: {
        provider: "openai",
        modelId: "gpt-4o-mini",
      },
      text: '{"status":"approved","invoiceId":"inv_123","refundId":"rf_inv_123"}',
      content: [],
      reasoningText: undefined,
      finishReason: "stop",
      rawFinishReason: "stop",
      toolCalls: [],
      toolResults: [],
      usage: {
        inputTokens: 3,
        inputTokenDetails: {
          noCacheTokens: 3,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        outputTokens: 4,
        outputTokenDetails: {
          textTokens: 4,
          reasoningTokens: 0,
        },
        totalTokens: 7,
      },
      response: {
        messages: [],
      },
    },
  ],
  totalUsage: {
    inputTokens: 13,
    inputTokenDetails: {
      noCacheTokens: 13,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    outputTokens: 8,
    outputTokenDetails: {
      textTokens: 8,
      reasoningTokens: 0,
    },
    totalTokens: 21,
  },
} as const;

describeEval("ai-sdk harness adapter", {
  data: async () => [
    {
      input: "Refund invoice inv_123",
    },
  ],
  harness: aiSdkHarness({
    run: async () => ({
      ...generateTextLikeResult,
      object: {
        status: "approved",
        invoiceId: "inv_123",
        refundId: "rf_inv_123",
      },
    }),
  }),
  test: async ({ run, session }) => {
    expect(run.output).toEqual({
      status: "approved",
      invoiceId: "inv_123",
      refundId: "rf_inv_123",
    });
    expect(run.usage).toMatchObject({
      provider: "openai",
      model: "gpt-4o-mini",
      totalTokens: 21,
      toolCalls: 2,
    });
    expect(session.provider).toBe("openai");
    expect(session.model).toBe("gpt-4o-mini");
    expect(session.outputText).toBe(
      '{"status":"approved","invoiceId":"inv_123","refundId":"rf_inv_123"}',
    );
    expect(toolCalls(session)).toMatchObject([
      {
        id: "call_lookup",
        name: "lookupInvoice",
        arguments: {
          invoiceId: "inv_123",
        },
        result: {
          invoiceId: "inv_123",
          refundable: true,
        },
      },
      {
        id: "call_refund",
        name: "createRefund",
        arguments: {
          invoiceId: "inv_123",
          amount: 4200,
        },
        result: {
          refundId: "rf_inv_123",
          status: "submitted",
        },
      },
    ]);
  },
});

describeEval("ai-sdk harness adapter custom entrypoint", {
  data: async () => [
    {
      input: "Generate structured output",
    },
  ],
  harness: aiSdkHarness({
    createAgent: () => ({
      generate: async () => ({
        object: {
          status: "approved",
        },
        steps: [
          {
            stepNumber: 0,
            model: {
              provider: "openai",
              modelId: "gpt-4o-mini",
            },
            text: '{"status":"approved"}',
            content: [],
            reasoningText: undefined,
            finishReason: "stop",
            rawFinishReason: "stop",
            toolCalls: [],
            toolResults: [],
            usage: {
              inputTokens: 5,
              inputTokenDetails: {
                noCacheTokens: 5,
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
              },
              outputTokens: 2,
              outputTokenDetails: {
                textTokens: 2,
                reasoningTokens: 0,
              },
              totalTokens: 7,
            },
            response: {
              messages: [],
            },
          },
        ],
        totalUsage: {
          inputTokens: 5,
          inputTokenDetails: {
            noCacheTokens: 5,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
          outputTokens: 2,
          outputTokenDetails: {
            textTokens: 2,
            reasoningTokens: 0,
          },
          totalTokens: 7,
        },
      }),
    }),
  }),
  test: async ({ run, session }) => {
    expect(run.output).toEqual({
      status: "approved",
    });
    expect(session.outputText).toBe('{"status":"approved"}');
  },
});
