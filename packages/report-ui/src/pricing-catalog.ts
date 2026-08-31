import {
  FALLBACK_PRICING,
  type ModelRate,
  type PricingTable,
} from "./app/pricing";

const MODELS_DEV_URL = "https://models.dev/api.json";
const LITELLM_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
const FIRST_PARTY = new Set(["google", "openai", "anthropic"]);

/** Loads models.dev + LiteLLM pricing, falling back to the bundled table. */
export async function loadPricingTable(): Promise<PricingTable> {
  const [modelsDev, liteLlm] = await Promise.all([
    fetchJson(MODELS_DEV_URL),
    fetchJson(LITELLM_URL),
  ]);
  const models = mergeModelRates(
    modelsDev ? flattenModelsDev(modelsDev) : [],
    liteLlm ? flattenLiteLlm(liteLlm) : [],
  );
  if (models.length === 0) {
    return FALLBACK_PRICING;
  }

  const sources = [
    modelsDev ? MODELS_DEV_URL : undefined,
    liteLlm ? LITELLM_URL : undefined,
  ].filter((source): source is string => Boolean(source));

  return {
    fetchedAt: new Date().toISOString(),
    source: sources.join(" + "),
    models,
  };
}

/** Flattens models.dev provider catalogs into bare-id first-party rates. */
export function flattenModelsDev(catalog: unknown): ModelRate[] {
  if (!isRecord(catalog)) {
    return [];
  }

  const ranked: Array<ModelRate & { priority: number }> = [];
  for (const [providerId, provider] of Object.entries(catalog)) {
    if (!isRecord(provider) || !isRecord(provider.models)) {
      continue;
    }
    const priority = FIRST_PARTY.has(providerId) ? 0 : 1;
    for (const [modelId, model] of Object.entries(provider.models)) {
      if (!isRecord(model) || !isRecord(model.cost)) {
        continue;
      }
      const input = asFiniteNumber(model.cost.input);
      const output = asFiniteNumber(model.cost.output);
      if (input === undefined || output === undefined) {
        continue;
      }
      ranked.push({
        id: modelId.includes("/") ? modelId : `${providerId}/${modelId}`,
        inputPerMillionUsd: input,
        outputPerMillionUsd: output,
        priority,
      });
    }
  }

  ranked.sort((left, right) => left.priority - right.priority);
  const seen = new Set<string>();
  const models: ModelRate[] = [];
  for (const row of ranked) {
    const bare = row.id.split("/").pop() ?? row.id;
    if (seen.has(row.id) || seen.has(bare)) {
      continue;
    }
    seen.add(row.id);
    seen.add(bare);
    models.push({
      id: bare,
      inputPerMillionUsd: row.inputPerMillionUsd,
      outputPerMillionUsd: row.outputPerMillionUsd,
    });
  }
  return models;
}

/** Flattens LiteLLM per-token prices into per-million USD rates. */
export function flattenLiteLlm(catalog: unknown): ModelRate[] {
  if (!isRecord(catalog)) {
    return [];
  }

  const models: ModelRate[] = [];
  const seen = new Set<string>();
  for (const [id, row] of Object.entries(catalog)) {
    if (!isRecord(row)) {
      continue;
    }
    const input = asFiniteNumber(row.input_cost_per_token);
    const output = asFiniteNumber(row.output_cost_per_token);
    if (input === undefined || output === undefined) {
      continue;
    }
    const bare = id.split("/").pop() ?? id;
    if (seen.has(bare)) {
      continue;
    }
    seen.add(bare);
    models.push({
      id: bare,
      inputPerMillionUsd: input * 1_000_000,
      outputPerMillionUsd: output * 1_000_000,
    });
  }
  return models;
}

/** Prefers models.dev rows, then fills gaps from LiteLLM. */
export function mergeModelRates(
  primary: ModelRate[],
  secondary: ModelRate[],
): ModelRate[] {
  const seen = new Set<string>();
  const models: ModelRate[] = [];
  for (const row of [...primary, ...secondary]) {
    const bare = row.id.split("/").pop() ?? row.id;
    if (seen.has(row.id) || seen.has(bare)) {
      continue;
    }
    seen.add(row.id);
    seen.add(bare);
    models.push(row);
  }
  return models;
}

async function fetchJson(url: string): Promise<unknown | undefined> {
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      return undefined;
    }
    return await response.json();
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}
