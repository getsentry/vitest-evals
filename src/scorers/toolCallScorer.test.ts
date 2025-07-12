import { expect, test, describe } from "vitest";
import { ToolCallScorer } from "./toolCallScorer";
import type { ToolCall } from "../index";

describe("ToolCallScorer", () => {
  test("passes when no tool expectations defined", async () => {
    const scorer = ToolCallScorer();
    const result = await scorer({
      input: "test",
      output: "result",
    });
    expect(result.score).toBe(1.0);
    expect(result.metadata?.rationale).toContain("No tool expectations");
  });

  test("fails when expected tools but none called", async () => {
    const scorer = ToolCallScorer();
    const result = await scorer({
      input: "test",
      output: "result",
      expectedTools: ["search", "weather_api"],
    });
    expect(result.score).toBe(0.0);
    expect(result.metadata?.rationale).toContain("no tools were called");
  });

  test("passes when all expected tools called", async () => {
    const scorer = ToolCallScorer();
    const toolCalls: ToolCall[] = [
      { name: "search", arguments: { query: "weather" } },
      { name: "weather_api", arguments: { location: "Seattle" } },
    ];
    const result = await scorer({
      input: "test",
      output: "result",
      expectedTools: ["search", "weather_api"],
      toolCalls,
    });
    expect(result.score).toBe(1.0);
    expect(result.metadata?.rationale).toContain(
      "All expected tools were called",
    );
  });

  test("fails when missing required tools", async () => {
    const scorer = ToolCallScorer();
    const toolCalls: ToolCall[] = [
      { name: "search", arguments: { query: "weather" } },
    ];
    const result = await scorer({
      input: "test",
      output: "result",
      expectedTools: ["search", "weather_api"],
      toolCalls,
    });
    expect(result.score).toBe(0.0);
    expect(result.metadata?.rationale).toContain(
      "Missing required tools: weather_api",
    );
  });

  test("passes with extra tools when order not required", async () => {
    const scorer = ToolCallScorer();
    const toolCalls: ToolCall[] = [
      { name: "search", arguments: { query: "weather" } },
      { name: "weather_api", arguments: { location: "Seattle" } },
      { name: "format", arguments: { style: "json" } },
    ];
    const result = await scorer({
      input: "test",
      output: "result",
      expectedTools: ["search", "weather_api"],
      toolCalls,
    });
    expect(result.score).toBe(1.0);
    expect(result.metadata?.rationale).toContain("plus extras: format");
  });

  test("fails when exact order required but not matched", async () => {
    const scorer = ToolCallScorer({ requireExactOrder: true });
    const toolCalls: ToolCall[] = [
      { name: "weather_api", arguments: { location: "Seattle" } },
      { name: "search", arguments: { query: "weather" } },
    ];
    const result = await scorer({
      input: "test",
      output: "result",
      expectedTools: ["search", "weather_api"],
      toolCalls,
    });
    expect(result.score).toBe(0.0);
    expect(result.metadata?.rationale).toContain(
      "Expected order: search → weather_api",
    );
  });

  test("passes when exact order matches", async () => {
    const scorer = ToolCallScorer({ requireExactOrder: true });
    const toolCalls: ToolCall[] = [
      { name: "search", arguments: { query: "weather" } },
      { name: "weather_api", arguments: { location: "Seattle" } },
    ];
    const result = await scorer({
      input: "test",
      output: "result",
      expectedTools: ["search", "weather_api"],
      toolCalls,
    });
    expect(result.score).toBe(1.0);
  });

  test("validates arguments when checkArguments is true", async () => {
    const scorer = ToolCallScorer({
      requireExactOrder: true,
      checkArguments: true,
    });
    const toolCalls: ToolCall[] = [
      { name: "search", arguments: { query: "weather" } },
      { name: "weather_api", arguments: { location: "Seattle" } },
    ];
    const result = await scorer({
      input: "test",
      output: "result",
      expectedTools: ["search", "weather_api"],
      expectedArguments: [
        { query: "weather" },
        { location: "London" }, // Wrong location
      ],
      toolCalls,
    });
    expect(result.score).toBe(0.5);
    expect(result.metadata?.rationale).toContain("incorrect arguments");
  });

  test("custom argument matcher", async () => {
    const scorer = ToolCallScorer({
      requireExactOrder: true,
      checkArguments: true,
      argumentMatcher: (expected, actual) => {
        // Case-insensitive location matching
        if (expected.location && actual.location) {
          return (
            expected.location.toLowerCase() === actual.location.toLowerCase()
          );
        }
        return JSON.stringify(expected) === JSON.stringify(actual);
      },
    });
    const toolCalls: ToolCall[] = [
      { name: "weather_api", arguments: { location: "SEATTLE" } },
    ];
    const result = await scorer({
      input: "test",
      output: "result",
      expectedTools: ["weather_api"],
      expectedArguments: [{ location: "seattle" }],
      toolCalls,
    });
    expect(result.score).toBe(1.0);
  });
});
