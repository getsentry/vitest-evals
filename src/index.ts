import { assert, describe, expect, type RunnerTestCase, test } from "vitest";
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
    output?: string | null;
    llm_judge?: string;
    [key: string]: any; // Allow additional metadata fields
  };
};

export interface BaseScorerOptions {
  input: string;
  output: string;
  toolCalls?: ToolCall[];
}

export type ScoreFn<TOptions extends BaseScorerOptions = BaseScorerOptions> = (
  opts: TOptions,
) => Promise<Score> | Score;

export type ToEval<R = unknown> = (
  expected: string,
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
      toolCalls?: ToolCall[] | undefined;
    };
  }
}

expect.extend({
  /**
   * Evaluates a language model output against an expected answer using a scoring function.
   *
   * @param expected - The expected (ground truth) answer
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
    expected: string,
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

          // Available for JUnit XML reporter
          annotateJUnitWithScoresData(testTask, scoresWithName, toolCalls);

          // Available for JSON reporter
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
        return `${scoreLine}${
          s.metadata?.rationale
            ? `\n\n## Rationale\n\n${wrapText(s.metadata.rationale)}`
            : ""
        }${s.metadata?.output ? `\n\n## Response\n\n${wrapText(s.metadata.output)}` : ""}`;
      }
      return scoreLine;
    })
    .join("\n\n");
}

/**
 * Annotates JUnit test results with evaluation scores and tool call data for XML reporting.
 *
 * This function adds structured annotations to the test context that can be used by JUnit XML
 * reporters to include evaluation metrics and tool usage information in test reports.
 *
 * The annotations follow a hierarchical schema:
 * - `evals.scores.{SCORE_NAME}.value` - The numeric score value
 * - `evals.scores.{SCORE_NAME}.type` - The data type (float/bool)
 * - `evals.scores.{SCORE_NAME}.llm_judge` - LLM judge reasoning (if available)
 * - `evals.scores.{SCORE_NAME}.metadata.{FIELD}` - Flattened metadata fields
 * - `evals.toolCalls.{INDEX}.{FIELD}` - Tool call data (if present)
 *
 * @param testTask - The Vitest test case to annotate
 * @param scoresWithName - Array of evaluation scores with their names
 * @param toolCalls - Optional array of tool calls made during the test
 *
 * @example
 * ```javascript
 * // In a test case
 * const scores = [{ name: "factuality", score: 0.8, metadata: { rationale: "Good answer" } }];
 * const toolCalls = [{ name: "search", arguments: { query: "weather" } }];
 *
 * annotateJUnitWithScoresData(testTask, scores, toolCalls);
 * // Results in annotations like:
 * // evals.scores.factuality.value = "0.8"
 * // evals.scores.factuality.type = "float"
 * // evals.scores.factuality.metadata.rationale = "Good answer"
 * // evals.toolCalls.0.name = "search"
 * // evals.toolCalls.0.arguments.query = "weather"
 * ```
 */
export function annotateJUnitWithScoresData(
  testTask: RunnerTestCase,
  scoresWithName: (Score & { name: string })[],
  toolCalls?: ToolCall[],
) {
  /**
   * Recursively flattens nested objects into dot-notation keys for JUnit annotations.
   *
   * Converts nested object structures into flat key-value pairs where nested keys
   * are joined with dots. Dots in original keys are replaced with underscores to
   * avoid conflicts with the annotation hierarchy.
   *
   * @param obj - The object to flatten
   * @param prefix - Current key prefix for nested properties
   * @returns Flattened object with dot-notation keys
   *
   * @example
   * ```javascript
   * flattenObject({ a: { b: 1, "c.d": 2 } })
   * // Returns: { "a.b": 1, "a.c_d": 2 }
   *
   * flattenObject({ metadata: { rationale: "Good", details: { confidence: 0.9 } } }, "score")
   * // Returns: { "score.metadata.rationale": "Good", "score.metadata.details.confidence": 0.9 }
   * ```
   */
  function flattenObject(obj: any, prefix = ""): Record<string, any> {
    const flattened: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
      // Replace dots in keys with underscores to avoid conflicts with annotation hierarchy
      const keyNoDots = key.replace(/\./g, "_");
      const newKey = prefix ? `${prefix}.${keyNoDots}` : keyNoDots;

      if (value !== null && typeof value === "object") {
        Object.assign(flattened, flattenObject(value, newKey));
      } else {
        flattened[newKey] = value;
      }
    }

    return flattened;
  }

  // Annotate scores following the schema: evals.scores.SCORE_NAME
  for (let i = 0; i < scoresWithName.length; i++) {
    const score = scoresWithName[i];
    // Scored with no name are listed as "score_0", "score_1", etc.
    const scoreName = score.name.replace(/\./g, "_") || `score_${i}`;

    // Required: value
    testTask.context.annotate(
      String(score.score ?? ""),
      `evals.scores.${scoreName}.value`,
    );

    // Optional: type (infer from score value)
    if (score.score !== null && score.score !== undefined) {
      const scoreType = typeof score.score === "boolean" ? "bool" : "float";
      testTask.context.annotate(scoreType, `evals.scores.${scoreName}.type`);
    }

    // Optional: llm_judge (if available in metadata)
    if (score.metadata?.llm_judge) {
      testTask.context.annotate(
        score.metadata.llm_judge,
        `evals.scores.${scoreName}.llm_judge`,
      );
    }

    // Optional: metadata fields (flattened)
    if (score.metadata) {
      const flattenedMetadata = flattenObject(score.metadata);
      for (const [key, value] of Object.entries(flattenedMetadata)) {
        testTask.context.annotate(
          String(value ?? ""),
          `evals.scores.${scoreName}.metadata.${key}`,
        );
      }
    }
  }

  // Annotate toolCalls if present
  if (toolCalls && toolCalls.length > 0) {
    for (let i = 0; i < toolCalls.length; i++) {
      const toolCall = toolCalls[i];
      const flattenedToolCall = flattenObject(toolCall);

      for (const [key, value] of Object.entries(flattenedToolCall)) {
        const annotationKey = `evals.toolCalls.${i}.${key}`;
        testTask.context.annotate(String(value ?? ""), annotationKey);
      }
    }
  }
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
export { ToolCallScorer, type ToolCallScorerOptions } from "./scorers";
