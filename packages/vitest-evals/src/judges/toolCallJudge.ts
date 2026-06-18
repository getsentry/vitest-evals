import type { Judge, JudgeContext } from "./types";
import {
  ToolCallScorer,
  type ToolCallScorerConfig,
  type ToolCallScorerOptions,
} from "../internal/toolCallScorer";

/**
 * Expected tool-call shape accepted by `ToolCallJudge()`.
 *
 * @example
 * ```ts
 * const expectedTools: ToolCallJudgeExpectedTool[] = [
 *   "lookupInvoice",
 *   { name: "createRefund", arguments: { invoiceId: "inv_123" } },
 * ];
 * ```
 */
export type ToolCallJudgeExpectedTool =
  | string
  | {
      name: string;
      arguments?: unknown;
    };

/**
 * Configuration for the deterministic tool-call judge.
 *
 * @example
 * ```ts
 * const judge = ToolCallJudge({
 *   ordered: true,
 *   allowExtra: false,
 * });
 * ```
 */
export interface ToolCallJudgeConfig extends ToolCallScorerConfig {
  /** Expected tool calls used by this judge instance. */
  expectedTools?: ToolCallJudgeExpectedTool[];
}

/**
 * Matcher context accepted by `ToolCallJudge()`.
 *
 * @example
 * ```ts
 * await expect(result).toSatisfyJudge(ToolCallJudge(), {
 *   expectedTools: ["lookupInvoice", "createRefund"],
 * });
 * ```
 */
export interface ToolCallJudgeOptions
  extends JudgeContext<any, any, any>,
    Omit<
      ToolCallScorerOptions,
      "input" | "output" | "toolCalls" | "expectedTools"
    > {
  expectedTools?: ToolCallJudgeExpectedTool[];
}

/**
 * Creates a deterministic judge that checks expected tool calls.
 *
 * @param config - Matching behavior shared by every assessment from this judge.
 *
 * @example
 * ```ts
 * describeEval("refund agent", {
 *   harness: refundHarness,
 *   judges: [
 *     ToolCallJudge({
 *       ordered: true,
 *       expectedTools: ["lookupInvoice", "createRefund"],
 *     }),
 *   ],
 * }, (it) => {
 *   it("creates a refund after lookup", async ({ run }) => {
 *     await run("Refund invoice inv_123");
 *   });
 * });
 * ```
 */
export function ToolCallJudge(
  config: ToolCallJudgeConfig = {},
): Judge<ToolCallJudgeOptions> {
  const { expectedTools, ...scorerConfig } = config;
  const scorer = ToolCallScorer(scorerConfig);
  return {
    name: "ToolCallJudge",
    assess: (opts: ToolCallJudgeOptions) => {
      return scorer({
        ...opts,
        input: formatJudgeValue(opts.input),
        output: formatJudgeValue(opts.output),
        expectedTools: normalizeExpectedTools(
          opts.expectedTools ?? expectedTools,
        ),
      });
    },
  };
}

function normalizeExpectedTools(
  expectedTools: ToolCallJudgeExpectedTool[] | undefined,
) {
  return expectedTools?.map((tool) =>
    typeof tool === "string" ? { name: tool } : tool,
  );
}

function formatJudgeValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (value !== undefined) {
    try {
      return JSON.stringify(value) ?? String(value);
    } catch {
      return String(value);
    }
  }

  return "";
}
