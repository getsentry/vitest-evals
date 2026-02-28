import { describeEval, ToolCallScorer, StructuredOutputScorer } from "./index";
import { generateText, generateObject, tool, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

const weatherTool = tool({
  description: "Get current weather for a location",
  inputSchema: z.object({
    location: z.string().describe("The city/location to get weather for"),
  }),
  execute: async ({ location }) => {
    // Only works for Seattle - forces correct tool usage
    if (location.toLowerCase() !== "seattle") {
      throw new Error(
        `Weather data only available for Seattle, not ${location}`,
      );
    }

    // Return hardcoded temperature for Seattle
    return {
      temperature: 72,
    };
  },
});

const databaseTool = tool({
  description: "Look up specific user data from internal database",
  inputSchema: z.object({
    userId: z.string().describe("The user ID to look up"),
  }),
  execute: async ({ userId }) => {
    // Only works for user123 - forces correct tool usage
    if (userId !== "user123") {
      throw new Error(`User ${userId} not found in database`);
    }

    // Return fixed data for user123
    return {
      email: "john.doe@company.com",
    };
  },
});

describeEval("@ai/sdk ToolCallScorer", {
  data: async () => [
    {
      input: "What's the weather like in Seattle?",
      expectedTools: [
        { name: "getWeather", arguments: { location: "Seattle" } },
      ],
    },
    {
      input: "What's the email address for user123?",
      expectedTools: [
        {
          name: "lookupUser",
          arguments: { userId: "user123" },
        },
      ],
    },
  ],
  task: async (input) => {
    const { text, steps } = await generateText({
      model: openai("gpt-4o"),
      system: `You are a helpful assistant. You MUST use the provided tools when users ask for information. Do NOT guess, estimate, or make up any data.`,
      prompt: input,
      tools: {
        getWeather: weatherTool,
        lookupUser: databaseTool,
      },
      stopWhen: stepCountIs(5),
    });

    return {
      result: text,
      toolCalls: steps
        .flatMap((step) => step.toolCalls)
        .map((call) => ({
          name: call.toolName,
          arguments: call.input as Record<string, any>,
        })),
    };
  },
  scorers: [
    ToolCallScorer({
      params: "fuzzy", // More flexible matching
      allowExtras: true, // AI might call tools creatively
    }),
  ],
  skipIf: () => !process.env.OPENAI_API_KEY,
});

describeEval("@ai/sdk StructuredOutputScorer", {
  data: async () => [
    {
      input: "Give me the color red, number 42, and set valid to true",
      expected: {
        color: "red",
        number: 42,
        valid: true,
      },
    },
  ],
  task: async (input) => {
    const { object } = await generateObject({
      model: openai("gpt-4o"),
      prompt: input,
      schema: z.object({
        color: z.enum(["red", "blue", "green"]).describe("A color"),
        number: z.number().describe("A number"),
        valid: z.boolean().describe("A boolean value"),
      }),
    });

    return {
      result: JSON.stringify(object),
      toolCalls: [],
    };
  },
  scorers: [
    StructuredOutputScorer({
      match: "strict", // Exact matching for simple values
    }),
  ],
  skipIf: () => !process.env.OPENAI_API_KEY,
});

// Test without stopWhen to verify single-step default behavior
describeEval("@ai/sdk ToolCallScorer (No stopWhen)", {
  data: async () => [
    {
      input: "What's the weather like in Seattle?",
      expectedTools: [
        { name: "getWeather", arguments: { location: "Seattle" } },
      ],
    },
  ],
  task: async (input) => {
    const { text, steps } = await generateText({
      model: openai("gpt-4o"),
      system: `You are a helpful assistant. You MUST use the provided tools when users ask for information. Do NOT guess, estimate, or make up any data.`,
      prompt: input,
      tools: {
        getWeather: weatherTool,
        lookupUser: databaseTool,
      },
      // NO stopWhen here — defaults to stepCountIs(1)
    });

    return {
      result: text,
      toolCalls: steps
        .flatMap((step) => step.toolCalls)
        .map((call) => ({
          name: call.toolName,
          arguments: call.input as Record<string, any>,
        })),
    };
  },
  scorers: [
    ToolCallScorer({
      params: "fuzzy",
      allowExtras: true,
    }),
  ],
  skipIf: () => !process.env.OPENAI_API_KEY,
});
