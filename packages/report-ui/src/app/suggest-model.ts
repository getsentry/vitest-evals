import { type ModelRate, type PricingTable, matchModelRate } from "./pricing";

export type ModelSuggestion = {
  fromId: string;
  toId: string;
  sameProvider: boolean;
  savingsRatio: number;
  reason: string;
};

/** Suggests a cheaper in-family model that keeps the used model's capabilities. */
export function suggestBetterModel(
  model: string | undefined,
  table: PricingTable,
): ModelSuggestion | undefined {
  const used = matchModelRate(model, table);
  if (!used) {
    return undefined;
  }
  const usedCost = blendedCost(used);
  if (usedCost <= 0) {
    return undefined;
  }

  const family = modelFamily(used.id);
  const pool = table.models
    .filter((row) => row.id !== used.id && keepsCapabilities(used, row))
    .filter((row) => modelFamily(row.id) === family)
    .filter((row) => isLiteTier(used.id) || !isLiteTier(row.id))
    .filter((row) => blendedCost(row) <= usedCost * 0.8)
    .sort((left, right) => {
      const providerRank =
        Number(right.provider === used.provider) -
        Number(left.provider === used.provider);
      if (providerRank !== 0) {
        return providerRank;
      }
      return blendedCost(left) - blendedCost(right);
    });
  const pick = pool[0];
  if (!pick) {
    return undefined;
  }
  const savingsRatio = 1 - blendedCost(pick) / usedCost;
  if (savingsRatio < 0.2) {
    return undefined;
  }
  const same = Boolean(used.provider) && pick.provider === used.provider;
  return {
    fromId: used.id,
    toId: pick.id,
    sameProvider: same,
    savingsRatio,
    reason: suggestionReason(used, pick, savingsRatio, same),
  };
}

export function suggestionLabel(suggestion: ModelSuggestion): string {
  const percent = Math.round(suggestion.savingsRatio * 100);
  return `Try ${suggestion.toId} — ~${percent}% cheaper${suggestion.sameProvider ? ", same provider" : ""}`;
}

function keepsCapabilities(used: ModelRate, candidate: ModelRate) {
  if (used.toolCall && !candidate.toolCall) {
    return false;
  }
  if (used.reasoning && !candidate.reasoning) {
    return false;
  }
  if (
    used.context !== undefined &&
    candidate.context !== undefined &&
    candidate.context < used.context
  ) {
    return false;
  }
  return true;
}

function blendedCost(rate: ModelRate) {
  return (rate.inputPerMillionUsd + rate.outputPerMillionUsd) / 2;
}

function isLiteTier(id: string) {
  return /(?:^|[-/.])(lite|mini|nano|haiku)\b/i.test(id);
}

function modelFamily(id: string) {
  const bare = id.split("/").pop() ?? id;
  const tokens = bare.split("-");
  if (tokens.length >= 2 && /^\d/.test(tokens[1] ?? "")) {
    return tokens.slice(0, 2).join("-");
  }
  return tokens[0] ?? bare;
}

function suggestionReason(
  used: ModelRate,
  pick: ModelRate,
  savingsRatio: number,
  sameProvider: boolean,
) {
  const parts = [
    `same family (${modelFamily(used.id)})`,
    sameProvider && used.provider
      ? `same provider (${used.provider})`
      : undefined,
    `~${Math.round(savingsRatio * 100)}% lower blended $/1M`,
  ].filter(Boolean);
  if (used.toolCall) {
    parts.push("keeps tool calling");
  }
  if (used.reasoning) {
    parts.push("keeps reasoning");
  }
  return parts.join(" · ");
}
