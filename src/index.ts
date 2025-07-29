import { assert, describe, expect, test } from "vitest";
import "vitest";

/**
 * Represents a tool/function call made during task execution.
 * Supports various LLM provider formats and use cases.
 */
export type ToolCall = {
  // Core fields (required for basic usage)
  name: string;
  arguments: Record<string, any>;

  // Result and timing
  result?: any;
  error?: {
    code?: string;
    message: string;
    details?: any;
  };
  timestamp?: number;
  duration_ms?: number;

  // Identification and correlation
  id?: string;
  parent_id?: string; // For nested/chained calls

  // Status tracking
  status?: "pending" | "executing" | "completed" | "failed" | "cancelled";

  // Provider-specific fields
  type?: "function" | "retrieval" | "code_interpreter" | "web_search" | string;

  // Additional metadata
  [key: string]: any; // Allow provider-specific fields
};

export type TaskResult = {
  result: string;
  toolCalls?: ToolCall[];
};

/**
 * Task function that processes an input and returns either a string result
 * or a TaskResult object containing the result and any tool calls made.
 *
 * @param input - The input string to process
 * @returns Promise resolving to either a string or TaskResult object
 *
 * @example
 * // Simple tasks can just return a string
 * const simpleTask: TaskFn = async (input) => "The answer is 42";
 *
 * // Tasks that use tools should return TaskResult
 * const taskWithTools: TaskFn = async (input) => ({
 *   result: "The answer is 42",
 *   toolCalls: [{ name: "calculate", arguments: { expr: "6*7" }, result: 42 }]
 * });
 */
export type TaskFn = (input: string) => Promise<string | TaskResult>;

export type Score = {
  score: number | null;
  metadata?: {
    rationale?: string;
    output?: any;
  } & Record<string, any>;
};

export interface BaseScorerOptions {
  input: string;
  output: string;
  toolCalls?: ToolCall[];
}

export type ScoreFn<TOptions extends BaseScorerOptions = BaseScorerOptions> = (
  opts: TOptions,
) => Promise<Score> | Score;

/**
 * @deprecated Use describeEval() instead for better test organization and multiple scorers support
 */
export type ToEval<R = unknown> = (
  expected: any,
  taskFn: TaskFn,
  scoreFn: ScoreFn<any>,
  threshold?: number,
) => Promise<R>;

export interface EvalMatchers<R = unknown> {
  toEval: ToEval<R>;
}

declare module "vitest" {
  interface Assertion<T = any> extends EvalMatchers<T> {}
  interface AsymmetricMatchersContaining extends EvalMatchers {}

  interface TaskMeta {
    eval?: {
      scores: (Score & { name: string })[];
      avgScore: number;
      toolCalls?: ToolCall[];
    };
  }
}

expect.extend({
  /**
   * Evaluates a language model output against an expected answer using a scoring function.
   *
   * @deprecated Use describeEval() instead for better test organization and multiple scorers support
   * @param expected - The expected (ground truth) answer, can be any type depending on the scorer
   * @param taskFn - Async function that processes the input and returns the model output
   *                 Can return either a string or TaskResult object with result and optional toolCalls
   * @param scoreFn - Function that evaluates the model output against the expected answer
   * @param threshold - Minimum acceptable score (0-1), defaults to 1.0
   *
   * @example
   * ```javascript
   * test("checks capital of France", async () => {
   *   expect("What is the capital of France?").toEval(
   *     "Paris",
   *     async (input) => {
   *       const response = await queryLLM(input);
   *       // Recommended: return TaskResult
   *       return {
   *         result: response.text,
   *         toolCalls: response.toolCalls || []
   *       };
   *     },
   *     checkFactuality,
   *     0.8
   *   );
   * });
   * ```
   */
  // TODO: this needs to be support true extensibility with Eval scorers
  toEval: async function toEval(
    input: string,
    expected: any,
    taskFn: TaskFn,
    scoreFn: ScoreFn<any>,
    threshold = 1.0,
  ) {
    const { isNot } = this;

    const taskOutput = await taskFn(input);
    const output =
      typeof taskOutput === "string" ? taskOutput : taskOutput.result;
    const toolCalls =
      typeof taskOutput === "object" ? taskOutput.toolCalls : undefined;

    let result = scoreFn({ input, expected, output, toolCalls });
    if (result instanceof Promise) {
      result = await result;
    }

    return {
      pass: (result.score ?? 0) >= threshold,
      message: () => formatScores([{ ...result, name: scoreFn.name }]),
    };
  },
});

/**
 * Creates a test suite for evaluating language model outputs.
 *
 * @param name - The name of the test suite
 * @param options - Configuration options
 * @param options.data - Async function that returns an array of test cases with input and any additional fields
 * @param options.task - Function that processes the input and returns the model output
 *                       Can return either a string or TaskResult object with result and optional toolCalls
 * @param options.skipIf - Optional function that determines if tests should be skipped
 * @param options.scorers - Array of scoring functions that evaluate model outputs
 * @param options.threshold - Minimum acceptable average score (0-1), defaults to 1.0
 * @param options.timeout - Test timeout in milliseconds, defaults to 60000 (60s)
 *
 * @example
 * ```javascript
 * // Recommended: TaskResult format with tool tracking
 * describeEval("capital cities test", {
 *   data: async () => [{
 *     input: "What is the capital of France?",
 *     expected: "Paris"
 *   }],
 *   task: async (input) => {
 *     const response = await queryLLM(input);
 *     return {
 *       result: response.text,
 *       toolCalls: response.toolCalls || []
 *     };
 *   },
 *   scorers: [checkFactuality],
 *   threshold: 0.8
 * });
 *
 * // Example with tool usage evaluation
 * describeEval("tool usage test", {
 *   data: async () => [{
 *     input: "Search for weather in Seattle",
 *     expectedTools: [{ name: "weather_api", arguments: { location: "Seattle" } }]
 *   }],
 *   task: async (input) => {
 *     return {
 *       result: "The weather in Seattle is 65°F",
 *       toolCalls: [{
 *         name: "weather_api",
 *         arguments: { location: "Seattle" },
 *         result: { temp: 65, condition: "partly cloudy" }
 *       }]
 *     };
 *   },
 *   scorers: [ToolCallScorer()],
 *   threshold: 1.0
 * });
 * ```
 */
export function describeEval(
  name: string,
  {
    data,
    task,
    skipIf,
    scorers,
    threshold = 1.0,
    // increase default test timeout as 5s is usually not enough for
    // a single factuality check
    timeout = 60000,
  }: {
    data: () => Promise<Array<{ input: string } & Record<string, any>>>;
    task: TaskFn;
    skipIf?: () => boolean;
    scorers: ScoreFn<any>[];
    threshold?: number | null;
    timeout?: number;
  },
) {
  return describe(name, async () => {
    const testFn = skipIf ? test.skipIf(skipIf()) : test;
    // TODO: should data just be a generator?
    for (const { input, ...params } of await data()) {
      testFn(
        input,
        {
          timeout,
        },
        async ({ task: testTask }) => {
          const taskOutput = await task(input);
          const output =
            typeof taskOutput === "string" ? taskOutput : taskOutput.result;
          const toolCalls =
            typeof taskOutput === "object" ? taskOutput.toolCalls : undefined;

          const scores = await Promise.all(
            scorers.map((scorer) => {
              const result = scorer({ input, ...params, output, toolCalls });
              if (result instanceof Promise) {
                return result;
              }
              return new Promise<Score>((resolve) => resolve(result));
            }),
          );
          const scoresWithName = scores.map((s, i) => ({
            ...s,
            name: scorers[i].name,
          }));

          const avgScore =
            scores.reduce((acc, s) => acc + (s.score ?? 0), 0) / scores.length;

          testTask.meta.eval = {
            scores: scoresWithName,
            avgScore,
            ...(toolCalls && { toolCalls }),
          };

          if (threshold) {
            assert(
              avgScore >= threshold,
              `Score: ${avgScore} below threshold: ${threshold}\n\n## Output:\n${wrapText(output)}\n\n${formatScores(
                scoresWithName,
              )}`,
            );
          }
        },
      );
    }
  });
}

export function formatScores(scores: (Score & { name: string })[]) {
  return scores
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
    .map((s) => {
      const scoreLine = `# ${s.name || "Unknown"} [${(s.score ?? 0).toFixed(1)}]`;
      if (
        ((s.score ?? 0) < 1.0 && s.metadata?.rationale) ||
        s.metadata?.output
      ) {
        // Format output - handle both strings and objects
        let formattedOutput = "";
        if (s.metadata?.output !== undefined) {
          const output = s.metadata.output;
          if (typeof output === "string") {
            formattedOutput = `\n\n## Response\n\n${wrapText(output)}`;
          } else {
            // For objects, stringify with proper formatting
            formattedOutput = `\n\n## Response\n\n${wrapText(JSON.stringify(output, null, 2))}`;
          }
        }

        return `${scoreLine}${
          s.metadata?.rationale
            ? `\n\n## Rationale\n\n${wrapText(s.metadata.rationale)}`
            : ""
        }${formattedOutput}`;
      }
      return scoreLine;
    })
    .join("\n\n");
}

/**
 * Wraps text to fit within a specified width, breaking at word boundaries.
 *
 * @param text - The text to wrap
 * @param width - The maximum width in characters (default: 80)
 * @returns The wrapped text with line breaks
 *
 * @example
 * ```javascript
 * const wrapped = wrapText("This is a very long text that needs to be wrapped to fit within an 80 character width.", 20);
 * console.log(wrapped);
 * // Output:
 * // This is a very
 * // long text that
 * // needs to be
 * // wrapped to fit
 * // within an 80
 * // character width.
 * ```
 */
export function wrapText(text: string, width = 80): string {
  if (!text || text.length <= width) {
    return text;
  }

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    // If adding this word would exceed the width, start a new line
    if (currentLine.length + word.length + 1 > width) {
      lines.push(currentLine.trim());
      currentLine = word;
    } else {
      // Add the word to the current line
      currentLine += (currentLine ? " " : "") + word;
    }
  }

  // Add the last line if it's not empty
  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.join("\n");
}

// Export built-in scorers
export {
  ToolCallScorer,
  type ToolCallScorerOptions,
  StructuredOutputScorer,
  type StructuredOutputScorerOptions,
} from "./scorers";
