import { describeEval } from "./index";
import { Levenshtein } from "autoevals";

// TODO: Whats the easiest way to ensure these tests actually run?
describeEval("autoevals compatibility", {
  data: async () => [
    {
      input: "What is the capital of France?",
      expected: "Paris",
    },
  ],
  task: async (input: string): Promise<string> => {
    return "Paris";
  },
  scorers: [Levenshtein],
  threshold: 0.8,
});
