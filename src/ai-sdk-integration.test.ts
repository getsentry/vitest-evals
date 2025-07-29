import {
  describeEval,
  ToolCallScorer,
  StructuredOutputScorer,
  type TaskFn,
  type ScoreFn,
  type ToolCall,
} from "./index";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

/**
 * Real AI SDK integration test that demonstrates end-to-end functionality.
 * This shows how vitest-evals works with actual LLM responses.
 *
 * To run: Set OPENAI_API_KEY environment variable and run the test.
 */

// Simple weather tool for demonstration
const weatherTool = {
  description: "Get current weather for a location",
  parameters: z.object({
    location: z.string().describe("The city/location to get weather for"),
    units: z
      .enum(["celsius", "fahrenheit"])
      .optional()
      .describe("Temperature units"),
  }),
  execute: async ({
    location,
    units = "fahrenheit",
  }: { location: string; units?: string }) => {
    // Mock weather data for consistent testing
    const mockWeather: Record<string, any> = {
      seattle: { temperature: 65, condition: "partly cloudy", humidity: 78 },
      "new york": { temperature: 72, condition: "sunny", humidity: 65 },
      london: { temperature: 15, condition: "rainy", humidity: 85 },
      tokyo: { temperature: 22, condition: "clear", humidity: 70 },
    };

    const weather = mockWeather[location.toLowerCase()] || {
      temperature: 70,
      condition: "unknown",
      humidity: 60,
    };

    // Convert to celsius if requested
    if (units === "celsius") {
      weather.temperature = Math.round(((weather.temperature - 32) * 5) / 9);
    }

    return weather;
  },
};

// Math calculator tool for demonstration
const calculatorTool = {
  description: "Perform basic math calculations",
  parameters: z.object({
    operation: z
      .enum(["add", "subtract", "multiply", "divide"])
      .describe("The math operation to perform"),
    a: z.number().describe("First number"),
    b: z.number().describe("Second number"),
  }),
  execute: async ({
    operation,
    a,
    b,
  }: { operation: string; a: number; b: number }) => {
    const operations: Record<string, () => number | null> = {
      add: () => a + b,
      subtract: () => a - b,
      multiply: () => a * b,
      divide: () => (b !== 0 ? a / b : null),
    };

    const result = operations[operation]?.() ?? null;
    return { result, operation: `${a} ${operation} ${b} = ${result}` };
  },
};

/**
 * Task function that uses the actual AI SDK with GPT-4 mini
 */
export const realAiTask: TaskFn = async (input) => {
  const { text, toolCalls, toolResults } = await generateText({
    model: openai("gpt-4o-mini"), // Using GPT-4 mini as requested
    prompt: input,
    tools: {
      getWeather: weatherTool,
      calculate: calculatorTool,
    },
    maxSteps: 3, // Allow chained tool calls
  });

  const formattedToolCalls: ToolCall[] =
    toolCalls?.map((call) => {
      return {
        name: call.toolName,
        arguments: call.args,
      };
    }) || [];

  return {
    result: text,
    toolCalls: formattedToolCalls,
  };
};

/**
 * Simple structured output task that returns JSON
 */
const structuredOutputTask: TaskFn = async (input) => {
  const { text } = await generateText({
    model: openai("gpt-4o-mini"),
    prompt: `${input}

Please respond with ONLY a JSON object in this format:
{
  "animal": "name of the animal",
  "sound": "sound the animal makes",
  "legs": number_of_legs,
  "habitat": "where it lives"
}`,
  });

  return {
    result: text,
    toolCalls: [],
  };
};

// Test suite demonstrating tool call evaluation
describeEval("Real AI SDK - Weather & Math Assistant", {
  data: async () => [
    {
      input: "What's the weather like in Seattle?",
      expectedTools: [
        { name: "getWeather", arguments: { location: "Seattle" } },
      ],
    },
    {
      input: "What's 15 plus 27?",
      expectedTools: [
        { name: "calculate", arguments: { operation: "add", a: 15, b: 27 } },
      ],
    },
    {
      input: "Tell me the weather in London and then calculate 8 times 9",
      expectedTools: [
        { name: "getWeather" }, // Don't care about exact args for this test
        { name: "calculate" },
      ],
    },
    {
      input: "Just say hello", // No tools should be called
      expectedTools: [],
    },
  ],
  task: realAiTask,
  scorers: [
    // Built-in tool call scorer with fuzzy matching for flexibility
    ToolCallScorer({
      params: "fuzzy", // More flexible matching
      allowExtras: true, // AI might call tools creatively
    }),

    // Custom scorer that validates specific tool usage patterns
    async (opts) => {
      const toolCalls = opts.toolCalls || [];
      const input = opts.input.toLowerCase();

      // Check for logical tool usage
      if (
        input.includes("weather") &&
        !toolCalls.some((tc: ToolCall) => tc.name === "getWeather")
      ) {
        return {
          score: 0.0,
          metadata: {
            rationale: "Weather mentioned but getWeather tool not called",
          },
        };
      }

      if (input.includes("calculate") || input.match(/\d+\s*[+\-*/]\s*\d+/)) {
        const hasCalcTool = toolCalls.some(
          (tc: ToolCall) => tc.name === "calculate",
        );
        if (!hasCalcTool) {
          return {
            score: 0.0,
            metadata: {
              rationale:
                "Math calculation requested but calculate tool not called",
            },
          };
        }
      }

      return {
        score: 1.0,
        metadata: {
          rationale: "Tool usage looks good!",
        },
      };
    },
  ],
  threshold: 0.8, // Allow for some flexibility since we're using a real LLM
  skipIf: () => !process.env.OPENAI_API_KEY,
  timeout: 30000, // Give more time for real API calls
});

// Test suite demonstrating structured output evaluation
describeEval("Real AI SDK - Animal Facts (Structured Output)", {
  data: async () => [
    {
      input: "Tell me about a cat",
      expected: {
        animal: "cat",
        sound: "meow",
        legs: 4,
        habitat: "domestic",
      },
    },
    {
      input: "What about a dog?",
      expected: {
        animal: "dog",
        sound: "bark",
        legs: 4,
        // Don't specify habitat to test partial matching
      },
    },
    {
      input: "How about a bird?",
      expected: {
        animal: "bird",
        legs: 2,
        // Using regex for flexible sound matching
        sound: /(chirp|tweet|sing|call)/i,
        habitat: /(tree|nest|sky|air)/i,
      },
    },
  ],
  task: structuredOutputTask,
  scorers: [
    // Structured output scorer with fuzzy matching
    StructuredOutputScorer({
      match: "fuzzy", // Allow flexible matching for strings
      requireAll: false, // Don't require all fields to be present
      allowExtras: true, // AI might add extra fields
    }),

    // Custom scorer that validates animal knowledge
    async (opts) => {
      try {
        const parsed = JSON.parse(opts.output);
        const animal = parsed.animal?.toLowerCase();

        // Basic sanity checks
        if (!animal) {
          return {
            score: 0.0,
            metadata: { rationale: "No animal specified" },
          };
        }

        if (typeof parsed.legs !== "number" || parsed.legs < 0) {
          return {
            score: 0.5,
            metadata: { rationale: "Invalid leg count" },
          };
        }

        // Bonus points for reasonable answers
        const commonAnimals = ["cat", "dog", "bird", "fish", "horse", "cow"];
        const isCommon = commonAnimals.includes(animal);

        return {
          score: isCommon ? 1.0 : 0.8,
          metadata: {
            rationale: isCommon
              ? "Good common animal choice with valid data"
              : "Unusual animal but data looks valid",
          },
        };
      } catch (error) {
        return {
          score: 0.0,
          metadata: { rationale: "Failed to parse JSON output" },
        };
      }
    },
  ],
  threshold: 0.7,
  skipIf: () => !process.env.OPENAI_API_KEY,
  timeout: 20000,
});

// Performance test to show tool execution timing
describeEval("Real AI SDK - Performance Check", {
  data: async () => [
    {
      input: "What's the weather in Tokyo and calculate 100 divided by 4?",
      expectedTools: [
        { name: "getWeather", arguments: { location: "Tokyo" } },
        { name: "calculate", arguments: { operation: "divide", a: 100, b: 4 } },
      ],
    },
  ],
  task: realAiTask,
  scorers: [
    ToolCallScorer(),

    // Performance scorer
    async (opts) => {
      const toolCalls = opts.toolCalls || [];

      // Since AI SDK doesn't provide individual timing info,
      // we'll score based on whether tools were called successfully
      if (toolCalls.length === 0) {
        return {
          score: 1.0,
          metadata: {
            rationale: "No tool calls needed for this task",
          },
        };
      }

      // Check if all expected tool calls have results
      const callsWithResults = toolCalls.filter(
        (tc: ToolCall) => tc.result !== undefined,
      );
      const successRate = callsWithResults.length / toolCalls.length;

      if (successRate === 1.0) {
        return {
          score: 1.0,
          metadata: {
            rationale: `All ${toolCalls.length} tool calls completed with results`,
          },
        };
      }

      if (successRate >= 0.5) {
        return {
          score: 0.8,
          metadata: {
            rationale: `${callsWithResults.length}/${toolCalls.length} tool calls completed successfully`,
          },
        };
      }

      return {
        score: 0.5,
        metadata: {
          rationale: `Only ${callsWithResults.length}/${toolCalls.length} tool calls completed successfully`,
        },
      };
    },
  ],
  threshold: 0.8,
  skipIf: () => !process.env.OPENAI_API_KEY,
  timeout: 30000,
});
