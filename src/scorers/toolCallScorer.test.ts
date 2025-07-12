import { expect, test, describe } from "vitest";
import { ToolCallScorer } from "./toolCallScorer";
import type { ToolCall } from "../index";

describe("ToolCallScorer", () => {
  describe("unordered tools (default)", () => {
    test("passes when all expected tools are called", async () => {
      const scorer = ToolCallScorer();
      const toolCalls: ToolCall[] = [
        { name: "search", arguments: { query: "weather" } },
        { name: "weather_api", arguments: { location: "Seattle" } },
      ];
      const result = await scorer({
        input: "test",
        output: "result",
        expectedTools: [{ name: "search" }, { name: "weather_api" }],
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
        expectedTools: [{ name: "search" }, { name: "weather_api" }],
        toolCalls,
      });
      expect(result.score).toBe(0.0);
      expect(result.metadata?.rationale).toContain(
        "Missing required tool: weather_api",
      );
    });

    test("passes with extra tools when allowed (default)", async () => {
      const scorer = ToolCallScorer();
      const toolCalls: ToolCall[] = [
        { name: "search", arguments: { query: "weather" } },
        { name: "weather_api", arguments: { location: "Seattle" } },
        { name: "format", arguments: { style: "json" } },
      ];
      const result = await scorer({
        input: "test",
        output: "result",
        expectedTools: [{ name: "search" }, { name: "weather_api" }],
        toolCalls,
      });
      expect(result.score).toBe(1.0);
      expect(result.metadata?.rationale).toContain("plus extra: format");
    });

    test("fails with extra tools when not allowed", async () => {
      const scorer = ToolCallScorer({ allowExtras: false });
      const toolCalls: ToolCall[] = [
        { name: "search", arguments: { query: "weather" } },
        { name: "weather_api", arguments: { location: "Seattle" } },
        { name: "format", arguments: { style: "json" } },
      ];
      const result = await scorer({
        input: "test",
        output: "result",
        expectedTools: [{ name: "search" }, { name: "weather_api" }],
        toolCalls,
      });
      expect(result.score).toBe(0.0);
      expect(result.metadata?.rationale).toContain(
        "Unexpected extra tools: format",
      );
    });

    test("partial credit when requireAll is false", async () => {
      const scorer = ToolCallScorer({ requireAll: false });
      const toolCalls: ToolCall[] = [
        { name: "search", arguments: { query: "weather" } },
      ];
      const result = await scorer({
        input: "test",
        output: "result",
        expectedTools: [
          { name: "search" },
          { name: "weather_api" },
          { name: "format" },
        ],
        toolCalls,
      });
      expect(result.score).toBe(1 / 3);
      expect(result.metadata?.matched).toBe(1);
      expect(result.metadata?.total).toBe(3);
    });
  });

  describe("ordered tools", () => {
    test("fails when order is wrong", async () => {
      const scorer = ToolCallScorer({ ordered: true });
      const toolCalls: ToolCall[] = [
        { name: "weather_api", arguments: { location: "Seattle" } },
        { name: "search", arguments: { query: "weather" } },
      ];
      const result = await scorer({
        input: "test",
        output: "result",
        expectedTools: [{ name: "search" }, { name: "weather_api" }],
        toolCalls,
      });
      expect(result.score).toBe(0.0);
      // With allowExtraTools:true (default), it skips weather_api and finds search next,
      // but then weather_api is missing from the sequence
      expect(result.metadata?.rationale).toContain(
        "Missing required tools in sequence: weather_api",
      );
    });

    test("passes when exact order matches", async () => {
      const scorer = ToolCallScorer({ ordered: true });
      const toolCalls: ToolCall[] = [
        { name: "search", arguments: { query: "weather" } },
        { name: "weather_api", arguments: { location: "Seattle" } },
      ];
      const result = await scorer({
        input: "test",
        output: "result",
        expectedTools: [{ name: "search" }, { name: "weather_api" }],
        toolCalls,
      });
      expect(result.score).toBe(1.0);
    });

    test("handles extra tools in ordered mode", async () => {
      const scorer = ToolCallScorer({ ordered: true });
      const toolCalls: ToolCall[] = [
        { name: "init", arguments: {} },
        { name: "search", arguments: { query: "weather" } },
        { name: "cache", arguments: {} },
        { name: "weather_api", arguments: { location: "Seattle" } },
        { name: "cleanup", arguments: {} },
      ];
      const result = await scorer({
        input: "test",
        output: "result",
        expectedTools: [{ name: "search" }, { name: "weather_api" }],
        toolCalls,
      });
      expect(result.score).toBe(1.0);
      expect(result.metadata?.rationale).toContain(
        "All tools called in expected order",
      );
    });

    test("partial credit in ordered mode when requireAll is false", async () => {
      const scorer = ToolCallScorer({ ordered: true, requireAll: false });
      const toolCalls: ToolCall[] = [
        { name: "search", arguments: { query: "weather" } },
        { name: "filter", arguments: {} },
      ];
      const result = await scorer({
        input: "test",
        output: "result",
        expectedTools: [
          { name: "search" },
          { name: "weather_api" },
          { name: "format" },
        ],
        toolCalls,
      });
      expect(result.score).toBe(1 / 3);
      expect(result.metadata?.rationale).toContain("Partial match: 1/3");
      expect(result.metadata?.matched).toBe(1);
      expect(result.metadata?.total).toBe(3);
    });
  });

  describe("argument matching", () => {
    test("fuzzy matching when specified", async () => {
      const scorer = ToolCallScorer({ params: "fuzzy" });
      const toolCalls: ToolCall[] = [
        {
          name: "search",
          arguments: { query: "Weather in SEATTLE", limit: 10 },
        },
      ];
      const result = await scorer({
        input: "test",
        output: "result",
        expectedTools: [
          { name: "search", arguments: { query: "weather in seattle" } },
        ],
        toolCalls,
      });
      expect(result.score).toBe(1.0);
    });

    test("fuzzy matching with numbers", async () => {
      const scorer = ToolCallScorer({ params: "fuzzy" });
      const toolCalls: ToolCall[] = [
        { name: "calculate", arguments: { value: 100.001 } },
      ];
      const result = await scorer({
        input: "test",
        output: "result",
        expectedTools: [{ name: "calculate", arguments: { value: 100 } }],
        toolCalls,
      });
      expect(result.score).toBe(1.0);
    });

    test("fuzzy matching with arrays", async () => {
      const scorer = ToolCallScorer({ params: "fuzzy" });
      const toolCalls: ToolCall[] = [
        {
          name: "filter",
          arguments: { tags: ["weather", "seattle", "today"] },
        },
      ];
      const result = await scorer({
        input: "test",
        output: "result",
        expectedTools: [
          { name: "filter", arguments: { tags: ["seattle", "weather"] } },
        ],
        toolCalls,
      });
      expect(result.score).toBe(1.0);
    });

    test("strict params require exact arguments", async () => {
      const scorer = ToolCallScorer({ params: "strict" });
      const toolCalls: ToolCall[] = [
        { name: "search", arguments: { query: "Weather in SEATTLE" } },
      ];
      const result = await scorer({
        input: "test",
        output: "result",
        expectedTools: [
          { name: "search", arguments: { query: "weather in seattle" } },
        ],
        toolCalls,
      });
      expect(result.score).toBe(0.0);
      expect(result.metadata?.rationale).toContain("incorrect arguments");
    });

    test("strict params pass with exact match", async () => {
      const scorer = ToolCallScorer({ params: "strict" });
      const toolCalls: ToolCall[] = [
        {
          name: "search",
          arguments: { query: "weather", location: "Seattle" },
        },
      ];
      const result = await scorer({
        input: "test",
        output: "result",
        expectedTools: [
          {
            name: "search",
            arguments: { query: "weather", location: "Seattle" },
          },
        ],
        toolCalls,
      });
      expect(result.score).toBe(1.0);
    });

    test("strict params ignore object key order", async () => {
      const scorer = ToolCallScorer({ params: "strict" });
      const toolCalls: ToolCall[] = [
        {
          name: "search",
          arguments: { location: "Seattle", query: "weather", limit: 10 },
        },
      ];
      const result = await scorer({
        input: "test",
        output: "result",
        expectedTools: [
          {
            name: "search",
            arguments: { query: "weather", limit: 10, location: "Seattle" },
          },
        ],
        toolCalls,
      });
      expect(result.score).toBe(1.0);
    });

    test("custom params matcher", async () => {
      const scorer = ToolCallScorer({
        params: (expected, actual) => {
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
        expectedTools: [
          { name: "weather_api", arguments: { location: "seattle" } },
        ],
        toolCalls,
      });
      expect(result.score).toBe(1.0);
    });

    test("detects wrong arguments", async () => {
      const scorer = ToolCallScorer({ params: "fuzzy" });
      const toolCalls: ToolCall[] = [
        { name: "search", arguments: { query: "restaurants" } },
      ];
      const result = await scorer({
        input: "test",
        output: "result",
        expectedTools: [{ name: "search", arguments: { query: "weather" } }],
        toolCalls,
      });
      expect(result.score).toBe(0.0);
      expect(result.metadata?.rationale).toContain(
        "Tool 'search' called but with incorrect arguments",
      );
    });

    test("handles tools without arguments", async () => {
      const scorer = ToolCallScorer();
      const toolCalls: ToolCall[] = [
        { name: "get_current_user", arguments: {} },
        { name: "list_projects" },
      ];
      const result = await scorer({
        input: "test",
        output: "result",
        expectedTools: [
          { name: "get_current_user" },
          { name: "list_projects" },
        ],
        toolCalls,
      });
      expect(result.score).toBe(1.0);
    });
  });

  describe("edge cases", () => {
    test("handles empty expectations", async () => {
      const scorer = ToolCallScorer();
      const result = await scorer({
        input: "test",
        output: "result",
        expectedTools: [],
        toolCalls: [{ name: "search", arguments: {} }],
      });
      expect(result.score).toBe(1.0);
      expect(result.metadata?.rationale).toContain("No tool calls expected");
    });

    test("handles no actual calls when expecting some", async () => {
      const scorer = ToolCallScorer();
      const result = await scorer({
        input: "test",
        output: "result",
        expectedTools: [{ name: "search" }],
        toolCalls: [],
      });
      expect(result.score).toBe(0.0);
      expect(result.metadata?.rationale).toContain(
        "Expected 1 tool(s) but none were called",
      );
    });

    test("handles missing expectedTools", async () => {
      const scorer = ToolCallScorer();
      const result = await scorer({
        input: "test",
        output: "result",
        toolCalls: [{ name: "search", arguments: {} }],
      });
      expect(result.score).toBe(1.0);
    });

    test("handles null/undefined matching", async () => {
      const scorer = ToolCallScorer({ params: "fuzzy" });
      const toolCalls: ToolCall[] = [
        { name: "search", arguments: { query: null, filters: undefined } },
      ];
      const result = await scorer({
        input: "test",
        output: "result",
        expectedTools: [{ name: "search", arguments: { query: null } }],
        toolCalls,
      });
      expect(result.score).toBe(1.0);
    });
  });

  describe("ordered with strict params", () => {
    test("validates arguments in ordered mode", async () => {
      const scorer = ToolCallScorer({ ordered: true, params: "strict" });
      const toolCalls: ToolCall[] = [
        { name: "search", arguments: { query: "weather" } },
        { name: "filter", arguments: { location: "Seattle" } },
      ];
      const result = await scorer({
        input: "test",
        output: "result",
        expectedTools: [
          { name: "search", arguments: { query: "weather" } },
          { name: "filter", arguments: { location: "Portland" } },
        ],
        toolCalls,
      });
      expect(result.score).toBe(0.5);
      expect(result.metadata?.rationale).toContain(
        "Tool 'filter' called with incorrect arguments at position 2",
      );
    });
  });
});
