import { describe, expect, it } from "vitest";
import type { FlueEvent, PromptUsage } from "@flue/runtime";
import {
  createEventCollector,
  aggregateUsage,
  extractModel,
  splitModelId,
  extractOutput,
  type CollectedTurn,
} from "./index";

const mkUsage = (input: number, output: number): PromptUsage => ({
  input,
  output,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: input + output,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
});

describe("createEventCollector", () => {
  it("captures tool calls with args from tool_start", () => {
    const collector = createEventCollector();

    collector.handler({
      type: "tool_start",
      toolName: "lookupInvoice",
      toolCallId: "tc_1",
      args: { invoiceId: "inv_123" },
    } as FlueEvent);

    collector.handler({
      type: "tool_call",
      toolName: "lookupInvoice",
      toolCallId: "tc_1",
      isError: false,
      result: { content: [{ type: "text", text: '{"amount":42}' }] },
      durationMs: 10,
    } as FlueEvent);

    expect(collector.toolCalls).toEqual([
      {
        name: "lookupInvoice",
        arguments: { invoiceId: "inv_123" },
        result: '{"amount":42}',
        error: undefined,
      },
    ]);
  });

  it("captures tool errors", () => {
    const collector = createEventCollector();

    collector.handler({
      type: "tool_start",
      toolName: "lookupInvoice",
      toolCallId: "tc_1",
      args: { invoiceId: "bad" },
    } as FlueEvent);

    collector.handler({
      type: "tool_call",
      toolName: "lookupInvoice",
      toolCallId: "tc_1",
      isError: true,
      result: { content: [{ type: "text", text: "Invoice not found" }] },
      durationMs: 5,
    } as FlueEvent);

    expect(collector.toolCalls).toEqual([
      {
        name: "lookupInvoice",
        arguments: { invoiceId: "bad" },
        result: undefined,
        error: "Invoice not found",
      },
    ]);
  });

  it("filters out finish and give_up tools", () => {
    const collector = createEventCollector();

    collector.handler({
      type: "tool_start",
      toolName: "lookupInvoice",
      toolCallId: "tc_1",
      args: {},
    } as FlueEvent);
    collector.handler({
      type: "tool_call",
      toolName: "lookupInvoice",
      toolCallId: "tc_1",
      isError: false,
      result: { content: [{ type: "text", text: "ok" }] },
      durationMs: 10,
    } as FlueEvent);

    collector.handler({
      type: "tool_start",
      toolName: "finish",
      toolCallId: "tc_2",
      args: { status: "approved" },
    } as FlueEvent);
    collector.handler({
      type: "tool_call",
      toolName: "finish",
      toolCallId: "tc_2",
      isError: false,
      result: { content: [{ type: "text", text: "Result accepted." }] },
      durationMs: 1,
    } as FlueEvent);

    collector.handler({
      type: "tool_start",
      toolName: "give_up",
      toolCallId: "tc_3",
      args: { reason: "cannot" },
    } as FlueEvent);
    collector.handler({
      type: "tool_call",
      toolName: "give_up",
      toolCallId: "tc_3",
      isError: false,
      result: { content: [{ type: "text", text: "Acknowledged." }] },
      durationMs: 1,
    } as FlueEvent);

    expect(collector.toolCalls).toHaveLength(1);
    expect(collector.toolCalls[0]!.name).toBe("lookupInvoice");
  });

  it("collects turn usage and model", () => {
    const collector = createEventCollector();

    collector.handler({
      type: "turn",
      model: "claude-sonnet-4-6",
      usage: mkUsage(500, 200),
      durationMs: 3000,
      isError: false,
    } as FlueEvent);

    expect(collector.turns).toHaveLength(1);
    expect(collector.turns[0]!.model).toBe("claude-sonnet-4-6");
    expect(collector.turns[0]!.usage?.totalTokens).toBe(700);
  });

  it("handles tool_call without preceding tool_start", () => {
    const collector = createEventCollector();

    collector.handler({
      type: "tool_call",
      toolName: "orphan",
      toolCallId: "tc_x",
      isError: false,
      result: { content: [{ type: "text", text: "ok" }] },
      durationMs: 5,
    } as FlueEvent);

    expect(collector.toolCalls).toEqual([
      {
        name: "orphan",
        arguments: undefined,
        result: "ok",
        error: undefined,
      },
    ]);
  });
});

describe("aggregateUsage", () => {
  it("sums usage across multiple turns", () => {
    const turns: CollectedTurn[] = [
      { model: "m1", usage: mkUsage(100, 50), durationMs: 1000 },
      { model: "m1", usage: mkUsage(200, 80), durationMs: 2000 },
    ];

    expect(aggregateUsage(turns)).toEqual({
      input: 300,
      output: 130,
      totalTokens: 430,
    });
  });

  it("returns zeros for turns without usage", () => {
    expect(aggregateUsage([{ durationMs: 100 }, { durationMs: 200 }])).toEqual({
      input: 0,
      output: 0,
      totalTokens: 0,
    });
  });

  it("returns zeros for empty turns", () => {
    expect(aggregateUsage([])).toEqual({
      input: 0,
      output: 0,
      totalTokens: 0,
    });
  });
});

describe("extractModel", () => {
  it("returns the first turn model", () => {
    expect(
      extractModel([
        { model: "claude-sonnet-4-6", durationMs: 100 },
        { model: "claude-opus-4", durationMs: 200 },
      ]),
    ).toBe("claude-sonnet-4-6");
  });

  it("skips turns without a model", () => {
    expect(
      extractModel([
        { durationMs: 100 },
        { model: "claude-sonnet-4-6", durationMs: 200 },
      ]),
    ).toBe("claude-sonnet-4-6");
  });

  it("returns undefined when no turns have a model", () => {
    expect(extractModel([{ durationMs: 100 }])).toBeUndefined();
  });

  it("returns undefined for empty array", () => {
    expect(extractModel([])).toBeUndefined();
  });
});

describe("splitModelId", () => {
  it("splits provider/model", () => {
    expect(splitModelId("anthropic/claude-sonnet-4-6")).toEqual([
      "anthropic",
      "claude-sonnet-4-6",
    ]);
  });

  it("handles no slash", () => {
    expect(splitModelId("claude-sonnet-4-6")).toEqual([
      "claude-sonnet-4-6",
      "claude-sonnet-4-6",
    ]);
  });

  it("handles multiple slashes", () => {
    expect(splitModelId("azure/openai/gpt-4")).toEqual([
      "azure",
      "openai/gpt-4",
    ]);
  });
});

describe("extractOutput", () => {
  it("returns data from PromptResultResponse", () => {
    expect(extractOutput({ data: { status: "approved" } } as any)).toEqual({
      status: "approved",
    });
  });

  it("returns text from PromptResponse", () => {
    expect(extractOutput({ text: "hello" } as any)).toBe("hello");
  });

  it("prefers data over text", () => {
    expect(extractOutput({ data: "structured", text: "plain" } as any)).toBe(
      "structured",
    );
  });

  it("returns undefined when neither data nor text", () => {
    expect(extractOutput({} as any)).toBeUndefined();
  });
});
