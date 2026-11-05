import { describe, expect, test } from "vitest";
import {
  FALLBACK_PRICING,
  estimateUsageCost,
  estimateWorkspaceUsageCost,
  formatCostTotal,
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

  test("matches dated snapshots and dash/dot spellings", () => {
    for (const [recorded, row] of [
      ["claude-sonnet-4-5", "claude-sonnet-4.5"],
      ["anthropic/claude-sonnet-4-5-20250929", "claude-sonnet-4.5"],
      ["gpt-4o-2024-08-06", "gpt-4o"],
      ["gpt-4o-mini-2024-07-18", "gpt-4o-mini"],
    ]) {
      expect(matchModelRate(recorded, FALLBACK_PRICING)?.id).toBe(row);
    }
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

describe("cache tokens", () => {
  test("takes cache reads and writes out of input before pricing", () => {
    const cost = estimateUsageCost(
      {
        model: "gpt-4o",
        inputTokens: 1_000_000,
        outputTokens: 0,
        metadata: { cacheReadTokens: 500_000, cacheWriteTokens: 250_000 },
      },
      {
        source: "test",
        sources: [],
        models: [
          {
            id: "gpt-4o",
            inputPerMillionUsd: 4,
            outputPerMillionUsd: 0,
            cacheReadPerMillionUsd: 1,
            cacheWritePerMillionUsd: 8,
          },
        ],
      },
    );
    expect(cost).toMatchObject({
      inputTokens: 250_000,
      cachedReadTokens: 500_000,
      cacheWriteTokens: 250_000,
      inputUsd: 1,
      cachedReadUsd: 0.5,
      cacheWriteUsd: 2,
      totalUsd: 3.5,
    });
  });

  test("prices cache writes at the input rate when no write rate exists", () => {
    expect(
      estimateUsageCost(
        {
          model: "m",
          inputTokens: 1_000_000,
          metadata: { cacheWriteTokens: 1_000_000 },
        },
        {
          source: "test",
          sources: [],
          models: [{ id: "m", inputPerMillionUsd: 3, outputPerMillionUsd: 0 }],
        },
      ),
    ).toMatchObject({ inputUsd: 0, cacheWriteUsd: 3, totalUsd: 3 });
  });
});

describe("estimateWorkspaceUsageCost", () => {
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

    const partial = estimateWorkspaceUsageCost(
      [
        { model: "gpt-4o-mini", inputTokens: 1_000_000, outputTokens: 0 },
        { model: "unknown-model", inputTokens: 1_000_000 },
      ],
      FALLBACK_PRICING,
    );
    expect(partial).toMatchObject({ totalUsd: 0.15, unpricedUsages: 1 });
    expect(formatCostTotal(partial)).toBe("≥$0.150");
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

describe("recorded cost", () => {
  test("uses harness-reported costUsd instead of re-estimating", () => {
    expect(
      estimateUsageCost(
        { model: "gpt-4o", costUsd: 0.42, inputTokens: 1_000_000 },
        FALLBACK_PRICING,
      ),
    ).toMatchObject({ recordedUsd: 0.42, totalUsd: 0.42, inputUsd: 0 });
  });

  test("adds recorded and estimated runs together", () => {
    expect(
      estimateWorkspaceUsageCost(
        [
          { model: "unknown-model", costUsd: 0.5 },
          { model: "gpt-4o", inputTokens: 1_000_000, outputTokens: 0 },
        ],
        FALLBACK_PRICING,
      ),
    ).toMatchObject({ recordedUsd: 0.5, inputUsd: 2.5, totalUsd: 3 });
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
