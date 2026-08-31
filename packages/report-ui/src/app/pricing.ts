export type ModelRate = {
  id: string;
  provider?: string;
  toolCall?: boolean;
  reasoning?: boolean;
  context?: number;
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
  cacheReadPerMillionUsd?: number;
  cacheWritePerMillionUsd?: number;
};

export type PricingSource = {
  label: string;
  url: string;
};

export type PricingTable = {
  fetchedAt?: string;
  source: string;
  sources: PricingSource[];
  models: ModelRate[];
};

export type PricedUsage = {
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  metadata?: Record<string, unknown>;
};

export type UsageCost = {
  model?: string;
  matchedId?: string;
  inputTokens: number;
  cachedReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  inputUsd: number;
  cachedReadUsd: number;
  cacheWriteUsd: number;
  outputUsd: number;
  totalUsd: number;
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
  cacheReadPerMillionUsd?: number;
  cacheWritePerMillionUsd?: number;
  pricedCachedReads: boolean;
  usedTotalTokensFallback: boolean;
};

export type ReportUiMeta = {
  workspaceRoot?: string;
  pricing: PricingTable;
};

export const PRICING_SOURCE_LINKS: PricingSource[] = [
  { label: "models.dev", url: "https://models.dev" },
  { label: "models.dev API", url: "https://models.dev/api.json" },
  {
    label: "LiteLLM prices",
    url: "https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json",
  },
];

/** Bundled first-party rates used when the live catalog is unavailable. */
export const FALLBACK_PRICING: PricingTable = {
  source: "fallback",
  sources: PRICING_SOURCE_LINKS,
  models: [
    {
      id: "gemini-1.5-flash",
      provider: "google",
      toolCall: true,
      inputPerMillionUsd: 0.075,
      outputPerMillionUsd: 0.3,
      cacheReadPerMillionUsd: 0.01875,
    },
    {
      id: "gemini-1.5-pro",
      provider: "google",
      toolCall: true,
      inputPerMillionUsd: 1.25,
      outputPerMillionUsd: 5,
    },
    {
      id: "gemini-2.0-flash",
      provider: "google",
      toolCall: true,
      inputPerMillionUsd: 0.1,
      outputPerMillionUsd: 0.4,
      cacheReadPerMillionUsd: 0.025,
    },
    {
      id: "gemini-2.5-flash",
      provider: "google",
      toolCall: true,
      reasoning: true,
      inputPerMillionUsd: 0.3,
      outputPerMillionUsd: 2.5,
      cacheReadPerMillionUsd: 0.075,
    },
    {
      id: "gemini-2.5-flash-lite",
      provider: "google",
      toolCall: true,
      reasoning: true,
      inputPerMillionUsd: 0.1,
      outputPerMillionUsd: 0.4,
      cacheReadPerMillionUsd: 0.025,
    },
    {
      id: "gpt-4o",
      provider: "openai",
      toolCall: true,
      inputPerMillionUsd: 2.5,
      outputPerMillionUsd: 10,
      cacheReadPerMillionUsd: 1.25,
    },
    {
      id: "gpt-4o-mini",
      provider: "openai",
      toolCall: true,
      inputPerMillionUsd: 0.15,
      outputPerMillionUsd: 0.6,
      cacheReadPerMillionUsd: 0.075,
    },
    {
      id: "gpt-5.6-terra",
      provider: "openai",
      toolCall: true,
      reasoning: true,
      inputPerMillionUsd: 1.25,
      outputPerMillionUsd: 10,
    },
    {
      id: "claude-sonnet-4.5",
      provider: "anthropic",
      toolCall: true,
      reasoning: true,
      inputPerMillionUsd: 3,
      outputPerMillionUsd: 15,
      cacheReadPerMillionUsd: 0.3,
      cacheWritePerMillionUsd: 3.75,
    },
    {
      id: "claude-sonnet-4",
      provider: "anthropic",
      toolCall: true,
      reasoning: true,
      inputPerMillionUsd: 3,
      outputPerMillionUsd: 15,
      cacheReadPerMillionUsd: 0.3,
      cacheWritePerMillionUsd: 3.75,
    },
    {
      id: "claude-3-5-sonnet",
      provider: "anthropic",
      toolCall: true,
      inputPerMillionUsd: 3,
      outputPerMillionUsd: 15,
      cacheReadPerMillionUsd: 0.3,
      cacheWritePerMillionUsd: 3.75,
    },
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

/** Reads cache-hit tokens from harness usage or provider metadata. */
export function cachedReadTokens(usage: PricedUsage): number {
  return (
    firstNumber(
      usage.metadata?.cachedInputTokens,
      usage.metadata?.cacheReadTokens,
      usage.metadata?.cacheReadInputTokens,
      usage.metadata?.cached_tokens,
      usage.metadata?.cache_read_input_tokens,
      usage.metadata?.promptCacheHitTokens,
    ) ?? 0
  );
}

/** Reads cache-write / cache-creation tokens from provider metadata. */
export function cacheWriteTokens(usage: PricedUsage): number {
  return (
    firstNumber(
      usage.metadata?.cacheWriteTokens,
      usage.metadata?.cacheCreationTokens,
      usage.metadata?.cache_creation_input_tokens,
      usage.metadata?.cacheWriteInputTokens,
    ) ?? 0
  );
}

/** Estimates USD from token counts, cache hits, and a matched model rate. */
export function estimateUsageCost(
  usage: PricedUsage,
  table: PricingTable,
): UsageCost | undefined {
  const rate = matchModelRate(usage.model, table);
  if (!rate) {
    return undefined;
  }
  const outputTokens = usage.outputTokens ?? 0;
  const reportedInput = usage.inputTokens ?? 0;
  const usedTotalTokensFallback =
    reportedInput === 0 && outputTokens === 0 && (usage.totalTokens ?? 0) > 0;
  const rawInputTokens = usedTotalTokensFallback
    ? (usage.totalTokens ?? 0)
    : reportedInput;
  const cachedReads = Math.min(cachedReadTokens(usage), rawInputTokens);
  const uncachedInput = Math.max(0, rawInputTokens - cachedReads);
  const writes = cacheWriteTokens(usage);
  const pricedCachedReads =
    cachedReads > 0 && rate.cacheReadPerMillionUsd !== undefined;
  const cachedReadUsd = pricedCachedReads
    ? (cachedReads / 1_000_000) * (rate.cacheReadPerMillionUsd ?? 0)
    : (cachedReads / 1_000_000) * rate.inputPerMillionUsd;
  const inputUsd = (uncachedInput / 1_000_000) * rate.inputPerMillionUsd;
  const cacheWriteUsd =
    writes > 0 && rate.cacheWritePerMillionUsd !== undefined
      ? (writes / 1_000_000) * rate.cacheWritePerMillionUsd
      : 0;
  const outputUsd = (outputTokens / 1_000_000) * rate.outputPerMillionUsd;
  return {
    model: usage.model,
    matchedId: rate.id,
    inputTokens: uncachedInput,
    cachedReadTokens: cachedReads,
    cacheWriteTokens: writes,
    outputTokens,
    inputUsd,
    cachedReadUsd,
    cacheWriteUsd,
    outputUsd,
    totalUsd: inputUsd + cachedReadUsd + cacheWriteUsd + outputUsd,
    inputPerMillionUsd: rate.inputPerMillionUsd,
    outputPerMillionUsd: rate.outputPerMillionUsd,
    cacheReadPerMillionUsd: rate.cacheReadPerMillionUsd,
    cacheWritePerMillionUsd: rate.cacheWritePerMillionUsd,
    pricedCachedReads,
    usedTotalTokensFallback,
  };
}

/** Sums priced cases. Unmatched models are skipped. */
export function estimateWorkspaceCost(
  usages: PricedUsage[],
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

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}
