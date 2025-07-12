import {
  describeEval,
  ToolCallScorer,
  type TaskFn,
  type ScoreFn,
  type ToolCall,
} from "./index";

// This file demonstrates how to integrate vitest-evals with the Vercel AI SDK
// for evaluating LLM responses that use tool calls.

// To run this test:
// 1. Install dependencies: npm install ai @ai-sdk/openai zod
// 2. Set your OPENAI_API_KEY environment variable
// 3. Uncomment the imports below

// import { generateText } from "ai";
// import { openai } from "@ai-sdk/openai";
// import { z } from "zod";

/**
 * Example task that uses the AI SDK with tools.
 * This demonstrates the recommended pattern for tracking tool calls.
 */
const weatherAssistantTask: TaskFn = async (input) => {
  // For testing purposes, we'll mock the AI SDK response
  // In real usage, uncomment the actual implementation below

  // Mock implementation
  if (
    input.toLowerCase().includes("weather") &&
    input.toLowerCase().includes("seattle")
  ) {
    return {
      result:
        "The weather in Seattle is currently 65°F and partly cloudy. It's a typical mild day in the Pacific Northwest.",
      toolCalls: [
        {
          id: "call_1234",
          name: "getWeather",
          arguments: { location: "Seattle", units: "fahrenheit" },
          result: { temperature: 65, condition: "partly cloudy" },
          status: "completed",
          type: "function",
          timestamp: Date.now(),
          duration_ms: 150,
        },
      ],
    };
  }

  if (
    input.toLowerCase().includes("weather") &&
    input.toLowerCase().includes("compare")
  ) {
    const startTime = Date.now();
    return {
      result:
        "Seattle is 65°F and partly cloudy, while New York is 72°F and sunny. New York is warmer and has better weather today.",
      toolCalls: [
        {
          id: "call_5678",
          name: "getWeather",
          arguments: { location: "Seattle", units: "fahrenheit" },
          result: { temperature: 65, condition: "partly cloudy" },
          status: "completed",
          type: "function",
          timestamp: startTime,
          duration_ms: 120,
        },
        {
          id: "call_5679",
          name: "getWeather",
          arguments: { location: "New York", units: "fahrenheit" },
          result: { temperature: 72, condition: "sunny" },
          status: "completed",
          type: "function",
          timestamp: startTime + 130,
          duration_ms: 110,
          parent_id: "call_5678", // Indicates this was called after the first
        },
      ],
    };
  }

  return {
    result: "I can help you check the weather. Please specify a location.",
    toolCalls: [],
  };

  /* Actual AI SDK implementation:
  
  const { text, toolCalls, toolResults } = await generateText({
    model: openai("gpt-4"),
    prompt: input,
    tools: {
      getWeather: {
        description: "Get the current weather for a location",
        parameters: z.object({
          location: z.string().describe("The location to get weather for"),
          units: z.enum(["celsius", "fahrenheit"]).optional().describe("Temperature units")
        }),
        execute: async ({ location, units = "fahrenheit" }) => {
          // In real app, call weather API
          // For demo, return mock data
          const mockWeather = {
            Seattle: { temperature: 65, condition: "partly cloudy" },
            "New York": { temperature: 72, condition: "sunny" },
            London: { temperature: 18, condition: "rainy" }
          };
          
          return mockWeather[location] || { temperature: 70, condition: "unknown" };
        }
      }
    },
    maxSteps: 3, // Allow multiple tool calls
  });
  
  // Transform AI SDK format to our enhanced format
  const formattedToolCalls = toolCalls?.map((call, i) => {
    const result = toolResults?.[i];
    const hasError = result?.error !== undefined;
    
    return {
      id: call.toolCallId,
      name: call.toolName,
      arguments: call.args,
      result: result?.result,
      error: hasError ? {
        message: result.error.message || 'Tool execution failed',
        details: result.error
      } : undefined,
      status: hasError ? 'failed' : 'completed',
      type: 'function',
      // Note: AI SDK doesn't provide timing info, but you could add it:
      // timestamp: Date.now(),
      // duration_ms: calculateDuration(call.startTime)
    };
  }) || [];
  
  return {
    result: text,
    toolCalls: formattedToolCalls
  };
  
  */
};

// Integration test demonstrating tool call evaluation
describeEval("AI SDK Weather Assistant", {
  data: async () => [
    {
      input: "What's the weather like in Seattle?",
      expectedTools: [
        { name: "getWeather", arguments: { location: "Seattle" } },
      ],
    },
    {
      input: "Compare the weather between Seattle and New York",
      expectedTools: [{ name: "getWeather" }, { name: "getWeather" }], // Called twice, don't care about specific args
    },
    {
      input: "Tell me about the weather", // Vague request
      expectedTools: [], // Should not call tools without location
    },
  ],
  task: weatherAssistantTask,
  scorers: [
    // Use the built-in ToolCallScorer with default strict matching
    ToolCallScorer(),

    // Custom scorer for weather-specific validation
    async (opts) => {
      const toolCalls = opts.toolCalls || [];
      const input = opts.input.toLowerCase();

      // Check if location mentioned in input appears in tool calls
      if (input.includes("seattle")) {
        const hasSeattleCall = toolCalls.some(
          (tc: ToolCall) =>
            tc.name === "getWeather" && tc.arguments?.location === "Seattle",
        );

        if (!hasSeattleCall) {
          return {
            score: 0.0,
            metadata: {
              rationale: "Mentioned Seattle but didn't check Seattle weather",
            },
          };
        }
      }

      return {
        score: 1.0,
        metadata: {
          rationale: "Weather locations correctly identified",
        },
      };
    },
  ],
  threshold: 1.0,
  // Skip unless API key is configured
  skipIf: () => !process.env.OPENAI_API_KEY,
});

// Example showing tool argument validation
describeEval("Tool Argument Validation", {
  data: async () => [
    {
      input: "What's the weather in Seattle in Celsius?",
      expectedTools: [
        {
          name: "getWeather",
          arguments: { location: "Seattle", units: "celsius" },
        },
      ],
    },
  ],
  task: async (input) => {
    // Mock response with specific arguments
    return {
      result: "The weather in Seattle is 18°C and partly cloudy.",
      toolCalls: [
        {
          id: "call_9999",
          name: "getWeather",
          arguments: { location: "Seattle", units: "celsius" },
          result: { temperature: 18, condition: "partly cloudy" },
          status: "completed",
          type: "function",
        },
      ],
    };
  },
  scorers: [
    ToolCallScorer({
      params: "strict", // Require exact parameter matching
    }),
  ],
  threshold: 1.0,
});

// Example with custom argument matching
describeEval("Flexible Argument Matching", {
  data: async () => [
    {
      input: "Search for Italian restaurants nearby",
      expectedTools: [
        {
          name: "search_places",
          arguments: { type: "restaurant", cuisine: "italian" },
        },
      ],
    },
  ],
  task: async (input) => {
    return {
      result: "Found 5 Italian restaurants within 1 mile",
      toolCalls: [
        {
          name: "search_places",
          arguments: {
            type: "restaurant",
            cuisine: "Italian", // Different case
            radius: 1,
            units: "miles",
          },
        },
      ],
    };
  },
  scorers: [
    ToolCallScorer({
      params: "fuzzy", // Handles case differences and extra arguments
    }),
  ],
  threshold: 1.0,
});

// Example: Scorer that checks for failed tool calls
const NoFailedToolsScorer: ScoreFn = async (opts) => {
  const toolCalls = opts.toolCalls || [];
  const failedCalls = toolCalls.filter(
    (tc) => tc.status === "failed" || tc.error,
  );

  if (failedCalls.length > 0) {
    return {
      score: 0.0,
      metadata: {
        rationale: `${failedCalls.length} tool call(s) failed: ${failedCalls
          .map((tc) => `${tc.name} - ${tc.error?.message || "unknown error"}`)
          .join(", ")}`,
      },
    };
  }

  return {
    score: 1.0,
    metadata: {
      rationale: "All tool calls completed successfully",
    },
  };
};

// Example: Scorer that checks tool execution time
const PerformanceScorer: ScoreFn = async (opts) => {
  const toolCalls = opts.toolCalls || [];
  const slowCalls = toolCalls.filter(
    (tc) => tc.duration_ms && tc.duration_ms > 1000,
  );

  if (slowCalls.length > 0) {
    return {
      score: 0.5,
      metadata: {
        rationale: `${slowCalls.length} tool call(s) were slow (>1s): ${slowCalls
          .map((tc) => `${tc.name} took ${tc.duration_ms}ms`)
          .join(", ")}`,
      },
    };
  }

  const avgDuration =
    toolCalls
      .filter((tc) => tc.duration_ms)
      .reduce((sum, tc) => sum + (tc.duration_ms || 0), 0) / toolCalls.length ||
    0;

  return {
    score: 1.0,
    metadata: {
      rationale: `All tools executed quickly (avg: ${avgDuration.toFixed(0)}ms)`,
    },
  };
};
