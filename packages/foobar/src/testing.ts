import { expect } from "vitest";
import { type HarnessRun, toolCalls } from "vitest-evals";
import type { RefundCase } from "./index";

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
  expect(run.usage.provider).toContain("anthropic");
  expect(run.usage.model).toContain("claude");
  expect(run.usage.totalTokens).toBeGreaterThan(0);
}
