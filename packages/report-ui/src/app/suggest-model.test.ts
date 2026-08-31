import { describe, expect, test } from "vitest";
import { FALLBACK_PRICING, type PricingTable } from "./pricing";
import { suggestBetterModel, suggestionLabel } from "./suggest-model";

describe("suggestBetterModel", () => {
  test("does not down-tier a standard model to lite", () => {
    expect(
      suggestBetterModel("gemini-2.5-flash", FALLBACK_PRICING),
    ).toBeUndefined();
  });

  test("suggests a cheaper in-family non-lite model", () => {
    const table: PricingTable = {
      source: "test",
      sources: [],
      models: [
        {
          id: "gemini-2.5-pro",
          provider: "google",
          toolCall: true,
          inputPerMillionUsd: 1.25,
          outputPerMillionUsd: 10,
        },
        {
          id: "gemini-2.5-flash",
          provider: "google",
          toolCall: true,
          inputPerMillionUsd: 0.15,
          outputPerMillionUsd: 0.6,
        },
        {
          id: "gemini-2.5-flash-lite",
          provider: "google",
          toolCall: true,
          inputPerMillionUsd: 0.1,
          outputPerMillionUsd: 0.4,
        },
      ],
    };
    const suggestion = suggestBetterModel("gemini-2.5-pro", table);
    expect(suggestion).toMatchObject({
      fromId: "gemini-2.5-pro",
      toId: "gemini-2.5-flash",
      sameProvider: true,
    });
    expect(suggestionLabel(suggestion!)).toContain("gemini-2.5-flash");
  });

  test("does not suggest a regional lite id in the same family", () => {
    const table: PricingTable = {
      source: "test",
      sources: [],
      models: [
        {
          id: "gemini-3.5-flash",
          provider: "google",
          toolCall: true,
          inputPerMillionUsd: 0.3,
          outputPerMillionUsd: 2.5,
        },
        {
          id: "gemini-3.5-flash-lite@us",
          provider: "google",
          toolCall: true,
          inputPerMillionUsd: 0.1,
          outputPerMillionUsd: 0.4,
        },
      ],
    };
    expect(suggestBetterModel("gemini-3.5-flash", table)).toBeUndefined();
  });

  test("returns nothing when the model is already the cheap option", () => {
    expect(suggestBetterModel("gpt-4o-mini", FALLBACK_PRICING)).toBeUndefined();
  });
});
