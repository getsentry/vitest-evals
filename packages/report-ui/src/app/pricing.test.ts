import { describe, expect, test } from "vitest";
import {
  FALLBACK_PRICING,
  estimateUsageCost,
  estimateWorkspaceCost,
  formatUsd,
  matchModelRate,
} from "./pricing";

describe("matchModelRate", () => {
  test("matches a bare model id and a provider-prefixed id", () => {
    expect(matchModelRate("gemini-2.5-flash", FALLBACK_PRICING)?.id).toBe(
      "gemini-2.5-flash",
    );
    expect(
      matchModelRate("google/gemini-2.5-flash", FALLBACK_PRICING)?.id,
    ).toBe("gemini-2.5-flash");
  });
});

describe("estimateUsageCost", () => {
  test("prices one million input and output tokens at the catalog rate", () => {
    expect(
      estimateUsageCost(
        { model: "gpt-4o", inputTokens: 1_000_000, outputTokens: 1_000_000 },
        FALLBACK_PRICING,
      ),
    ).toMatchObject({
      matchedId: "gpt-4o",
      inputUsd: 2.5,
      outputUsd: 10,
      totalUsd: 12.5,
    });
  });
});

describe("estimateWorkspaceCost", () => {
  test("sums matched cases and treats totalTokens as input when split is missing", () => {
    expect(
      estimateUsageCost(
        { model: "gpt-4o-mini", totalTokens: 1_000_000 },
        FALLBACK_PRICING,
      ),
    ).toMatchObject({
      inputUsd: 0.15,
      outputUsd: 0,
      totalUsd: 0.15,
    });

    expect(
      estimateWorkspaceCost(
        [
          { model: "gpt-4o-mini", inputTokens: 1_000_000, outputTokens: 0 },
          { model: "unknown-model", inputTokens: 1_000_000 },
        ],
        FALLBACK_PRICING,
      ),
    ).toBe(0.15);
  });
});

describe("formatUsd", () => {
  test("uses four digits for sub-cent eval spends", () => {
    expect(formatUsd(0.009)).toBe("$0.0090");
    expect(formatUsd(0.12)).toBe("$0.120");
  });
});
