import { describeEval, ToolCallScorer, StructuredOutputScorer } from "./index";
import { generateText, generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

const weatherTool = {
  description: "Get current weather for a location",
  parameters: z.object({
    location: z.string().describe("The city/location to get weather for"),
  }),
  execute: async ({ location }: { location: string }) => {
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
};

const databaseTool = {
  description: "Look up specific user data from internal database",
  parameters: z.object({
    userId: z.string().describe("The user ID to look up"),
  }),
  execute: async ({ userId }: { userId: string }) => {
    // Only works for user123 - forces correct tool usage
    if (userId !== "user123") {
      throw new Error(`User ${userId} not found in database`);
    }

    // Return fixed data for user123
    return {
      email: "john.doe@company.com",
    };
  },
};

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
      maxSteps: 5,
    });

    return {
      result: text,
      toolCalls: steps
        .flatMap((step) => step.toolCalls)
        .map((call) => ({
          name: call.toolName,
          arguments: call.args,
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

// Test without maxSteps to verify if it's truly required
describeEval("@ai/sdk ToolCallScorer (No maxSteps)", {
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
      // NO maxSteps here
    });

    return {
      result: text,
      toolCalls: steps
        .flatMap((step) => step.toolCalls)
        .map((call) => ({
          name: call.toolName,
          arguments: call.args,
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
