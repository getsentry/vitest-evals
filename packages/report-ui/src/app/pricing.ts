export type ModelRate = {
  id: string;
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
};

export type PricingTable = {
  fetchedAt?: string;
  source: string;
  models: ModelRate[];
};

export type UsageCost = {
  model?: string;
  matchedId?: string;
  inputUsd: number;
  outputUsd: number;
  totalUsd: number;
};

export type ReportUiMeta = {
  workspaceRoot?: string;
  pricing: PricingTable;
};

/** Bundled first-party rates used when the live catalog is unavailable. */
export const FALLBACK_PRICING: PricingTable = {
  source: "fallback",
  models: [
    {
      id: "gemini-1.5-flash",
      inputPerMillionUsd: 0.075,
      outputPerMillionUsd: 0.3,
    },
    { id: "gemini-1.5-pro", inputPerMillionUsd: 1.25, outputPerMillionUsd: 5 },
    {
      id: "gemini-2.0-flash",
      inputPerMillionUsd: 0.1,
      outputPerMillionUsd: 0.4,
    },
    {
      id: "gemini-2.5-flash",
      inputPerMillionUsd: 0.3,
      outputPerMillionUsd: 2.5,
    },
    {
      id: "gemini-2.5-flash-lite",
      inputPerMillionUsd: 0.1,
      outputPerMillionUsd: 0.4,
    },
    { id: "gpt-4o", inputPerMillionUsd: 2.5, outputPerMillionUsd: 10 },
    { id: "gpt-4o-mini", inputPerMillionUsd: 0.15, outputPerMillionUsd: 0.6 },
    { id: "gpt-5.6-terra", inputPerMillionUsd: 1.25, outputPerMillionUsd: 10 },
    { id: "claude-sonnet-4.5", inputPerMillionUsd: 3, outputPerMillionUsd: 15 },
    { id: "claude-sonnet-4", inputPerMillionUsd: 3, outputPerMillionUsd: 15 },
    { id: "claude-3-5-sonnet", inputPerMillionUsd: 3, outputPerMillionUsd: 15 },
  ],
};

/** Finds the best catalog row for a recorded model id. */
export function matchModelRate(
  model: string | undefined,
  table: PricingTable,
): ModelRate | undefined {
  if (!model) {
    return undefined;
  }
  const exact = table.models.find((row) => row.id === model);
  if (exact) {
    return exact;
  }
  const bare = model.split("/").pop() ?? model;
  return (
    table.models.find((row) => row.id === bare) ??
    table.models.find(
      (row) => row.id.endsWith(`/${bare}`) || row.id.endsWith(`/${model}`),
    )
  );
}

/** Estimates input/output USD from token counts and a matched model rate. */
export function estimateUsageCost(
  usage: {
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  },
  table: PricingTable,
): UsageCost | undefined {
  const rate = matchModelRate(usage.model, table);
  if (!rate) {
    return undefined;
  }
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const pricedInputTokens =
    inputTokens === 0 && outputTokens === 0
      ? (usage.totalTokens ?? 0)
      : inputTokens;
  const inputUsd = (pricedInputTokens / 1_000_000) * rate.inputPerMillionUsd;
  const outputUsd = (outputTokens / 1_000_000) * rate.outputPerMillionUsd;
  return {
    model: usage.model,
    matchedId: rate.id,
    inputUsd,
    outputUsd,
    totalUsd: inputUsd + outputUsd,
  };
}

/** Sums priced cases. Unmatched models are skipped. */
export function estimateWorkspaceCost(
  usages: Array<{
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  }>,
  table: PricingTable,
): number | undefined {
  let total = 0;
  let matched = false;
  for (const usage of usages) {
    const cost = estimateUsageCost(usage, table);
    if (!cost) {
      continue;
    }
    matched = true;
    total += cost.totalUsd;
  }
  return matched ? total : undefined;
}

/** Formats a USD estimate with enough digits for eval-sized spends. */
export function formatUsd(amount: number | undefined): string {
  if (amount === undefined) {
    return "n/a";
  }
  if (amount === 0) {
    return "$0.00";
  }
  if (amount < 0.01) {
    return `$${amount.toFixed(4)}`;
  }
  return `$${amount.toFixed(3)}`;
}
