import { describeEval } from "./index";
import { init, ClosedQA, Factuality, Levenshtein } from "autoevals";
import OpenAI from "openai";

// const client = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY,
// })

// init({ client });

// TODO: Whats the easiest way to ensure these tests actually run?
describeEval("autoevals Levenshtein", {
  data: async () => [
    {
      input: "What is the capital of France?",
      expected: "Paris",
    },
  ],
  task: async () => {
    return "Paris";
  },
  scorers: [Levenshtein],
  threshold: 1.0,
});

describeEval("autoevals Factuality", {
  data: async () => [
    {
      input: "What is the capital of France?",
      expected: "Paris",
    },
  ],
  task: async () => {
    return "Paris";
  },
  scorers: [Factuality],
  threshold: 1.0,
  skipIf: () => !process.env.OPENAI_API_KEY,
});

describeEval("autoevals ClosedQA", {
  data: async () => [
    {
      input: "What is the capital of France?",
      expected: "Paris",
    },
  ],
  task: async () => {
    return "Paris";
  },
  scorers: [
    ClosedQA.partial({
      criteria:
        "The submission should indicate the correct city, and nothing else.",
    }),
  ],
  threshold: 1.0,
  skipIf: () => !process.env.OPENAI_API_KEY,
});
