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
  costUsd?: number;
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
  /** USD the harness recorded itself; not re-estimated from token rates. */
  recordedUsd: number;
  totalUsd: number;
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
  cacheReadPerMillionUsd?: number;
  cacheWritePerMillionUsd?: number;
  pricedCachedReads: boolean;
  usedTotalTokensFallback: boolean;
  mixed?: boolean;
  /**
   * Usages with tokens or a model that no rate matched. When above zero the
   * total is a lower bound, shown as `≥$X`.
   */
  unpricedUsages: number;
};

export type ReportUiMeta = {
  workspaceRoot?: string;
  /** Eval vitest config found at the workspace root, used for re-runs. */
  evalConfig?: string;
  /** True when the server accepts re-run requests (loopback + workspace). */
  rerunEnabled?: boolean;
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

type RateIndex = {
  byId: Map<string, ModelRate>;
  byNormalizedId: Map<string, ModelRate>;
};

const rateIndexes = new WeakMap<PricingTable, RateIndex>();

/**
 * Finds the best catalog row for a recorded model id. Tries the exact id,
 * then the id without a provider prefix, then a normalized id so
 * `claude-sonnet-4-5-20250929` matches a `claude-sonnet-4.5` row.
 */
export function matchModelRate(
  model: string | undefined,
  table: PricingTable,
): ModelRate | undefined {
  if (!model) {
    return undefined;
  }
  const index = rateIndex(table);
  return (
    index.byId.get(model) ??
    index.byId.get(bareModelId(model)) ??
    index.byNormalizedId.get(normalizeModelId(model))
  );
}

/** Lowercase id without provider prefix, `.` → `-`, or a trailing date. */
function normalizeModelId(model: string): string {
  return bareModelId(model)
    .toLowerCase()
    .replace(/\./g, "-")
    .replace(/-(?:\d{8}|\d{4}-\d{2}-\d{2}|latest)$/, "");
}

function bareModelId(model: string): string {
  return model.split("/").pop() ?? model;
}

function rateIndex(table: PricingTable): RateIndex {
  const cached = rateIndexes.get(table);
  if (cached) {
    return cached;
  }
  const index: RateIndex = { byId: new Map(), byNormalizedId: new Map() };
  for (const row of table.models) {
    setFirst(index.byId, row.id, row);
  }
  // Bare and normalized keys never shadow an exact id.
  for (const row of table.models) {
    setFirst(index.byId, bareModelId(row.id), row);
    setFirst(index.byNormalizedId, normalizeModelId(row.id), row);
  }
  rateIndexes.set(table, index);
  return index;
}

function setFirst(map: Map<string, ModelRate>, key: string, row: ModelRate) {
  if (!map.has(key)) {
    map.set(key, row);
  }
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

/** Uses harness-recorded USD when present; otherwise estimates from token counts, cache hits, and a matched model rate. */
export function estimateUsageCost(
  usage: PricedUsage,
  table: PricingTable,
): UsageCost | undefined {
  if (typeof usage.costUsd === "number" && Number.isFinite(usage.costUsd)) {
    return recordedUsageCost(usage, usage.costUsd);
  }
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
  // AI SDK `inputTokens` is the total input, including cache reads and
  // writes, so both are taken out before pricing the uncached remainder.
  const cachedReads = Math.min(cachedReadTokens(usage), rawInputTokens);
  const writes = Math.min(
    cacheWriteTokens(usage),
    rawInputTokens - cachedReads,
  );
  const uncachedInput = Math.max(0, rawInputTokens - cachedReads - writes);
  const pricedCachedReads =
    cachedReads > 0 && rate.cacheReadPerMillionUsd !== undefined;
  const cachedReadUsd = pricedCachedReads
    ? (cachedReads / 1_000_000) * (rate.cacheReadPerMillionUsd ?? 0)
    : (cachedReads / 1_000_000) * rate.inputPerMillionUsd;
  const inputUsd = (uncachedInput / 1_000_000) * rate.inputPerMillionUsd;
  const cacheWriteUsd =
    (writes / 1_000_000) *
    (rate.cacheWritePerMillionUsd ?? rate.inputPerMillionUsd);
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
    recordedUsd: 0,
    totalUsd: inputUsd + cachedReadUsd + cacheWriteUsd + outputUsd,
    inputPerMillionUsd: rate.inputPerMillionUsd,
    outputPerMillionUsd: rate.outputPerMillionUsd,
    cacheReadPerMillionUsd: rate.cacheReadPerMillionUsd,
    cacheWritePerMillionUsd: rate.cacheWritePerMillionUsd,
    pricedCachedReads,
    usedTotalTokensFallback,
    unpricedUsages: 0,
  };
}

function recordedUsageCost(usage: PricedUsage, costUsd: number): UsageCost {
  return {
    model: usage.model,
    inputTokens: 0,
    cachedReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    inputUsd: 0,
    cachedReadUsd: 0,
    cacheWriteUsd: 0,
    outputUsd: 0,
    recordedUsd: costUsd,
    totalUsd: costUsd,
    inputPerMillionUsd: 0,
    outputPerMillionUsd: 0,
    pricedCachedReads: false,
    usedTotalTokensFallback: false,
    unpricedUsages: 0,
  };
}

/**
 * Sums priced usages with token/USD rows for the cost popovers. Usages no
 * rate matches are counted in `unpricedUsages`, so callers can show the
 * total as a lower bound instead of a silent undercount.
 */
export function estimateWorkspaceUsageCost(
  usages: PricedUsage[],
  table: PricingTable,
): UsageCost | undefined {
  const costs: UsageCost[] = [];
  let unpricedUsages = 0;
  for (const usage of usages) {
    const cost = estimateUsageCost(usage, table);
    if (cost) {
      costs.push(cost);
    } else if (hasBillableUsage(usage)) {
      unpricedUsages += 1;
    }
  }
  if (costs.length === 0) {
    return undefined;
  }

  const matchedIds = new Set(
    costs
      .map((cost) => cost.matchedId)
      .filter((id): id is string => Boolean(id)),
  );
  const mixed = matchedIds.size > 1;
  const first = costs[0]!;
  return {
    model: mixed ? "mixed" : first.model,
    matchedId: mixed ? `${matchedIds.size} models` : first.matchedId,
    inputTokens: sumCost(costs, "inputTokens"),
    cachedReadTokens: sumCost(costs, "cachedReadTokens"),
    cacheWriteTokens: sumCost(costs, "cacheWriteTokens"),
    outputTokens: sumCost(costs, "outputTokens"),
    inputUsd: sumCost(costs, "inputUsd"),
    cachedReadUsd: sumCost(costs, "cachedReadUsd"),
    cacheWriteUsd: sumCost(costs, "cacheWriteUsd"),
    outputUsd: sumCost(costs, "outputUsd"),
    recordedUsd: sumCost(costs, "recordedUsd"),
    totalUsd: sumCost(costs, "totalUsd"),
    inputPerMillionUsd: first.inputPerMillionUsd,
    outputPerMillionUsd: first.outputPerMillionUsd,
    cacheReadPerMillionUsd: first.cacheReadPerMillionUsd,
    cacheWritePerMillionUsd: first.cacheWritePerMillionUsd,
    pricedCachedReads: costs.some((cost) => cost.pricedCachedReads),
    usedTotalTokensFallback: costs.some((cost) => cost.usedTotalTokensFallback),
    mixed,
    unpricedUsages,
  };
}

/** Total USD for display, marked `≥` when some usages had no price. */
export function formatCostTotal(cost: UsageCost | undefined): string {
  if (!cost) {
    return "n/a";
  }
  const total = formatUsd(cost.totalUsd);
  return cost.unpricedUsages > 0 ? `≥${total}` : total;
}

function hasBillableUsage(usage: PricedUsage): boolean {
  return (
    Boolean(usage.model) ||
    (usage.inputTokens ?? 0) > 0 ||
    (usage.outputTokens ?? 0) > 0 ||
    (usage.totalTokens ?? 0) > 0
  );
}

function sumCost(
  costs: UsageCost[],
  key:
    | "inputTokens"
    | "cachedReadTokens"
    | "cacheWriteTokens"
    | "outputTokens"
    | "inputUsd"
    | "cachedReadUsd"
    | "cacheWriteUsd"
    | "outputUsd"
    | "recordedUsd"
    | "totalUsd",
): number {
  return costs.reduce((total, cost) => total + cost[key], 0);
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
