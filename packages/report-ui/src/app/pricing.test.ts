import { describe, expect, test } from "vitest";
import {
  FALLBACK_PRICING,
  estimateUsageCost,
  estimateWorkspaceCost,
  estimateWorkspaceUsageCost,
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

  test("aggregates token rows and marks mixed models", () => {
    expect(
      estimateWorkspaceUsageCost(
        [
          { model: "gpt-4o-mini", inputTokens: 1_000_000, outputTokens: 0 },
          { model: "gpt-4o", inputTokens: 0, outputTokens: 1_000_000 },
        ],
        FALLBACK_PRICING,
      ),
    ).toMatchObject({
      mixed: true,
      matchedId: "2 models",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      totalUsd: 10.15,
    });
  });
});

describe("cached token pricing", () => {
  test("bills cache hits at the cache-read rate and the rest at input", () => {
    expect(
      estimateUsageCost(
        {
          model: "gpt-4o",
          inputTokens: 1_000_000,
          outputTokens: 0,
          metadata: { cachedInputTokens: 400_000 },
        },
        FALLBACK_PRICING,
      ),
    ).toMatchObject({
      inputTokens: 600_000,
      cachedReadTokens: 400_000,
      pricedCachedReads: true,
      inputUsd: 1.5,
      cachedReadUsd: 0.5,
      totalUsd: 2,
    });
  });
});

describe("formatUsd", () => {
  test("uses four digits for sub-cent eval spends", () => {
    expect(formatUsd(0.009)).toBe("$0.0090");
    expect(formatUsd(0.12)).toBe("$0.120");
  });
});
