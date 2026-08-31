import { type ModelRate, type PricingTable, matchModelRate } from "./pricing";

export type ModelSuggestion = {
  fromId: string;
  toId: string;
  sameProvider: boolean;
  savingsRatio: number;
  reason: string;
};

/** Suggests a cheaper catalog model that keeps the used model's capabilities. */
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

  const candidates = table.models.filter(
    (row) => row.id !== used.id && keepsCapabilities(used, row),
  );
  const sameProvider = candidates.filter(
    (row) =>
      Boolean(used.provider) &&
      Boolean(row.provider) &&
      row.provider === used.provider,
  );
  const pool = (sameProvider.length > 0 ? sameProvider : candidates)
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

function suggestionReason(
  used: ModelRate,
  pick: ModelRate,
  savingsRatio: number,
  sameProvider: boolean,
) {
  const parts = [
    sameProvider && used.provider
      ? `same provider (${used.provider})`
      : "cheaper catalog match",
    `~${Math.round(savingsRatio * 100)}% lower blended $/1M`,
  ];
  if (used.toolCall) {
    parts.push("keeps tool calling");
  }
  if (used.reasoning) {
    parts.push("keeps reasoning");
  }
  return parts.join(" · ");
}
