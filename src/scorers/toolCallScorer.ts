import type { ScoreFn, BaseScorerOptions } from "../index";

export interface ToolCallScorerOptions extends BaseScorerOptions {
  expectedTools?: string[];
  requireExactOrder?: boolean;
  checkArguments?: boolean;
  argumentMatcher?: (expected: any, actual: any) => boolean;
}

/**
 * A configurable scorer for evaluating tool usage in LLM responses.
 *
 * @param options - Configuration options for the scorer
 * @param options.checkArguments - Whether to validate tool arguments match expected values
 * @param options.requireExactOrder - Whether tools must be called in the exact order specified
 * @param options.argumentMatcher - Custom function to compare expected vs actual arguments
 *
 * @example
 * // Basic usage - just check if tools were called
 * describeEval("tool test", {
 *   data: async () => [{
 *     input: "Search for weather",
 *     expectedTools: ["search", "weather_api"]
 *   }],
 *   task: myTask,
 *   scorers: [ToolCallScorer()]
 * });
 *
 * @example
 * // Strict mode - check order and arguments
 * describeEval("strict tool test", {
 *   data: async () => [{
 *     input: "Search for weather",
 *     expectedTools: ["search", "weather_api"],
 *     expectedArguments: [
 *       { query: "weather" },
 *       { location: "current" }
 *     ]
 *   }],
 *   task: myTask,
 *   scorers: [ToolCallScorer({
 *     requireExactOrder: true,
 *     checkArguments: true
 *   })]
 * });
 */
export function ToolCallScorer(
  options: Partial<ToolCallScorerOptions> = {},
): ScoreFn<ToolCallScorerOptions & { expectedArguments?: any[] }> {
  const {
    requireExactOrder = false,
    checkArguments = false,
    argumentMatcher = (a, b) => JSON.stringify(a) === JSON.stringify(b),
  } = options;

  return async (opts) => {
    // No expectations means pass
    if (!opts.expectedTools || opts.expectedTools.length === 0) {
      return {
        score: 1.0,
        metadata: {
          rationale: "No tool expectations defined",
        },
      };
    }

    // No tool calls when we expected some
    if (!opts.toolCalls || opts.toolCalls.length === 0) {
      return {
        score: 0.0,
        metadata: {
          rationale: `Expected tools: ${opts.expectedTools.join(", ")}, but no tools were called`,
        },
      };
    }

    const actualTools = opts.toolCalls.map((tc) => tc.name);

    // Check exact order if required
    if (requireExactOrder) {
      const orderMatches = opts.expectedTools.every(
        (tool, i) => actualTools[i] === tool,
      );

      if (!orderMatches) {
        return {
          score: 0.0,
          metadata: {
            rationale: `Expected order: ${opts.expectedTools.join(" → ")}, Got: ${actualTools.join(" → ")}`,
          },
        };
      }

      // Check arguments if required and order matches
      if (checkArguments && opts.expectedArguments) {
        const argumentsMatch = opts.toolCalls.every((call, i) => {
          const expected = opts.expectedArguments![i];
          return expected ? argumentMatcher(expected, call.arguments) : true;
        });

        if (!argumentsMatch) {
          return {
            score: 0.5,
            metadata: {
              rationale:
                "Tools called in correct order but with incorrect arguments",
            },
          };
        }
      }

      return {
        score: 1.0,
        metadata: {
          rationale: requireExactOrder
            ? "All tools called in expected order"
            : "All expected tools were called",
        },
      };
    }

    // Check if all expected tools were called (any order)
    const missingTools = opts.expectedTools.filter(
      (tool) => !actualTools.includes(tool),
    );
    const extraTools = actualTools.filter(
      (tool) => !opts.expectedTools!.includes(tool),
    );

    if (missingTools.length > 0) {
      return {
        score: 0.0,
        metadata: {
          rationale: `Missing required tools: ${missingTools.join(", ")}`,
        },
      };
    }

    // All expected tools were called
    return {
      score: 1.0,
      metadata: {
        rationale:
          extraTools.length > 0
            ? `All expected tools called, plus extras: ${extraTools.join(", ")}`
            : "All expected tools were called",
      },
    };
  };
}
