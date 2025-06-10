import { describe, expect, test, vi, beforeEach } from "vitest";
import {
  annotateJUnitWithScoresData,
  type Score,
  type ToolCall,
} from "./index";

describe("annotateJUnitWithScoresData", () => {
  let mockAnnotate: ReturnType<typeof vi.fn>;
  let mockTestTask: any;

  beforeEach(() => {
    mockAnnotate = vi.fn();
    mockTestTask = {
      context: {
        annotate: mockAnnotate,
      },
      meta: {
        eval: undefined,
      },
    };
  });

  describe("score annotations", () => {
    test("should annotate basic score with value", () => {
      const scores: (Score & { name: string })[] = [
        { name: "Factuality", score: 0.8 },
      ];

      annotateJUnitWithScoresData(mockTestTask, scores);

      expect(mockAnnotate).toHaveBeenCalledWith(
        "0.8",
        "evals.scores.Factuality.value",
      );
    });

    test("should annotate score type as float for numeric scores", () => {
      const scores: (Score & { name: string })[] = [
        { name: "Accuracy", score: 0.75 },
      ];

      annotateJUnitWithScoresData(mockTestTask, scores);

      expect(mockAnnotate).toHaveBeenCalledWith(
        "float",
        "evals.scores.Accuracy.type",
      );
    });

    test("should annotate score type as bool for boolean scores", () => {
      const scores: (Score & { name: string })[] = [
        { name: "IsCorrect", score: true as any },
      ];

      annotateJUnitWithScoresData(mockTestTask, scores);

      expect(mockAnnotate).toHaveBeenCalledWith(
        "bool",
        "evals.scores.IsCorrect.type",
      );
    });

    test("should annotate llm_judge from metadata", () => {
      const scores: (Score & { name: string })[] = [
        {
          name: "Factuality",
          score: 0.9,
          metadata: {
            llm_judge: "gemini_2.5pro",
            rationale: "Good answer",
          },
        },
      ];

      annotateJUnitWithScoresData(mockTestTask, scores);

      expect(mockAnnotate).toHaveBeenCalledWith(
        "gemini_2.5pro",
        "evals.scores.Factuality.llm_judge",
      );
    });

    test("should annotate avg score", () => {
      const scores: (Score & { name: string })[] = [
        { name: "Completeness", score: 0.85 },
      ];

      annotateJUnitWithScoresData(mockTestTask, scores);
    });

    test("should handle null scores", () => {
      const scores: (Score & { name: string })[] = [
        { name: "Unknown", score: null },
      ];

      annotateJUnitWithScoresData(mockTestTask, scores);

      expect(mockAnnotate).toHaveBeenCalledWith(
        "",
        "evals.scores.Unknown.value",
      );
    });

    test("should use score_IDX when name is not available", () => {
      const scores: (Score & { name: string })[] = [
        { name: "", score: 0.7 }, // Empty name
      ];

      annotateJUnitWithScoresData(mockTestTask, scores);

      expect(mockAnnotate).toHaveBeenCalledWith(
        "0.7",
        "evals.scores.score_0.value",
      );
    });

    test("should replace dots in score names with underscores", () => {
      const scores: (Score & { name: string })[] = [
        { name: "my.scorer.name", score: 0.6 },
      ];

      annotateJUnitWithScoresData(mockTestTask, scores);

      expect(mockAnnotate).toHaveBeenCalledWith(
        "0.6",
        "evals.scores.my_scorer_name.value",
      );
    });

    test("should flatten and annotate metadata fields", () => {
      const scores: (Score & { name: string })[] = [
        {
          name: "Detailed",
          score: 0.8,
          metadata: {
            rationale: "Good response",
            output: "Detailed answer",
            nested: {
              field: "value",
              deep: {
                nested: "data",
              },
            },
          },
        },
      ];

      annotateJUnitWithScoresData(mockTestTask, scores);

      expect(mockAnnotate).toHaveBeenCalledWith(
        "Good response",
        "evals.scores.Detailed.metadata.rationale",
      );
      expect(mockAnnotate).toHaveBeenCalledWith(
        "Detailed answer",
        "evals.scores.Detailed.metadata.output",
      );
      expect(mockAnnotate).toHaveBeenCalledWith(
        "value",
        "evals.scores.Detailed.metadata.nested.field",
      );
      expect(mockAnnotate).toHaveBeenCalledWith(
        "data",
        "evals.scores.Detailed.metadata.nested.deep.nested",
      );
    });

    test("should handle multiple scores", () => {
      const scores: (Score & { name: string })[] = [
        { name: "Accuracy", score: 0.9 },
        { name: "Completeness", score: 0.8 },
      ];

      annotateJUnitWithScoresData(mockTestTask, scores);

      expect(mockAnnotate).toHaveBeenCalledWith(
        "0.9",
        "evals.scores.Accuracy.value",
      );
      expect(mockAnnotate).toHaveBeenCalledWith(
        "0.8",
        "evals.scores.Completeness.value",
      );
    });
  });

  describe("toolCalls annotations", () => {
    test("should annotate toolCalls when present", () => {
      const toolCalls: ToolCall[] = [
        {
          name: "getWeather",
          arguments: { location: "Seattle", units: "celsius" },
          result: { temperature: 18, condition: "partly cloudy" },
          status: "completed",
          type: "function",
          id: "call_123",
        },
      ];

      const scores: (Score & { name: string })[] = [
        { name: "ToolUsage", score: 1.0 },
      ];

      annotateJUnitWithScoresData(mockTestTask, scores, toolCalls);

      // Check toolCall annotations
      expect(mockAnnotate).toHaveBeenCalledWith(
        "getWeather",
        "evals.toolCalls.0.name",
      );
      expect(mockAnnotate).toHaveBeenCalledWith(
        "Seattle",
        "evals.toolCalls.0.arguments.location",
      );
      expect(mockAnnotate).toHaveBeenCalledWith(
        "celsius",
        "evals.toolCalls.0.arguments.units",
      );
      expect(mockAnnotate).toHaveBeenCalledWith(
        "18",
        "evals.toolCalls.0.result.temperature",
      );
      expect(mockAnnotate).toHaveBeenCalledWith(
        "partly cloudy",
        "evals.toolCalls.0.result.condition",
      );
      expect(mockAnnotate).toHaveBeenCalledWith(
        "completed",
        "evals.toolCalls.0.status",
      );
      expect(mockAnnotate).toHaveBeenCalledWith(
        "function",
        "evals.toolCalls.0.type",
      );
      expect(mockAnnotate).toHaveBeenCalledWith(
        "call_123",
        "evals.toolCalls.0.id",
      );
    });

    test("should handle multiple toolCalls", () => {
      const toolCalls: ToolCall[] = [
        {
          name: "search",
          arguments: { query: "weather" },
          result: { results: ["result1", "result2"] },
          status: "completed",
        },
        {
          name: "calculate",
          arguments: { expression: "2+2" },
          result: { answer: 4 },
          status: "completed",
        },
      ];

      const scores: (Score & { name: string })[] = [
        { name: "MultiTool", score: 1.0 },
      ];

      annotateJUnitWithScoresData(mockTestTask, scores, toolCalls);

      // Check first toolCall
      expect(mockAnnotate).toHaveBeenCalledWith(
        "search",
        "evals.toolCalls.0.name",
      );
      expect(mockAnnotate).toHaveBeenCalledWith(
        "weather",
        "evals.toolCalls.0.arguments.query",
      );
      expect(mockAnnotate).toHaveBeenCalledWith(
        "result1",
        "evals.toolCalls.0.result.results.0",
      );
      expect(mockAnnotate).toHaveBeenCalledWith(
        "result2",
        "evals.toolCalls.0.result.results.1",
      );

      // Check second toolCall
      expect(mockAnnotate).toHaveBeenCalledWith(
        "calculate",
        "evals.toolCalls.1.name",
      );
      expect(mockAnnotate).toHaveBeenCalledWith(
        "2+2",
        "evals.toolCalls.1.arguments.expression",
      );
      expect(mockAnnotate).toHaveBeenCalledWith(
        "4",
        "evals.toolCalls.1.result.answer",
      );
    });

    test("should handle toolCalls with dots in field names", () => {
      const toolCalls: ToolCall[] = [
        {
          name: "api.call",
          arguments: { "user.id": "123", "data.type": "json" },
          result: { "response.time": 150 },
          status: "completed",
        },
      ];

      const scores: (Score & { name: string })[] = [
        { name: "DotFields", score: 1.0 },
      ];

      annotateJUnitWithScoresData(mockTestTask, scores, toolCalls);

      expect(mockAnnotate).toHaveBeenCalledWith(
        "api.call",
        "evals.toolCalls.0.name",
      );
      expect(mockAnnotate).toHaveBeenCalledWith(
        "123",
        "evals.toolCalls.0.arguments.user_id",
      );
      expect(mockAnnotate).toHaveBeenCalledWith(
        "json",
        "evals.toolCalls.0.arguments.data_type",
      );
      expect(mockAnnotate).toHaveBeenCalledWith(
        "150",
        "evals.toolCalls.0.result.response_time",
      );
    });

    test("should handle toolCalls with nested objects", () => {
      const toolCalls: ToolCall[] = [
        {
          name: "complexTool",
          arguments: {
            config: {
              timeout: 5000,
              retries: 3,
              headers: {
                "Content-Type": "application/json",
              },
            },
          },
          result: {
            data: {
              items: [
                { id: 1, name: "item1" },
                { id: 2, name: "item2" },
              ],
            },
          },
          status: "completed",
        },
      ];

      const scores: (Score & { name: string })[] = [
        { name: "NestedTool", score: 1.0 },
      ];

      annotateJUnitWithScoresData(mockTestTask, scores, toolCalls);

      // Check nested arguments
      expect(mockAnnotate).toHaveBeenCalledWith(
        "5000",
        "evals.toolCalls.0.arguments.config.timeout",
      );
      expect(mockAnnotate).toHaveBeenCalledWith(
        "3",
        "evals.toolCalls.0.arguments.config.retries",
      );
      expect(mockAnnotate).toHaveBeenCalledWith(
        "application/json",
        "evals.toolCalls.0.arguments.config.headers.Content-Type",
      );

      // Check nested results
      expect(mockAnnotate).toHaveBeenCalledWith(
        "1",
        "evals.toolCalls.0.result.data.items.0.id",
      );
      expect(mockAnnotate).toHaveBeenCalledWith(
        "item1",
        "evals.toolCalls.0.result.data.items.0.name",
      );
      expect(mockAnnotate).toHaveBeenCalledWith(
        "2",
        "evals.toolCalls.0.result.data.items.1.id",
      );
      expect(mockAnnotate).toHaveBeenCalledWith(
        "item2",
        "evals.toolCalls.0.result.data.items.1.name",
      );
    });

    test("should not annotate toolCalls when not present", () => {
      const scores: (Score & { name: string })[] = [
        { name: "NoTools", score: 1.0 },
      ];

      annotateJUnitWithScoresData(mockTestTask, scores); // No toolCalls

      // Should not have any toolCalls annotations
      const toolCallAnnotations = mockAnnotate.mock.calls.filter(
        (call: any[]) => call[1].startsWith("evals.toolCalls"),
      );
      expect(toolCallAnnotations).toHaveLength(0);
    });
  });

  describe("edge cases", () => {
    test("should handle empty scores array", () => {
      const scores: (Score & { name: string })[] = [];

      annotateJUnitWithScoresData(mockTestTask, scores);

      // Should not have any score annotations
      const scoreAnnotations = mockAnnotate.mock.calls.filter((call: any[]) =>
        call[1].startsWith("evals.scores"),
      );
      expect(scoreAnnotations).toHaveLength(0);
    });

    test("should handle empty toolCalls array", () => {
      const scores: (Score & { name: string })[] = [
        { name: "Test", score: 1.0 },
      ];
      const toolCalls: ToolCall[] = []; // Empty toolCalls array

      annotateJUnitWithScoresData(mockTestTask, scores, toolCalls);

      // Should not have any toolCalls annotations
      const toolCallAnnotations = mockAnnotate.mock.calls.filter(
        (call: any[]) => call[1].startsWith("evals.toolCalls"),
      );
      expect(toolCallAnnotations).toHaveLength(0);
    });

    test("should handle undefined values in objects", () => {
      const toolCalls: ToolCall[] = [
        {
          name: "testTool",
          arguments: { required: "value", optional: undefined },
          result: { data: null },
          status: "completed",
        },
      ];

      const scores: (Score & { name: string })[] = [
        {
          name: "UndefinedTest",
          score: 0.5,
          metadata: {
            rationale: undefined,
            output: null,
          },
        },
      ];

      annotateJUnitWithScoresData(mockTestTask, scores, toolCalls);

      expect(mockAnnotate).toHaveBeenCalledWith(
        "",
        "evals.toolCalls.0.arguments.optional",
      );
      expect(mockAnnotate).toHaveBeenCalledWith(
        "",
        "evals.toolCalls.0.result.data",
      );
      expect(mockAnnotate).toHaveBeenCalledWith(
        "",
        "evals.scores.UndefinedTest.metadata.rationale",
      );
      expect(mockAnnotate).toHaveBeenCalledWith(
        "",
        "evals.scores.UndefinedTest.metadata.output",
      );
    });

    test("should handle complex nested structures", () => {
      const toolCalls: ToolCall[] = [
        {
          name: "complexTool",
          arguments: {
            nested: {
              deep: {
                deeper: {
                  value: "final",
                },
              },
            },
          },
          result: {
            mixed: {
              string: "text",
              number: 42,
              boolean: true,
            },
          },
          status: "completed",
        },
      ];

      const scores: (Score & { name: string })[] = [
        {
          name: "ComplexTest",
          score: 0.9,
          metadata: {
            nested: {
              data: {
                value: "test",
              },
            },
          },
        },
      ];

      annotateJUnitWithScoresData(mockTestTask, scores, toolCalls);

      // Check deeply nested toolCall arguments
      expect(mockAnnotate).toHaveBeenCalledWith(
        "final",
        "evals.toolCalls.0.arguments.nested.deep.deeper.value",
      );

      // Check mixed result types
      expect(mockAnnotate).toHaveBeenCalledWith(
        "text",
        "evals.toolCalls.0.result.mixed.string",
      );
      expect(mockAnnotate).toHaveBeenCalledWith(
        "42",
        "evals.toolCalls.0.result.mixed.number",
      );
      expect(mockAnnotate).toHaveBeenCalledWith(
        "true",
        "evals.toolCalls.0.result.mixed.boolean",
      );

      // Check nested metadata
      expect(mockAnnotate).toHaveBeenCalledWith(
        "test",
        "evals.scores.ComplexTest.metadata.nested.data.value",
      );
    });

    test("should handle multiple scores with different naming patterns", () => {
      const scores: (Score & { name: string })[] = [
        { name: "NormalScorer", score: 0.8 },
        { name: "", score: 0.7 }, // Empty name
        { name: "scorer.with.dots", score: 0.6 },
        { name: "AnotherScorer", score: 0.9 },
      ];

      annotateJUnitWithScoresData(mockTestTask, scores);

      expect(mockAnnotate).toHaveBeenCalledWith(
        "0.8",
        "evals.scores.NormalScorer.value",
      );
      expect(mockAnnotate).toHaveBeenCalledWith(
        "0.7",
        "evals.scores.score_1.value",
      );
      expect(mockAnnotate).toHaveBeenCalledWith(
        "0.6",
        "evals.scores.scorer_with_dots.value",
      );
      expect(mockAnnotate).toHaveBeenCalledWith(
        "0.9",
        "evals.scores.AnotherScorer.value",
      );
    });
  });
});
