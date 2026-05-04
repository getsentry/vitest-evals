import { openaiAgentsHarness } from "@vitest-evals/harness-openai-agents";
import { expect } from "vitest";
import { type HarnessRun, toolCalls } from "vitest-evals";
import {
  createRefundAgent,
  createRefundRunner,
  parseRefundDecision,
  promptRefundModel,
  resolveResultText,
  type RefundCase,
} from "../src/refundAgent";

export const refundHarness = openaiAgentsHarness({
  createAgent: () => createRefundAgent(),
  createRunner: () => createRefundRunner(),
  prompt: promptRefundModel,
  runOptions: {
    maxTurns: 5,
  },
  toolReplay: {
    lookupInvoice: true,
  },
  normalize: {
    output: ({ result }) => parseRefundDecision(resolveResultText(result)),
  },
});

export async function assertRefundCase(
  run: HarnessRun,
  expected: Pick<RefundCase, "expectedStatus" | "expectedTools">,
) {
  expect(run.output).toMatchObject({
    status: expected.expectedStatus,
  });
  expect(toolCalls(run.session).map((call) => call.name)).toEqual(
    expected.expectedTools,
  );
  expect(run.usage.model).toContain("gpt");
  expect(run.usage.totalTokens).toBeGreaterThan(0);
}
